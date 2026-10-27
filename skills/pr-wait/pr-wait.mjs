#!/usr/bin/env node
// Watches one GitHub pull request and prints one line per event, then exits as soon as the
// pull request needs the agent or is ready. Adapted from tstack's pr-wait (MIT, Theo Browne).
//
//   pr-wait.mjs <pr> [--repo owner/name] [--interval <seconds>] [--timeout <minutes>] [--once]
//   pr-wait.mjs request <pr> [--repo owner/name]
//
// <pr> is a number or a pull request URL. stdout carries events only, one line each, so
// Claude Code's Monitor wakes the agent once per event. Progress and retries go to stderr.
// Because it exits on the first thing to act on, a host without Monitor runs it as one
// foreground command.
//
// Exit codes
//   0  ready: every gating check passed on the head in two polls in a row, every review bot
//      bots.json waits on finished on the head, no unresolved thread ends on someone else's
//      comment, and the branch does not conflict. Also 0 once the pull request merged.
//   1  act: a gating check failed, the branch conflicts, comments or reviews arrived from
//      someone else and stopped arriving, a thread waits on an answer, the pull request
//      closed, or GitHub stayed unreachable
//   2  bad arguments, an unknown pull request, or another watcher already holds this one
//   3  still pending: --timeout ran out, or --once found nothing to act on yet
//
// Gating checks are the base branch's required checks, or every check that is not a review
// bot's when the branch requires none. A required check that has not started counts as pending.
//
// bots.json beside this file comes from `reviewBots` in config.json, one mode per bot: `off`
// ignores it, `wait` waits for it once it shows up on the pull request, `request` also posts
// its review comment. `request` posts that comment for every `request` bot that has none of
// yours since the head commit, so it is safe to run again, and the watcher runs it at start.
//
// State lives in $XDG_STATE_HOME/oner/pr-wait (default ~/.local/state): what was already
// reported, so a watcher started again after a push loses nothing that arrived in between,
// and a pid file, so one pull request has one watcher. The first run for a pull request
// records what already exists and reports only what comes after.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Review bots a repository can run on its side. `login` matches the bot's GitHub account,
// `check` the check run it reports, `trigger` the comment that asks it for a review.
const BOTS = {
  claude: { login: /^claude(\[bot\])?$/i, check: /claude/i, trigger: '@claude review' },
  cursor: { login: /^cursor(\[bot\])?$/i, check: /cursor|bugbot/i, trigger: '@cursor review' },
  codex: { login: /codex/i, check: /codex/i, trigger: '@codex review' },
};
// CI and deploy bots report through checks, so their comments are status, not review.
const STATUS_BOTS = /github-actions|vercel|netlify|railway|cloudflare|codecov|changeset-bot/i;
const STATE_DIR = join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'oner', 'pr-wait');
// A state file this old belongs to an earlier session. Start a fresh baseline instead of
// replaying hours of comments as new events.
const STALE_STATE_MS = 6 * 3600 * 1000;
// A bot with no check of its own that has not touched the head by now, after the checks went
// green, is not reviewing this head.
const BOT_PATIENCE_MS = 10 * 60 * 1000;
const MAX_FAILED_POLLS = 10;
const TRANSIENT = /HTTP (5\d\d|429)|rate limit|timed? ?out|connection (reset|refused)|EOF|temporar|could not resolve host|TLS handshake|Something went wrong/i;
const FAILED = new Set(['fail', 'cancel']);
// gh pr checks buckets, worst first. A name reported twice (push and pull_request runs of
// one job) keeps its worst bucket.
const RANK = { fail: 4, cancel: 3, pending: 2, pass: 1, skipping: 0 };

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      url state headRefOid baseRefName mergeStateStatus reviewDecision
      author { login }
      baseRef { target { oid } }
      commits(last: 1) { nodes { commit { committedDate } } }
      comments(last: 100) { nodes { id url body createdAt updatedAt author { login __typename } } }
      reviews(last: 100) { nodes { id url state body submittedAt commit { oid } author { login __typename } } }
      reviewThreads(last: 100) {
        nodes {
          id isResolved isOutdated path line
          comments(last: 50) { nodes { id databaseId url body createdAt author { login __typename } } }
        }
      }
    }
  }
}`;

class GhError extends Error {
  constructor(message, transient) {
    super(message);
    this.transient = transient;
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const log = (message) => process.stderr.write(`pr-wait: ${message}\n`);

// Fatal messages go to stdout so a monitor shows the agent why the watcher stopped.
function fail(message, code = 2) {
  process.stdout.write(`pr-wait: ${message}\n`);
  process.exit(code);
}

function gh(args, allow = [0]) {
  let delay = 2000;
  for (let attempt = 0; ; attempt++) {
    const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 120000 });
    const code = r.status ?? 1;
    const err = (r.stderr ?? '') + (r.error ? r.error.message : '');
    const transient = code !== 0 && TRANSIENT.test(err);
    if (!transient && allow.includes(code)) return { code, out: r.stdout ?? '', err };
    const message = err.trim().split('\n').pop() || `gh exited ${code}`;
    if (!transient || attempt === 4) throw new GhError(message, transient);
    log(`gh ${args.slice(0, 2).join(' ')}: ${message}; retry in ${delay / 1000}s`);
    sleep(delay);
    delay *= 2;
  }
}

const ghLines = (args) => gh(args).out.split('\n').filter(Boolean);

function who(node) {
  const author = node.author ?? {};
  return { login: author.login ?? 'ghost', bot: author.__typename === 'Bot' };
}

const botOf = (text) => Object.keys(BOTS).find((name) => BOTS[name].login.test(text ?? ''));
const checkBot = (name) => Object.keys(BOTS).find((bot) => BOTS[bot].check.test(name));

function plain(body) {
  return (body ?? '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function snippet(body, limit = 100) {
  const text = plain(body).replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

const digest = (body) => createHash('sha1').update(plain(body).replace(/\s+/g, ' ')).digest('hex').slice(0, 12);
const time = (iso) => (iso ? Date.parse(iso) : 0);

function parseArgs(argv) {
  const opts = { command: 'watch', interval: 20, timeout: 60, once: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--repo') opts.repo = value();
    else if (a === '--interval') opts.interval = Number(value());
    else if (a === '--timeout') opts.timeout = Number(value());
    else if (a === '--once') opts.once = true;
    else if (a === '-h' || a === '--help') {
      process.stdout.write('pr-wait.mjs <pr> [--repo owner/name] [--interval <seconds>] [--timeout <minutes>] [--once]\npr-wait.mjs request <pr> [--repo owner/name]\n');
      process.exit(0);
    } else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else rest.push(a);
  }
  if (rest[0] === 'request') {
    opts.command = 'request';
    rest.shift();
  }
  if (rest.length !== 1) fail('usage: pr-wait.mjs <pr> [--repo owner/name] [--interval <seconds>] [--timeout <minutes>] [--once]');
  if (!(opts.interval > 0)) fail('--interval must be a positive number of seconds');
  if (!(opts.timeout > 0)) fail('--timeout must be a positive number of minutes');
  opts.target = rest[0];
  return opts;
}

function parseTarget(raw, repo) {
  if (!raw.trim()) fail('missing PR number. Did a variable expand to nothing?');
  const url = /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)(?:[/?#]\S*)?$/.exec(raw.trim());
  const number = /^#?(\d+)$/.exec(raw.trim());
  let pr;
  if (url) {
    repo ??= url[1];
    pr = Number(url[2]);
  } else if (number) pr = Number(number[1]);
  else fail(`'${raw}' is not a PR number or PR URL`);
  if (!(pr > 0)) fail(`'${raw}' is not a valid PR number`);
  if (!repo) {
    try {
      repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).out.trim();
    } catch (error) {
      fail(`no --repo given and the current directory has no GitHub repo (${error.message})`);
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`'${repo}' is not owner/name`);
  try {
    gh(['pr', 'view', String(pr), '-R', repo, '--json', 'number']);
  } catch (error) {
    if (!error.transient) fail(`cannot read ${repo}#${pr}: ${error.message}`);
  }
  return { repo, pr };
}

function readModes() {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'bots.json');
  if (!existsSync(file)) {
    log('no bots.json beside this script, so no review bot is waited on');
    return {};
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fetchPr(repo, pr) {
  const [owner, name] = repo.split('/');
  const out = gh(['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${pr}`]).out;
  const data = JSON.parse(out).data;
  const node = data?.repository?.pullRequest;
  if (!node) throw new GhError(`no pull request ${repo}#${pr}`, false);
  node.viewer = data.viewer.login;
  return node;
}

function fetchChecks(repo, pr) {
  // gh pr checks exits 8 while checks are pending and 1 when one failed. Those are states,
  // not errors, so read the JSON and ignore the exit code.
  const r = gh(['pr', 'checks', String(pr), '-R', repo, '--json', 'name,bucket,link'], [0, 1, 8]);
  if (!r.out.trim()) {
    if (/no checks reported/i.test(r.err)) return {};
    throw new GhError(r.err.trim() || `gh pr checks exited ${r.code}`, false);
  }
  const checks = {};
  for (const row of JSON.parse(r.out)) {
    const current = checks[row.name];
    if (!current || (RANK[row.bucket] ?? 2) > (RANK[current.bucket] ?? 2)) checks[row.name] = row;
  }
  return checks;
}

// Required check names from rulesets and classic branch protection. Knowing them up front
// keeps a required check that has not started from passing by omission.
function requiredChecks(repo, base) {
  const sources = [
    [`repos/${repo}/rules/branches/${base}`, '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'],
    [`repos/${repo}/branches/${base}/protection/required_status_checks`, '.contexts[]?, .checks[]?.context'],
  ];
  const names = new Set();
  for (const [path, jq] of sources) {
    try {
      for (const n of ghLines(['api', path, '--jq', jq])) names.add(n);
    } catch (error) {
      if (!/HTTP 404/.test(error.message)) log(`could not read required checks from ${path}: ${error.message}`);
    }
  }
  return names;
}

function mineOf(node) {
  return new Set([who(node).login, node.viewer]);
}

const isTrigger = (comment, bot) => plain(comment.body).trim().toLowerCase().startsWith(BOTS[bot].trigger);

// The newest review request from you for `bot`, as a timestamp, or 0.
function lastTrigger(node, bot, mine) {
  return Math.max(0, ...node.comments.nodes.filter((c) => mine.has(who(c).login) && isTrigger(c, bot)).map((c) => time(c.createdAt)));
}

function headTime(node) {
  return time(node.commits.nodes[0]?.commit?.committedDate);
}

function request(repo, pr, modes, node) {
  const mine = mineOf(node);
  for (const bot of Object.keys(BOTS)) {
    if (modes[bot] !== 'request') continue;
    if (lastTrigger(node, bot, mine) >= headTime(node)) continue;
    gh(['pr', 'comment', String(pr), '-R', repo, '--body', BOTS[bot].trigger]);
    log(`asked ${bot} for a review: ${BOTS[bot].trigger}`);
  }
}

function lock(file, label) {
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      process.on('exit', () => {
        try {
          if (readFileSync(file, 'utf8') === String(process.pid)) rmSync(file);
        } catch {}
      });
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(130));
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(file, 'utf8'));
      if (pid && alive(pid)) {
        fail(`pid ${pid} already watches ${label}, so this watcher exits. If no events reach you from it, run \`kill ${pid}\` and start again.`);
      }
      rmSync(file, { force: true });
    }
  }
  fail(`could not take the lock ${file}`);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

class Watcher {
  constructor(repo, pr, modes, opts) {
    Object.assign(this, { repo, pr, modes, opts });
    this.path = join(STATE_DIR, `${repo.replace('/', '__')}__${pr}.json`);
    const state = this.load();
    // First run for this pull request: record what exists and report nothing.
    this.baseline = state === null;
    this.state = state ?? { reported: [], baseOid: null, mergeState: null };
    this.reported = new Set(this.state.reported);
    this.required = null;
    this.prevSnapshot = null;
    this.prevBodies = new Map();
    this.prFiles = new Map();
    this.greenSince = null;
    this.actions = 0;
    this.started = Date.now();
  }

  load() {
    try {
      if (Date.now() - statSync(this.path).mtimeMs > STALE_STATE_MS) return null;
      return JSON.parse(readFileSync(this.path, 'utf8'));
    } catch {
      return null;
    }
  }

  save() {
    this.state.reported = [...this.reported].sort();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.state));
    renameSync(`${this.path}.tmp`, this.path);
  }

  say(line) {
    process.stdout.write(`#${this.pr} ${line}\n`);
  }

  // Prints an event once per pull request, across restarts. Returns whether it printed.
  emit(key, line) {
    if (this.reported.has(key)) return false;
    this.reported.add(key);
    if (this.baseline) return false;
    this.say(line);
    return true;
  }

  finish(code, lines = []) {
    for (const line of lines) this.say(line);
    this.save();
    process.exit(code);
  }

  baseOverlap(head, oldBase, newBase) {
    try {
      if (!this.prFiles.has(head)) this.prFiles.set(head, new Set(ghLines(['pr', 'diff', String(this.pr), '-R', this.repo, '--name-only'])));
      const moved = ghLines(['api', `repos/${this.repo}/compare/${oldBase}...${newBase}`, '--jq', '.files[].filename']);
      return moved.filter((f) => this.prFiles.get(head).has(f)).sort();
    } catch (error) {
      log(`could not compare base commits: ${error.message}`);
      return [];
    }
  }

  behind(base, baseOid, head) {
    if (!baseOid) return '';
    try {
      const count = gh(['api', `repos/${this.repo}/compare/${baseOid}...${head}`, '--jq', '.behind_by']).out.trim();
      return count && count !== '0' ? `; ${count} commit${count === '1' ? '' : 's'} behind ${base}` : '';
    } catch {
      return '';
    }
  }

  poll() {
    const node = fetchPr(this.repo, this.pr);
    if (node.state === 'MERGED') this.finish(0, [`merged: ${node.url}`]);
    if (node.state === 'CLOSED') this.finish(1, [`closed without merging: ${node.url}`]);
    if (this.required === null) {
      this.required = requiredChecks(this.repo, node.baseRefName);
      request(this.repo, this.pr, this.modes, node);
      const gate = [...this.required].sort().join(', ') || 'none set, so every CI check gates';
      log(`watching ${this.repo}#${this.pr}; required checks: ${gate}`);
    }
    const checks = fetchChecks(this.repo, this.pr);
    const head = node.headRefOid;
    const short = head.slice(0, 7);
    const mine = mineOf(node);
    const since = headTime(node);
    const comments = node.comments.nodes;
    const reviews = node.reviews.nodes;
    const threads = node.reviewThreads.nodes;
    let acted = 0;
    const act = (key, line) => {
      if (this.emit(key, line)) acted++;
    };

    // Checks.
    const gate = this.required.size ? this.required : new Set(Object.keys(checks).filter((n) => !checkBot(n)));
    const bucket = (name) => checks[name]?.bucket ?? 'pending';
    const failLines = [];
    for (const name of [...gate].sort()) {
      if (!FAILED.has(bucket(name))) continue;
      const link = checks[name]?.link ?? '';
      failLines.push(`${this.required.size ? 'required check' : 'check'} failed: ${name} ${link}`.trim());
      this.emit(`fail:${head}:${name}:${link}`, failLines.at(-1));
    }
    const watched = Object.fromEntries(Object.entries(checks).filter(([n]) => {
      const bot = checkBot(n);
      return !bot || (this.modes[bot] ?? 'off') !== 'off';
    }));
    // Checks register a few seconds after a push. Two identical polls in a row keep a
    // half-registered set from passing for a finished one.
    const snapshot = JSON.stringify(Object.entries(watched).map(([n, c]) => [n, c.bucket]).sort());
    const stable = this.opts.once || snapshot === this.prevSnapshot;
    this.prevSnapshot = snapshot;
    const gateDone = [...gate].every((n) => bucket(n) !== 'pending');
    const green = gateDone && stable && !failLines.length;
    if (green) this.greenSince ??= Date.now();
    else this.greenSince = null;

    // People and bots talking. A review bot's comment counts once its text stops changing,
    // because bots post a placeholder and edit the review into it.
    for (const c of comments) {
      const { login, bot } = who(c);
      if (mine.has(login) || (bot && STATUS_BOTS.test(login))) continue;
      if (botOf(login)) {
        const body = digest(c.body);
        const settled = this.prevBodies.get(c.id) === body;
        this.prevBodies.set(c.id, body);
        if (settled || this.baseline) act(`c:${c.id}:${body}`, `comment from ${login}: ${snippet(c.body)} ${c.url}`);
      } else act(`c:${c.id}`, `comment from ${login}: ${snippet(c.body)} ${c.url}`);
    }
    for (const r of reviews) {
      if (mine.has(who(r).login)) continue;
      if (r.state === 'COMMENTED' && !r.body.trim()) continue; // its inline comments arrive as threads
      const state = r.state.toLowerCase().replace(/_/g, ' ');
      act(`r:${r.id}`, `review from ${who(r).login} (${state}): ${snippet(r.body)} ${r.url}`);
    }
    const waiting = [];
    for (const t of threads) {
      if (t.isResolved) continue;
      const nodes = t.comments.nodes;
      const last = nodes.at(-1);
      if (last && !mine.has(who(last).login)) waiting.push(`thread=${t.id}${who(last).bot ? ' bot' : ''} ${nodes[0].url}`);
      const where = t.line ? `${t.path}:${t.line}` : t.path;
      nodes.forEach((c, i) => {
        if (mine.has(who(c).login)) return;
        const kind = i === 0 ? 'new thread' : 'thread reply';
        const ids = `[thread=${t.id} comment=${c.databaseId}${who(c).bot ? ' bot' : ''}${t.isOutdated ? ' outdated' : ''}]`;
        act(`t:${c.id}`, `${kind} from ${who(c).login} on ${where} ${ids}: ${snippet(c.body)} ${c.url}`);
      });
    }

    // Review bots the config waits on. A bot that never showed up on this pull request is
    // not installed on this repository.
    const pendingBots = [];
    const botStatus = [];
    for (const bot of Object.keys(BOTS)) {
      const mode = this.modes[bot] ?? 'off';
      if (mode === 'off') continue;
      const own = Object.values(checks).filter((c) => checkBot(c.name) === bot);
      const byBot = (n) => BOTS[bot].login.test(who(n).login);
      const said = [
        ...comments.filter(byBot).map((c) => time(c.updatedAt || c.createdAt)),
        ...reviews.filter(byBot).map((r) => time(r.submittedAt)),
        ...threads.flatMap((t) => t.comments.nodes.filter(byBot).map((c) => time(c.createdAt))),
      ];
      const asked = lastTrigger(node, bot, mine);
      if (!own.length && !said.length && !asked) continue;
      let done;
      if (asked > since) done = said.some((at) => at > asked);
      else if (own.length) done = own.every((c) => c.bucket !== 'pending');
      else done = reviews.some((r) => byBot(r) && r.commit?.oid === head) || said.some((at) => at > since);
      if (!done && !own.length && this.greenSince && Date.now() - this.greenSince > BOT_PATIENCE_MS) {
        this.emit(`patience:${bot}:${head}`, `${bot} has not reviewed ${short} in ${BOT_PATIENCE_MS / 60000} minutes; not waiting for it`);
        done = true;
      }
      botStatus.push(`${bot} ${done ? 'done' : 'pending'}`);
      if (done) this.emit(`bot:${bot}:${head}`, `${bot} finished on ${short}`);
      else pendingBots.push(bot);
    }

    // Base branch and merge state.
    const base = node.baseRefName;
    const baseOid = node.baseRef?.target?.oid;
    if (baseOid && this.state.baseOid && baseOid !== this.state.baseOid && !this.baseline) {
      const touched = this.baseOverlap(head, this.state.baseOid, baseOid);
      if (touched.length) {
        const more = touched.length > 5 ? ` and ${touched.length - 5} more` : '';
        this.emit(`base:${baseOid}`, `${base} moved to ${baseOid.slice(0, 7)} and touches files in this PR: ${touched.slice(0, 5).join(', ')}${more}`);
      }
    }
    if (baseOid) this.state.baseOid = baseOid;
    const merge = node.mergeStateStatus;
    const dirty = `merge state is DIRTY: the branch conflicts with ${base}`;
    if (merge === 'BEHIND' && this.state.mergeState !== 'BEHIND') this.emit(`behind:${head}:${baseOid}`, `merge state is BEHIND: ${base} has commits this branch lacks`);
    if (merge !== 'UNKNOWN') this.state.mergeState = merge;

    const counts = {};
    for (const c of Object.values(watched)) counts[c.bucket] = (counts[c.bucket] ?? 0) + 1;
    const summary = [
      Object.entries(counts).sort().map(([b, n]) => `${n} ${b}`).join(', ') || 'no checks',
      this.required.size ? `required ${[...this.required].filter((n) => ['pass', 'skipping'].includes(bucket(n))).length}/${this.required.size} green` : '',
      botStatus.join(', '),
      `${waiting.length} threads wait on an answer`,
      `merge state ${merge}`,
      node.reviewDecision ? node.reviewDecision.toLowerCase().replace(/_/g, ' ') : '',
    ].filter(Boolean).join('; ');
    if (gateDone && stable) this.emit(`checks:${head}`, `checks finished on ${short}: ${summary}`);

    this.actions += acted;
    if (merge === 'DIRTY') this.finish(1, [dirty]);
    if (failLines.length) this.finish(1, failLines);
    // Wait out a burst of comments, then hand the whole burst over at once.
    if (this.actions && !acted) this.finish(1);
    if (this.actions && this.opts.once) this.finish(1);
    if (green && !pendingBots.length && !acted) {
      if (waiting.length) this.finish(1, [`${waiting.length} threads wait on an answer on ${short}: ${waiting.join(' ')}`]);
      this.finish(0, [`ready on ${short}: ${summary}${this.behind(base, baseOid, head)}`]);
    }
    if (this.opts.once) this.finish(3, [`pending on ${short}: ${summary}`]);
    if (Date.now() - this.started > this.opts.timeout * 60000) {
      this.finish(3, [`still pending after ${this.opts.timeout} minutes on ${short}: ${summary}`]);
    }
  }

  run() {
    let failures = 0;
    for (;;) {
      try {
        this.poll();
        failures = 0;
        this.save();
        if (this.baseline) log(`baseline recorded for ${this.repo}#${this.pr}; reporting only new events`);
        this.baseline = false;
      } catch (error) {
        if (!(error instanceof GhError)) throw error;
        if (!error.transient) this.finish(1, [`pr-wait stopped: ${error.message}`]);
        failures++;
        log(`poll failed (${failures}/${MAX_FAILED_POLLS}): ${error.message}`);
        if (failures >= MAX_FAILED_POLLS) this.finish(1, [`pr-wait stopped: GitHub unreachable for ${failures} polls: ${error.message}`]);
      }
      sleep(this.opts.interval * 1000);
    }
  }
}

const opts = parseArgs(process.argv.slice(2));
const { repo, pr } = parseTarget(opts.target, opts.repo);
const modes = readModes();
if (opts.command === 'request') {
  try {
    request(repo, pr, modes, fetchPr(repo, pr));
  } catch (error) {
    fail(`cannot read ${repo}#${pr}: ${error.message}`, 1);
  }
  process.exit(0);
}
lock(join(STATE_DIR, `${repo.replace('/', '__')}__${pr}.pid`), `${repo}#${pr}`);
new Watcher(repo, pr, modes, opts).run();
