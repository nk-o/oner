import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';

const script = resolve('skills/pr-wait/pr-wait.mjs');
const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Serves `steps[i]` to the i-th GraphQL read, and the last step after that, so each
// poll of the watcher sees the next state of the pull request.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs');
const file = process.env.GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
// Checks belong to the step the last GraphQL read served.
const step = state.steps[Math.max(0, Math.min(state.poll - 1, state.steps.length - 1))];
if (args[0] === 'pr' && args[1] === 'view') process.stdout.write('{"number":7}');
else if (args[0] === 'api' && args[1] === 'graphql') {
  state.poll++;
  save();
  const pr = JSON.parse(JSON.stringify(state.steps[Math.min(state.poll - 1, state.steps.length - 1)].pr));
  process.stdout.write(JSON.stringify({ data: { viewer: { login: 'me' }, repository: { pullRequest: pr } } }));
} else if (args[0] === 'pr' && args[1] === 'checks') process.stdout.write(JSON.stringify(step.checks));
else if (args[0] === 'api' && /rules\\/branches/.test(args[1])) process.stdout.write((state.required ?? []).join('\\n'));
else if (args[0] === 'api' && /protection/.test(args[1])) { process.stderr.write('HTTP 404: Not Found\\n'); process.exit(1); }
else if (args[0] === 'api' && /compare/.test(args[1])) process.stdout.write('0\\n');
else if (args[0] === 'pr' && args[1] === 'comment') { state.posted.push(args[args.indexOf('--body') + 1]); save(); }
else { process.stderr.write('unexpected gh ' + args.join(' ') + '\\n'); process.exit(1); }
`;

const HEAD = 'a'.repeat(40);
const COMMITTED = '2026-10-01T10:00:00Z';

function pr(extra = {}) {
  return {
    url: 'https://github.com/o/r/pull/7', state: 'OPEN', headRefOid: HEAD, baseRefName: 'main',
    mergeStateStatus: 'CLEAN', reviewDecision: null, author: { login: 'me' },
    baseRef: { target: { oid: 'b'.repeat(40) } },
    commits: { nodes: [{ commit: { committedDate: COMMITTED } }] },
    comments: { nodes: [] }, reviews: { nodes: [] }, reviewThreads: { nodes: [] },
    ...extra,
  };
}

const check = (name, bucket) => ({ name, bucket, link: `https://ci.example.test/${name}` });
const bot = (login) => ({ login, __typename: 'Bot' });

function fixture({ steps, bots = {}, required = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'pr-wait-'));
  fixtures.push(root);
  const bin = join(root, 'bin');
  const skill = join(root, 'skill');
  mkdirSync(bin);
  mkdirSync(skill);
  writeFileSync(join(bin, 'gh'), FAKE_GH, { mode: 0o755 });
  copyFileSync(script, join(skill, 'pr-wait.mjs'));
  writeFileSync(join(skill, 'bots.json'), JSON.stringify(bots));
  const stateFile = join(root, 'gh.json');
  const write = (s) => writeFileSync(stateFile, JSON.stringify(s));
  write({ steps, required, poll: 0, posted: [] });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_STATE: stateFile, XDG_STATE_HOME: join(root, 'state') };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(skill, 'pr-wait.mjs'), '7', '--repo', 'o/r', '--interval', '0.05', ...args], { env, encoding: 'utf8', timeout: 20000 });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const gh = () => JSON.parse(readFileSync(stateFile, 'utf8'));
  // Starts the pull request over at its first step, as a watcher started again sees it.
  const restart = (steps) => write({ ...gh(), steps, poll: 0 });
  return { root, run, gh, restart, env, skill };
}

test('waits for pending checks and exits ready once they pass twice in a row', () => {
  const f = fixture({ steps: [
    { pr: pr(), checks: [check('test', 'pending')] },
    { pr: pr(), checks: [check('test', 'pass')] },
  ] });
  const r = f.run();
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^#7 ready on aaaaaaa: 1 pass; 0 threads wait on an answer; merge state CLEAN$/m);
  assert.equal(f.gh().poll, 3);
});

test('a failed required check exits 1 at once, and a check outside the required set does not gate', () => {
  const f = fixture({ required: ['test'], steps: [
    { pr: pr(), checks: [check('test', 'fail'), check('lint', 'pending')] },
  ] });
  const r = f.run();
  assert.equal(r.code, 1);
  assert.match(r.out, /^#7 required check failed: test https:\/\/ci\.example\.test\/test$/m);

  const g = fixture({ required: ['test'], steps: [
    { pr: pr(), checks: [check('test', 'pass'), check('lint', 'fail')] },
  ] });
  assert.equal(g.run().code, 0);
});

test('a bot thread exits 1 once the burst stops, and is not reported twice after a restart', () => {
  const thread = { id: 'T1', isResolved: false, isOutdated: false, path: 'src/a.ts', line: 4,
    comments: { nodes: [{ id: 'C1', databaseId: 11, url: 'https://github.com/o/r/pull/7#c11', body: 'Null deref here', createdAt: '2026-10-01T10:05:00Z', author: bot('cursor[bot]') }] } };
  const steps = [
    { pr: pr(), checks: [check('test', 'pass')] },
    { pr: pr({ reviewThreads: { nodes: [thread] } }), checks: [check('test', 'pass')] },
  ];
  const f = fixture({ steps });
  const r = f.run();
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /^#7 new thread from cursor\[bot\] on src\/a\.ts:4 \[thread=T1 comment=11 bot\]: Null deref here https:\S+$/m);

  // Still unanswered after a restart: a reminder, not the event again.
  f.restart([steps[1]]);
  const again = f.run();
  assert.equal(again.code, 1);
  assert.doesNotMatch(again.out, /new thread/);
  assert.match(again.out, /^#7 1 threads wait on an answer on aaaaaaa: thread=T1 bot https:\S+$/m);

  // Your reply ends the thread's wait, so the pull request is ready.
  const answered = structuredClone(thread);
  answered.comments.nodes.push({ id: 'C2', databaseId: 12, url: 'u', body: 'Fixed in abc1234', createdAt: '2026-10-01T10:06:00Z', author: { login: 'me', __typename: 'User' } });
  f.restart([{ pr: pr({ reviewThreads: { nodes: [answered] } }), checks: [check('test', 'pass')] }]);
  assert.equal(f.run().code, 0);
});

test('a request bot is asked once per head and waited on until it answers after the request', () => {
  const trigger = { id: 'K1', url: 'u', body: '@codex review', createdAt: '2026-10-01T10:01:00Z', updatedAt: '2026-10-01T10:01:00Z', author: { login: 'me', __typename: 'User' } };
  const review = { id: 'R1', url: 'u', state: 'COMMENTED', body: 'No issues found.', submittedAt: '2026-10-01T10:09:00Z', commit: { oid: HEAD }, author: bot('chatgpt-codex-connector[bot]') };
  const f = fixture({ bots: { codex: 'request' }, steps: [
    { pr: pr(), checks: [check('test', 'pass')] },
    { pr: pr({ comments: { nodes: [trigger] } }), checks: [check('test', 'pass')] },
    { pr: pr({ comments: { nodes: [trigger] } }), checks: [check('test', 'pass')] },
    { pr: pr({ comments: { nodes: [trigger] }, reviews: { nodes: [review] } }), checks: [check('test', 'pass')] },
  ] });
  const r = f.run();
  assert.deepEqual(f.gh().posted, ['@codex review']);
  // The review arrives as an event to act on, and the next run finds the bot done.
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.out, /^#7 review from chatgpt-codex-connector\[bot\] \(commented\): No issues found\. u$/m);
  f.restart([{ pr: pr({ comments: { nodes: [trigger] }, reviews: { nodes: [review] } }), checks: [check('test', 'pass')] }]);
  const again = f.run();
  assert.equal(again.code, 0, again.out + again.err);
  assert.match(again.out, /codex done/);
  assert.deepEqual(f.gh().posted, ['@codex review']);
});

test('a wait bot with a running check holds readiness, and an off bot does not', () => {
  const steps = [{ pr: pr(), checks: [check('test', 'pass'), check('claude-review', 'pending')] }];
  const waiting = fixture({ bots: { claude: 'wait' }, steps });
  const r = waiting.run('--timeout', '0.01');
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /still pending after 0\.01 minutes on aaaaaaa: .*claude pending/);

  const off = fixture({ bots: { claude: 'off' }, steps });
  assert.equal(off.run().code, 0);
});

test('a conflict exits 1, a merged pull request exits 0, and a second watcher refuses to start', () => {
  const dirty = fixture({ steps: [{ pr: pr({ mergeStateStatus: 'DIRTY' }), checks: [] }] });
  const r = dirty.run();
  assert.equal(r.code, 1);
  assert.match(r.out, /merge state is DIRTY: the branch conflicts with main/);

  const merged = fixture({ steps: [{ pr: pr({ state: 'MERGED' }), checks: [] }] });
  assert.match(merged.run().out, /^#7 merged: /m);

  const held = fixture({ steps: [{ pr: pr(), checks: [] }] });
  const pidFile = join(held.root, 'state', 'oner', 'pr-wait', 'o__r__7.pid');
  mkdirSync(join(held.root, 'state', 'oner', 'pr-wait'), { recursive: true });
  writeFileSync(pidFile, String(process.pid));
  const locked = held.run();
  assert.equal(locked.code, 2);
  assert.match(locked.out, new RegExp(`pid ${process.pid} already watches o/r#7`));
});
