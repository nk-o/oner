#!/usr/bin/env node
// The state of an oneshot series, and its only writer. A series is one approved
// program of stages, each carried from its own pull request through merge,
// deployment, migrations, and production checks. This script reads GitHub, git,
// and production, records a transition only on evidence it saw itself, and
// prints the next actions. It never merges, pushes, or deploys, so running it
// twice, or again after a crash or a resume, repeats no mutation.
//
//   series.mjs next [--wait <seconds>] [--program <dir>]
//   series.mjs wait <auth|decision|input|review> <pending action> [--stage <id>] [--program <dir>]
//   series.mjs resume [--recheck <stage>] [--program <dir>]
//   series.mjs amend --stage <id> (--accept <command> | --waive-accept <reason>) [--program <dir>]
//   series.mjs amend (--stages <file> | --release <file>) --approval <the user's words> [--program <dir>]
//   series.mjs report [--program <dir>]
//
// Without --program it takes the one program under the primary checkout's
// .specs/ whose status is running or waiting, else the newest one.
// lanes/series.md describes program.json. Exit 2 is a usage or record error, 3
// a lost login: the program is then waiting, with the step that failed as its
// pending action.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

class Refusal extends Error {}
class AuthLost extends Error {}
// Another series.mjs process saved program.json after this one read it.
class Conflict extends Error {}

// A command-line login that is gone. Release commands are matched against this
// alone, because a 401 from production is a failed check, not a lost login.
const LOGIN = /not logged in|log ?in required|token (has )?expired|could not read username|permission denied \(publickey\)|gh auth login/i;
const HTTP_AUTH = /authentication (failed|required)|unauthori[sz]ed|bad credentials|\b401\b/i;
const STATES = ['pending', 'building', 'pr-open', 'merged', 'deployed', 'done', 'failed'];
const REASONS = ['auth', 'permission', 'decision', 'input', 'review'];
// The fields of a stage the plan writes. Everything else is series.mjs's.
const AUTHORED = ['id', 'title', 'after', 'migrations', 'accept', 'acceptWaived', 'branch'];
const MAX_FIXES = 2;
const WAITS = new Set(['wait-checks', 'wait-merge', 'wait-deploy', 'wait-verify', 'hold']);
const ORDER = ['ask', 'fix-forward', 'merge', 'accept', 'cleanup', 'wait-merge', 'wait-deploy', 'wait-verify', 'fix',
  'update', 'restart', 'wait-checks', 'build', 'start', 'hold', 'complete'];

const short = (sha) => (sha ? sha.slice(0, 9) : 'none');
const lastLine = (text) => text.trim().split('\n').pop() ?? '';
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function run(cmd, args, cwd, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
  return { code: r.status ?? 1, out: r.stdout ?? '', err: (r.stderr ?? '') + (r.error ? r.error.message : '') };
}

function git(root, args, { ok = false } = {}) {
  const r = run('git', ['-C', root, ...args]);
  if (r.code === 0) return r.out.trim();
  if (LOGIN.test(r.err) || HTTP_AUTH.test(r.err)) throw new AuthLost(`git ${args.join(' ')}: ${lastLine(r.err)}`);
  if (ok) return null;
  throw new Refusal(`git ${args.join(' ')} failed: ${lastLine(r.err)}`);
}

function gh(root, args) {
  const r = run('gh', args, root);
  if (r.code !== 0) {
    const text = r.err + r.out;
    if (LOGIN.test(text) || HTTP_AUTH.test(text)) throw new AuthLost(`gh ${args.join(' ')}: ${lastLine(text)}`);
    throw new Refusal(`gh ${args.join(' ')} failed: ${lastLine(r.err)}`);
  }
  return JSON.parse(r.out);
}

// True when `sha` holds `ancestor`. A commit not yet fetched is fetched first.
function contains(root, ancestor, sha) {
  if (!ancestor || !sha) return false;
  if (git(root, ['cat-file', '-e', `${sha}^{commit}`], { ok: true }) === null) {
    git(root, ['fetch', '--quiet', 'origin', sha], { ok: true });
  }
  return run('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, sha]).code === 0;
}

function worktrees(root) {
  const out = [];
  for (const block of git(root, ['worktree', 'list', '--porcelain']).split('\n\n')) {
    const dir = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1];
    if (dir) out.push({ dir, branch });
  }
  return out;
}

// The open program, or with none open the newest one, so a finished series
// can still be reported.
function findProgram(cwd, given) {
  if (given) return resolve(given);
  const r = run('git', ['-C', cwd, 'worktree', 'list', '--porcelain']);
  if (r.code !== 0) throw new Refusal('Not inside a git repository.');
  const specs = join(/^worktree (.+)$/m.exec(r.out)[1], '.specs');
  const programs = (existsSync(specs) ? readdirSync(specs).sort() : [])
    .map((name) => join(specs, name))
    .flatMap((dir) => {
      try {
        return [{ dir, status: JSON.parse(readFileSync(join(dir, 'program.json'), 'utf8')).status ?? 'running' }];
      } catch {
        return [];
      }
    });
  const open = programs.filter((p) => ['running', 'waiting'].includes(p.status));
  if (open.length > 1) throw new Refusal(`Several open programs, pass --program: ${open.map((p) => p.dir).join(', ')}`);
  const found = open[0] ?? programs.at(-1);
  if (!found) throw new Refusal(`No program under ${specs}.`);
  return found.dir;
}

function load(dir) {
  const file = join(dir, 'program.json');
  const root = resolve(dir, '..', '..');
  let raw;
  let p;
  try {
    raw = readFileSync(file, 'utf8');
    p = JSON.parse(raw);
  } catch (error) {
    throw new Refusal(`${file}: ${error.message}`);
  }
  normalize(p, dir, root);
  return { p, root, raw };
}

// Fills the defaults and refuses a record the state machine cannot trust, a
// stage marked done without its evidence included.
function normalize(p, dir, root) {
  const file = join(dir, 'program.json');
  const bad = (message) => {
    throw new Refusal(`${file}: ${message}`);
  };
  const strings = (value, what) => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) bad(`${what} must be a list of non-empty strings`);
    return value;
  };
  p.status ??= 'running';
  if (!['running', 'waiting', 'done', 'stopped'].includes(p.status)) bad(`unknown status "${p.status}"`);
  if (p.status === 'waiting' && !p.waiting?.action) bad('a waiting program names its pending action in waiting.action');
  if (p.authorization !== undefined && (typeof p.authorization !== 'string' || !p.authorization.trim())) {
    bad('authorization must quote the user\'s approval of merging and deploying, or be left out');
  }
  p.slug ??= basename(dir).replace(/^\d+-/, '');
  p.base ??= (git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { ok: true }) ?? 'origin/main').replace(/^origin\//, '');
  const r = p.release ?? bad('release is missing');
  if (typeof r.deployed !== 'string' || !r.deployed.trim()) bad('release.deployed must be the command that prints the commit production runs');
  r.merge ??= 'squash';
  if (!['squash', 'merge', 'rebase'].includes(r.merge)) bad(`release.merge "${r.merge}" is not squash, merge, or rebase`);
  if (!strings(r.checks ?? [], 'release.checks').length) {
    bad('release.checks must name at least one check, or a head whose checks have not registered yet looks green');
  }
  strings((r.accept ??= []), 'release.accept');
  r.migrations ??= null;
  if (r.migrations !== null && (typeof r.migrations !== 'string' || !r.migrations.trim())) bad('release.migrations must be a command or null');
  r.timeoutMinutes ??= 30;
  if (typeof r.timeoutMinutes !== 'number' || r.timeoutMinutes < 0) bad('release.timeoutMinutes must be a number of minutes');
  if (!Array.isArray(p.stages) || !p.stages.length) bad('stages must list at least one stage');
  const seen = new Set();
  for (const s of p.stages) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id ?? '')) bad(`stage id "${s.id}" must be lowercase letters, digits, and dashes`);
    if (seen.has(s.id)) bad(`stage id "${s.id}" appears twice`);
    for (const d of strings((s.after ??= []), `stage ${s.id} after`)) {
      if (!seen.has(d)) bad(`stage ${s.id} comes after ${d}, which is not listed before it`);
    }
    seen.add(s.id);
    s.state ??= 'pending';
    if (!STATES.includes(s.state)) bad(`stage ${s.id} has unknown state "${s.state}"`);
    s.branch ??= `${p.slug}-${s.id}`;
    strings((s.accept ??= []), `stage ${s.id} accept`);
    s.migrations ??= false;
    if (s.migrations && !r.migrations) bad(`stage ${s.id} carries migrations, so release.migrations must name the command that proves them applied`);
    s.fixes ??= 0;
    s.history ??= [];
    s.logs ??= [];
    if (s.state === 'done' && !(s.approvedHead && s.merge && s.deployed && s.verifiedAt)) {
      bad(`stage ${s.id} is done without the evidence of its merge, deployment, and verification`);
    }
    if (s.acceptWaived !== undefined && (typeof s.acceptWaived !== 'string' || !s.acceptWaived.trim())) {
      bad(`stage ${s.id} acceptWaived must say why no read-only check can see the stage`);
    }
  }
}

// Every file a release command runs has to outlive the session that wrote it
// and reach whichever agent continues the series, on any host. So it lives in
// the program folder, not in a session's scratch or tool folder, a temporary
// directory, or a checkout whose files can be older than production.
function strays(dir, root, p) {
  const home = process.env.HOME ? resolve(process.env.HOME) : null;
  const r = p.release;
  const commands = [r.deployed, r.migrations, ...r.accept, ...p.stages.filter((s) => s.state !== 'done').flatMap((s) => s.accept)];
  const found = [];
  for (const command of commands.filter(Boolean)) {
    for (const [, raw] of command.matchAll(/(?:^|[\s'"=])((?:~|\$HOME|\$\{HOME\}|\/)[^\s'";|&()<>]*)/g)) {
      const path = resolve(raw.replace(/^(~|\$HOME|\$\{HOME\})/, home ?? '~'));
      const inside = path === dir || path.startsWith(`${dir}/`) || path === root;
      const temporary = /^\/(private\/)?(tmp|var\/tmp)\//.test(`${path}/`);
      if (!inside && (temporary || (home && path.startsWith(`${home}/`)))) found.push(path);
    }
  }
  return [...new Set(found)];
}

function refuseStrays(dir, root, p) {
  const found = strays(dir, root, p);
  if (found.length) {
    throw new Refusal(`Release commands call files outside the program folder: ${found.join(', ')}. Copy them into ${join(dir, 'release')}/ and point the commands there with series.mjs amend --release <file> --approval "<the user's words>".`);
  }
}

// Saves only over the record this process read. A background `next --wait`
// and a foreground `wait` or `resume` both write, and the later one must not
// erase the earlier.
function save(dir, p, raw) {
  const file = join(dir, 'program.json');
  if (readFileSync(file, 'utf8') !== raw) throw new Conflict();
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(p, null, 2) + '\n');
  renameSync(`${file}.${process.pid}.tmp`, file);
}

// Reads, changes, and saves the record, again from a fresh read when another
// process saved in between.
function update(dir, change) {
  for (let attempt = 0; ; attempt += 1) {
    const loaded = load(dir);
    try {
      const result = change(loaded);
      save(dir, loaded.p, loaded.raw);
      return { ...loaded, result };
    } catch (error) {
      if (!(error instanceof Conflict) || attempt === 4) throw error;
    }
  }
}

// Reduces a pull request's statusCheckRollup to its passing, failing,
// unfinished, and skipped checks. An expected check that never reported is
// unfinished. One that only ever skipped never ran, and nothing the series does
// will run it.
function checkState(rollup, expected) {
  const rank = { skipped: 0, pass: 1, pending: 2, fail: 3 };
  const seen = new Map();
  for (const c of rollup ?? []) {
    const name = c.name || c.context || 'unnamed';
    const verdict = 'context' in c || c.__typename === 'StatusContext'
      ? (c.state === 'SUCCESS' ? 'pass' : ['FAILURE', 'ERROR'].includes(c.state) ? 'fail' : 'pending')
      : c.status !== 'COMPLETED' ? 'pending' : c.conclusion === 'SKIPPED' ? 'skipped'
        : ['SUCCESS', 'NEUTRAL'].includes(c.conclusion) ? 'pass' : 'fail';
    if (!seen.has(name) || rank[verdict] > rank[seen.get(name)]) seen.set(name, verdict);
  }
  const named = (verdict) => [...seen].filter(([, v]) => v === verdict).map(([n]) => n);
  const pending = [...named('pending'), ...expected.filter((n) => !seen.has(n)).map((n) => `${n} (not reported)`)];
  return { passed: named('pass'), fail: named('fail'), pending, skipped: named('skipped').filter((n) => expected.includes(n)) };
}

// Release commands run from the primary checkout, where a deploy provider's
// local project link lives. The gate dry-runs each one before the series starts.
function releaseCommand(ctx, s, check, command) {
  const env = { ...process.env, SERIES_STAGE: s.id, SERIES_COMMIT: s.merge ?? '', SERIES_DEPLOYED: s.deployed ?? '' };
  const r = run('sh', ['-c', command], ctx.root, env);
  const output = (r.out + r.err).trim();
  if (r.code !== 0 && LOGIN.test(output)) throw new AuthLost(`${command}: ${lastLine(output)}`);
  return { check, command, code: r.code, output, passed: r.code === 0 };
}

// The commit production runs, when the deploy command printed one that holds
// the stage's merge commit. The commit is the first hex token in the output that
// names a commit, full shas before short ones, so a build number or a timestamp
// beside it is passed over.
function deployedCommit(ctx, s) {
  const d = releaseCommand(ctx, s, 'deployed', ctx.p.release.deployed);
  const found = d.passed ? d.output.match(/\b[0-9a-f]{7,40}\b/g) ?? [] : [];
  const tokens = [...found.filter((t) => t.length === 40), ...found.filter((t) => t.length < 40)];
  if (tokens.length) git(ctx.root, ['fetch', '--quiet', 'origin'], { ok: true });
  const sha = tokens.map((t) => git(ctx.root, ['rev-parse', '--verify', '--quiet', `${t}^{commit}`], { ok: true })).find(Boolean);
  d.passed = Boolean(sha) && contains(ctx.root, s.merge, sha);
  d.sha = sha ?? tokens[0];
  return d;
}

const evidence = (r) => ({ ...r, output: r.output.slice(-1500) });

// A copy made with preserveTimestamps keeps the source's mtime, so an equal
// size and mtime means the file is already archived.
function changedSince(from, to) {
  const a = statSync(from);
  if (a.isDirectory()) return true;
  const b = statSync(to, { throwIfNoEntry: false });
  return !b || b.size !== a.size || b.mtimeMs !== a.mtimeMs;
}

// Copies the stage's run folder out of its worktree into the program folder,
// on every pass while the stage is open and once more when it closes, so
// removing the worktree, or handing the series to another agent, loses nothing.
function archive(ctx, s) {
  for (const wt of worktrees(ctx.root)) {
    if (wt.branch !== s.branch || !existsSync(join(wt.dir, '.specs'))) continue;
    for (const name of readdirSync(join(wt.dir, '.specs'))) {
      const src = join(wt.dir, '.specs', name);
      const log = join(src, 'oneshot.md');
      if (!existsSync(log) || !readFileSync(log, 'utf8').split('\n').includes(`Branch. ${s.branch}`)) continue;
      if (dirname(src) === dirname(ctx.dir)) return relative(ctx.dir, src);
      const dest = join(ctx.dir, 'stages', s.id, name);
      cpSync(src, dest, { recursive: true, preserveTimestamps: true, filter: (from, to) => changedSince(from, to) });
      return relative(ctx.dir, dest);
    }
  }
  return null;
}

function keepRun(ctx, s) {
  const log = archive(ctx, s);
  if (log && !s.logs.includes(log)) {
    s.logs.push(log);
    ctx.changed = true;
  }
}

const act = (kind, s, detail) => ({ kind, stage: s.id, detail });

// A worktree a done stage left behind, its fix branches' included.
function cleanup(root, s) {
  const branches = [s.branch, ...s.history.map((h) => h.branch)];
  return worktrees(root).slice(1).filter((w) => branches.includes(w.branch))
    .map((w) => act('cleanup', s, `the stage is archived; remove worktree ${w.dir} with wt.sh finish from outside it`));
}

function advance(ctx, s) {
  const { p, root } = ctx;
  const move = (state) => {
    s.state = state;
    ctx.changed = true;
  };
  const ask = (reason, detail) => {
    p.status = 'waiting';
    p.waiting = { reason, action: `stage ${s.id}: ${detail}`, since: ctx.now };
    ctx.changed = true;
    return [act('ask', s, detail)];
  };
  const expired = (since) => Date.parse(ctx.now) - Date.parse(since) >= p.release.timeoutMinutes * 60000;
  const fail = (kind, detail, results) => {
    s.failure = { kind, detail, at: ctx.now, evidence: results.map(evidence) };
    move('failed');
  };
  const keepLog = () => keepRun(ctx, s);
  const branchExists = (branch) => git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { ok: true }) !== null;

  for (;;) {
    switch (s.state) {
      case 'done':
        return cleanup(root, s);
      case 'pending': {
        const open = s.after.filter((id) => ctx.byId[id].state !== 'done');
        if (open.length) return [act('hold', s, `waits for ${open.join(', ')}`)];
        if (!branchExists(s.branch)) {
          const check = s.accept.length || s.acceptWaived ? '' : `; write its production check while you build, ${ctx.amendAccept(s)}`;
          return [act('start', s, `create branch ${s.branch} from origin/${p.base} at ${short(ctx.baseSha)} and build the stage on it${check}`)];
        }
        const stale = s.after.filter((id) => !contains(root, ctx.byId[id].merge, `refs/heads/${s.branch}`));
        if (stale.length) return [act('restart', s, `branch ${s.branch} lacks the merge of ${stale.join(', ')}; recreate it from origin/${p.base}`)];
        s.base = git(root, ['merge-base', `refs/heads/${s.branch}`, `refs/remotes/origin/${p.base}`]);
        s.startedAt = ctx.now;
        move('building');
        continue;
      }
      case 'building': {
        const [pr] = gh(root, ['pr', 'list', '--head', s.branch, '--state', 'all', '--limit', '1', '--json', 'number,url']);
        if (!pr) return [act('build', s, `run the stage on branch ${s.branch} until its pull request is open`)];
        s.pr = { number: pr.number, url: pr.url };
        move('pr-open');
        continue;
      }
      case 'pr-open': {
        const v = gh(root, ['pr', 'view', String(s.pr.number), '--json',
          'state,headRefOid,mergeCommit,mergeStateStatus,reviewDecision,statusCheckRollup']);
        // A recheck accepts only the merge it was asked about.
        if (s.recheck && !(v.state === 'MERGED' && v.headRefOid !== s.approvedHead)) {
          delete s.recheck;
          ctx.changed = true;
        }
        if (v.state === 'CLOSED') {
          const [newer] = gh(root, ['pr', 'list', '--head', s.branch, '--state', 'all', '--limit', '1', '--json', 'number,url']);
          if (newer && newer.number !== s.pr.number) {
            s.pr = { number: newer.number, url: newer.url };
            delete s.approvedHead;
            ctx.changed = true;
            continue;
          }
          return ask('decision', `${s.pr.url} was closed without merging`);
        }
        if (v.state === 'MERGED') {
          // Merged by hand, by a queue, or before the last pass recorded it,
          // so it is in release whatever else is, and a merge this pass
          // printed for another stage waits.
          if (ctx.mergeAction && ctx.merging !== s.id) {
            Object.assign(ctx.mergeAction, { kind: 'hold', detail: `${s.id} merged outside the series; merges go one at a time` });
            ctx.mergeAction = null;
          }
          ctx.merging = s.id;
          if (v.headRefOid !== s.approvedHead) {
            if (!s.recheck) {
              return ask('decision', `${s.pr.url} was merged at ${short(v.headRefOid)}, but the series verified its checks at ${short(s.approvedHead)}`);
            }
            s.approvedHead = v.headRefOid;
            s.checks = { head: v.headRefOid, at: ctx.now, acceptedByUser: s.recheck };
            delete s.recheck;
            ctx.changed = true;
          }
          const merge = v.mergeCommit?.oid;
          if (!merge || !contains(root, merge, `refs/remotes/origin/${p.base}`)) {
            return [act('wait-merge', s, `${s.pr.url} is merged, but its merge commit is not on origin/${p.base} yet`)];
          }
          s.merge = git(root, ['rev-parse', merge]);
          s.mergedAt = ctx.now;
          move('merged');
          continue;
        }
        // A head that moved since its approval needs its checks read again.
        if (s.approvedHead && s.approvedHead !== v.headRefOid) {
          delete s.approvedHead;
          ctx.changed = true;
        }
        const releasing = ctx.releasing();
        if (releasing && releasing !== s.id) return [act('hold', s, `${releasing} is in release, and merges go one at a time`)];
        if (v.mergeStateStatus === 'DIRTY') return [act('fix', s, `${s.pr.url} conflicts with ${p.base}`)];
        const c = checkState(v.statusCheckRollup, p.release.checks);
        if (c.fail.length) return [act('fix', s, `checks fail on ${short(v.headRefOid)}: ${c.fail.join(', ')}`)];
        if (c.skipped.length) return ask('decision', `required checks were skipped on ${short(v.headRefOid)}: ${c.skipped.join(', ')}`);
        if (v.reviewDecision === 'CHANGES_REQUESTED') return [act('fix', s, `${s.pr.url} has changes requested`)];
        const behind = p.stages.filter((o) => o.merge && o !== s && !contains(root, o.merge, v.headRefOid));
        if (v.mergeStateStatus === 'BEHIND' || behind.length) {
          return [act('update', s, `bring ${s.branch} up to date with origin/${p.base} and push${behind.length ? `; it lacks ${behind.map((o) => o.id).join(', ')}` : ''}`)];
        }
        if (c.pending.length) return [act('wait-checks', s, `on ${short(v.headRefOid)}: ${c.pending.join(', ')}`)];
        if (v.reviewDecision === 'REVIEW_REQUIRED') return ask('review', `${s.pr.url} needs an approving review`);
        if (!['CLEAN', 'HAS_HOOKS'].includes(v.mergeStateStatus)) {
          return [act('wait-checks', s, `GitHub reports merge state ${v.mergeStateStatus} for ${s.pr.url}`)];
        }
        if (!s.accept.length && !s.acceptWaived) {
          return [act('accept', s, `the stage has no production check of its own, so a deploy alone would pass it: ${ctx.amendAccept(s)}`)];
        }
        if (!p.authorization) return ask('input', 'the user has not authorized merging and deploying this series');
        if (s.approvedHead !== v.headRefOid) {
          s.approvedHead = v.headRefOid;
          s.checks = { head: v.headRefOid, at: ctx.now, passed: c.passed };
          ctx.changed = true;
        }
        ctx.merging = s.id;
        ctx.mergeAction = act('merge', s, `gh pr merge ${s.pr.number} --${p.release.merge} --match-head-commit ${v.headRefOid}`);
        return [ctx.mergeAction];
      }
      case 'merged': {
        const d = deployedCommit(ctx, s);
        if (d.passed) {
          s.deployed = d.sha;
          s.deployedAt = ctx.now;
          move('deployed');
          continue;
        }
        const seen = d.sha ? `production runs ${short(d.sha)}` : `the deploy command printed no commit (exit ${d.code})`;
        if (expired(s.mergedAt)) {
          fail('deploy', `${seen}, which does not contain merge ${short(s.merge)}`, [d]);
          continue;
        }
        return [act('wait-deploy', s, `${seen}; waiting for ${short(s.merge)}`)];
      }
      case 'deployed': {
        const results = [deployedCommit(ctx, s)];
        if (s.migrations) results.push(releaseCommand(ctx, s, 'migrations', p.release.migrations));
        for (const command of [...p.release.accept, ...s.accept]) results.push(releaseCommand(ctx, s, 'accept', command));
        const failed = results.filter((r) => !r.passed);
        if (!failed.length) {
          s.verification = results.map(evidence);
          s.verifiedAt = ctx.now;
          keepLog();
          if (ctx.merging === s.id) ctx.merging = null;
          move('done');
          continue;
        }
        const detail = failed.map((r) => `${r.command} exited ${r.code}${r.output ? `: ${lastLine(r.output)}` : ''}`).join('; ');
        if (expired(s.deployedAt)) {
          const kind = failed.some((r) => r.check === 'migrations') ? 'migration' : failed.some((r) => r.check === 'deployed') ? 'deploy' : 'acceptance';
          fail(kind, detail, results);
          continue;
        }
        return [act('wait-verify', s, detail)];
      }
      case 'failed': {
        const f = s.failure;
        const fixBranch = `${s.branch.replace(/-fix\d+$/, '')}-fix${s.fixes + 1}`;
        const gate = f.kind === 'migration'
          ? `migrations failed in production: ${f.detail}. Take the project's rollback policy to the user; no down migration runs on its own`
          : f.kind === 'deploy' ? `the deploy did not pick up the merge: ${f.detail}`
            : s.fixes >= MAX_FIXES ? `${s.fixes} fixes forward did not pass production: ${f.detail}` : null;
        if (gate && !s.answered) {
          return ask('decision', `${gate}. After a repair outside the series, resume with --recheck ${s.id}; to fix forward, resume and cut branch ${fixBranch}`);
        }
        if (!branchExists(fixBranch)) {
          return [act('fix-forward', s, `${f.kind} failed: ${f.detail}. Create branch ${fixBranch} from origin/${p.base} and run the fix lane on it`)];
        }
        keepLog();
        const { pr, approvedHead, checks, merge, deployed, failure } = s;
        s.history.push({ branch: s.branch, pr, approvedHead, checks, merge, deployed, failure });
        for (const key of ['pr', 'approvedHead', 'checks', 'merge', 'mergedAt', 'deployed', 'deployedAt', 'verification', 'failure', 'answered']) delete s[key];
        s.branch = fixBranch;
        s.fixes += 1;
        s.base = git(root, ['merge-base', `refs/heads/${fixBranch}`, `refs/remotes/origin/${p.base}`]);
        move('building');
        continue;
      }
    }
  }
}

function pass({ p, root }, dir) {
  const actions = [];
  if (p.status === 'waiting') {
    actions.push({ kind: 'ask', stage: '-', detail: `waiting for ${p.waiting.reason}: ${p.waiting.action}. Ask the user, then run series.mjs resume` });
    return { actions, changed: false };
  }
  if (p.status !== 'running') {
    for (const s of p.stages) actions.push(...cleanup(root, s));
    actions.push({ kind: p.status === 'done' ? 'complete' : 'stopped', stage: '-', detail: 'nothing left to do but cleanup' });
    return { actions, changed: false };
  }
  refuseStrays(dir, root, p);
  const ctx = { p, root, dir, now: new Date().toISOString(), changed: false, merging: null };
  ctx.amendAccept = (s) => `put the script in ${join(dir, 'release')}/ and run series.mjs amend --stage ${s.id} --accept "<command>", or --waive-accept "<why no read-only check can see it>"`;
  ctx.byId = Object.fromEntries(p.stages.map((s) => [s.id, s]));
  // One stage at a time goes from an approved merge to verified production,
  // and a stage being fixed forward still holds that place.
  ctx.releasing = () => ctx.merging ??
    (p.stages.find((s) => ['merged', 'deployed', 'failed'].includes(s.state) || (s.history.length && s.state !== 'done')) ??
      p.stages.find((s) => s.state === 'pr-open' && s.approvedHead))?.id;
  try {
    git(root, ['fetch', '--quiet', 'origin', p.base]);
    ctx.baseSha = git(root, ['rev-parse', `refs/remotes/origin/${p.base}`]);
    for (const s of p.stages) {
      const found = advance(ctx, s);
      if (!['pending', 'done'].includes(s.state)) keepRun(ctx, s);
      if (p.status === 'waiting') return { actions: found, changed: true };
      actions.push(...found);
    }
  } catch (error) {
    if (!(error instanceof AuthLost)) throw error;
    p.status = 'waiting';
    p.waiting = { reason: 'auth', action: `run series.mjs next again once the login is back; it stopped at ${error.message}`, since: ctx.now };
    return { actions: [], changed: true, error };
  }
  if (p.stages.every((s) => s.state === 'done')) {
    p.status = 'done';
    ctx.changed = true;
    actions.push({ kind: 'complete', stage: '-', detail: 'every stage is done; run series.mjs report' });
  }
  return { actions, changed: ctx.changed };
}

function next(dir, wait) {
  const deadline = Date.now() + wait * 1000;
  for (;;) {
    let result;
    for (let attempt = 0; ; attempt += 1) {
      const loaded = load(dir);
      const r = pass(loaded, dir);
      try {
        // A pass whose record changed under it acts on stale state, saved or not.
        if (r.changed) save(dir, loaded.p, loaded.raw);
        else if (readFileSync(join(dir, 'program.json'), 'utf8') !== loaded.raw) throw new Conflict();
      } catch (error) {
        if (error instanceof Conflict && attempt < 4) continue;
        throw error;
      }
      if (r.error) throw r.error;
      result = { p: loaded.p, actions: r.actions };
      break;
    }
    result.actions.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    // A cleanup the coordinator left for later does not end a wait.
    if (Date.now() >= deadline || !result.actions.every((a) => WAITS.has(a.kind) || a.kind === 'cleanup')) return result;
    sleep(Math.min(30000, deadline - Date.now()));
  }
}

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(resolve(file), 'utf8'));
  } catch (error) {
    throw new Refusal(`${what} ${file}: ${error.message}`);
  }
}

// The one way the approved program changes after the gate: a stage's own
// production check, the stages not started yet, or the release commands. The
// state of a started stage is never touched, and a change to the plan carries
// the user's words approving it.
function amendProgram({ p, root }, dir, stageId, a) {
  if (!['running', 'waiting'].includes(p.status)) throw new Refusal(`The program is ${p.status}.`);
  const now = new Date().toISOString();
  if (stageId) {
    const s = p.stages.find((x) => x.id === stageId) ?? (() => { throw new Refusal(`No stage ${stageId}.`); })();
    if (s.state === 'done') throw new Refusal(`Stage ${s.id} is done; its production checks already ran.`);
    if (a.accept) {
      if (!s.accept.includes(a.accept)) s.accept.push(a.accept);
      delete s.acceptWaived;
    } else if (a['waive-accept']) {
      if (s.accept.length) throw new Refusal(`Stage ${s.id} already has a production check of its own.`);
      s.acceptWaived = a['waive-accept'];
    } else {
      throw new Refusal('amend --stage needs --accept <command> or --waive-accept <reason>.');
    }
    (p.amendments ??= []).push({ at: now, stage: s.id, ...(a.accept ? { accept: a.accept } : { acceptWaived: s.acceptWaived }) });
  } else {
    if (!a.approval?.trim()) throw new Refusal('A change to the plan or the release quotes the user\'s approval in --approval.');
    const record = { at: now, approval: a.approval };
    if (a.stages) {
      const listed = readJson(a.stages, 'Stages file');
      if (!Array.isArray(listed)) throw new Refusal(`${a.stages} must hold a list of stages.`);
      // A pending stage whose branch exists has work on it, so it counts as started.
      const started = p.stages.filter((s) => s.state !== 'pending' ||
        git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${s.branch}`], { ok: true }) !== null);
      for (const s of listed) {
        const extra = Object.keys(s ?? {}).filter((k) => !AUTHORED.includes(k));
        if (extra.length) throw new Refusal(`Stage ${s?.id} sets ${extra.join(', ')}, which only series.mjs writes.`);
        if (started.some((x) => x.id === s.id)) throw new Refusal(`Stage ${s.id} has started; it stays as it is.`);
      }
      const before = p.stages.filter((s) => !started.includes(s)).map((s) => s.id);
      p.stages = [...started, ...listed.map((s) => ({ ...s }))];
      Object.assign(record, { removed: before.filter((id) => !listed.some((s) => s.id === id)), stages: listed.map((s) => s.id) });
    }
    if (a.release) {
      p.release = readJson(a.release, 'Release file');
      record.release = true;
    }
    if (!a.stages && !a.release) throw new Refusal('amend needs --stage, --stages, or --release.');
    (p.amendments ??= []).push(record);
  }
  normalize(p, dir, root);
  refuseStrays(dir, root, p);
}

// The hook takes a session whose transcript holds the `series program:` line
// for the series' coordinator, so the read-only report prints another label.
function summary(dir, p, label = 'series program') {
  const done = p.stages.filter((s) => s.state === 'done').length;
  return `${label}: ${join(dir, 'program.json')}\nstatus ${p.status}, ${done} of ${p.stages.length} stages done`;
}

function main(argv) {
  const args = [];
  let given;
  let wait = 0;
  let recheck;
  let stage;
  const amend = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--program') given = argv[++i];
    else if (['--accept', '--waive-accept', '--stages', '--release', '--approval'].includes(argv[i])) amend[argv[i].slice(2)] = argv[++i];
    else if (argv[i] === '--wait') wait = Number(argv[++i]);
    else if (argv[i] === '--recheck') recheck = argv[++i];
    else if (argv[i] === '--stage') stage = argv[++i];
    else args.push(argv[i]);
  }
  const [command, ...rest] = args;
  if (!['next', 'wait', 'resume', 'amend', 'report'].includes(command) || !(wait >= 0)) {
    throw new Refusal('Usage: series.mjs next [--wait <seconds>] | wait <reason> <pending action> [--stage <id>] | resume [--recheck <stage>] | amend --stage <id> --accept <command> | amend --stage <id> --waive-accept <reason> | amend --stages <file> --approval <words> | amend --release <file> --approval <words> | report [--program <dir>]');
  }
  const dir = findProgram(process.cwd(), given);
  if (command === 'next') {
    const { p, actions } = next(dir, wait);
    console.log([summary(dir, p), ...actions.map((a) => `${a.kind} ${a.stage}: ${a.detail}`)].join('\n'));
    return 0;
  }
  if (command === 'wait') {
    const [reason, ...action] = rest;
    if (!REASONS.includes(reason) || !action.length) throw new Refusal(`Usage: series.mjs wait <${REASONS.join('|')}> <pending action>`);
    const { p } = update(dir, ({ p }) => {
      if (p.status !== 'running' && p.status !== 'waiting') throw new Refusal(`The program is ${p.status}.`);
      if (stage && !p.stages.some((x) => x.id === stage)) throw new Refusal(`No stage ${stage}.`);
      p.status = 'waiting';
      // The prefix is what lets resume --recheck answer for that stage.
      p.waiting = { reason, action: `${stage ? `stage ${stage}: ` : ''}${action.join(' ')}`, since: new Date().toISOString() };
    });
    console.log(`${summary(dir, p)}\nwaiting for ${reason}: ${p.waiting.action}`);
    return 0;
  }
  if (command === 'resume') {
    const { p, result: pending } = update(dir, ({ p }) => {
      if (p.status !== 'waiting') throw new Refusal(`The program is ${p.status}, not waiting.`);
      const now = new Date().toISOString();
      const waited = p.waiting;
      const asked = p.stages.find((x) => waited.action.startsWith(`stage ${x.id}: `));
      if (recheck && recheck !== asked?.id) {
        throw new Refusal(`The program waits on ${asked ? `stage ${asked.id}` : 'no stage'}, so --recheck ${recheck} answers nothing. A wait about one stage is written with --stage <id>.`);
      }
      if (asked?.state === 'failed' && recheck) {
        // The user repaired it outside the series, so production is read again.
        delete asked.failure;
        delete asked.answered;
        asked.state = 'merged';
      } else if (asked?.state === 'failed') {
        asked.answered = waited.action;
      } else if (recheck) {
        asked.recheck = waited.action;
      }
      // Time spent waiting on the user does not count against a release's timeout.
      for (const s of p.stages) {
        if (s.state === 'merged') s.mergedAt = now;
        if (s.state === 'deployed') s.deployedAt = now;
      }
      (p.waits ??= []).push({ ...waited, resumedAt: now, ...(recheck ? { recheck } : {}) });
      p.status = 'running';
      delete p.waiting;
      return waited;
    });
    console.log(`${summary(dir, p)}\nresumed. The pending action was: ${pending.action}\nRun series.mjs next before repeating any of it: next reads GitHub and production first.`);
    return 0;
  }
  if (command === 'amend') {
    const { p } = update(dir, (loaded) => amendProgram(loaded, dir, stage, amend));
    console.log(`${summary(dir, p)}\namended. Run series.mjs next.`);
    return 0;
  }
  const { p } = load(dir);
  const lines = p.stages.map((s) =>
    `${s.id} ${s.state} ${s.pr?.url ?? 'no PR'} merge ${short(s.merge)} deployed ${short(s.deployed)} verified ${s.verifiedAt ?? 'no'}` +
    (s.fixes ? ` fixes ${s.fixes}` : ''));
  const open = p.stages.filter((s) => s.state !== 'done');
  console.log([summary(dir, p, 'series report'), ...lines, ...(open.length ? [`incomplete: ${open.map((s) => `${s.id} (${s.state})`).join(', ')}`] : [])].join('\n'));
  return open.length ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof AuthLost) {
    console.error(`Login lost: ${error.message}\nThe program is waiting. Ask the user to restore access, then run series.mjs resume.`);
    process.exitCode = 3;
  } else if (error instanceof Refusal || error instanceof Conflict) {
    console.error(error instanceof Conflict ? 'program.json kept changing under this process; run it again.' : error.message);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
