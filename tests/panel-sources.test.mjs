import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { findRepos, repoLabel } from '../panel/repos.mjs';
import { asksSource, parseAsks } from '../panel/sources/asks.mjs';
import { claudeSource, classify, lastAsk, startOfDay } from '../panel/sources/claude.mjs';
import { codexSource, lastLifecycle } from '../panel/sources/codex.mjs';
import { githubSource, searchTime, toItem } from '../panel/sources/github.mjs';
import { parseListeners } from '../panel/sources/servers.mjs';
import { createSizes } from '../panel/sources/worktrees.mjs';
import { SourceOff } from '../panel/run.mjs';

const roots = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-'));
  roots.push(dir);
  return dir;
};
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

const NOW = Date.parse('2026-11-05T12:00:00');
const DAY_START = Date.parse('2026-11-05T00:00:00');
const record = (over = {}) => ({ archived: false, at: NOW, category: 'completed', detail: 'did it', needsAction: null, prs: [], ...over });

for (const [name, rec, live, ask, group] of [
  ['busy wins over review_ready', record({ category: 'review_ready' }), { status: 'busy' }, null, 'running'],
  ['a pending question is waiting', record(), { status: 'waiting', waitingFor: 'input needed' }, null, 'waiting'],
  ['an unanswered ask at the end of a turn is waiting', record(), { status: 'idle' }, 'Merge it?', 'waiting'],
  ['blocked is waiting', record({ category: 'blocked', needsAction: 'pick one' }), null, null, 'waiting'],
  ['review_ready is waiting', record({ category: 'review_ready', prs: [{ state: 'OPEN' }] }), null, null, 'waiting'],
  ['review_ready with its pull requests merged is finished', record({ category: 'review_ready', prs: [{ state: 'MERGED' }] }), null, null, 'finished'],
  ['idle today is finished', record(), null, null, 'finished'],
  ['archiving dismisses an ask', record({ archived: true }), null, 'Merge it?', 'finished'],
  ['an idle session from before today is parked', record({ at: DAY_START - 1000 }), null, null, 'parked'],
]) {
  test(`session groups: ${name}`, () => {
    assert.equal(classify(rec, live, ask, DAY_START).group, group);
  });
}

test('an archived session from before today is not shown', () => {
  assert.equal(classify(record({ archived: true, at: DAY_START - 1 }), null, null, DAY_START), null);
});

const line = (o) => JSON.stringify(o);
const wrapUp = (ask) => line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__ccd_turn__wrap_up', input: { ask } }] } });

test('lastAsk finds the question a turn ended on and drops it once the person answers', () => {
  const human = line({ type: 'user', message: { content: 'yes' } });
  const toolResult = line({ type: 'user', message: { content: [{ type: 'tool_result' }] } });
  assert.equal(lastAsk([wrapUp('Merge it?'), toolResult].join('\n')), 'Merge it?');
  assert.equal(lastAsk([wrapUp('Merge it?'), human].join('\n')), null);
  assert.equal(lastAsk([wrapUp('Old?'), human, wrapUp(undefined)].join('\n')), null);
});

function claudeFixture() {
  const root = tmp();
  const store = join(root, 'store');
  const records = join(store, 'account', 'org');
  const claudeDir = join(root, 'claude');
  mkdirSync(records, { recursive: true });
  mkdirSync(join(claudeDir, 'sessions'), { recursive: true });
  const project = join(claudeDir, 'projects', '-work-app');
  mkdirSync(project, { recursive: true });
  const write = (id, over = {}) => writeFileSync(join(records, `local_${id}.json`), JSON.stringify({ sessionId: `local_${id}`, cwd: '/work/app', title: id, lastActivityAt: NOW, isArchived: false, cliSessionId: id, ...over }));
  return { store, records, claudeDir, project, write };
}

test('claude source reads real record shapes and places each session', async () => {
  const f = claudeFixture();
  f.write('asks');
  writeFileSync(join(f.project, 'asks.jsonl'), wrapUp('Merge it?'));
  f.write('busy');
  writeFileSync(join(f.claudeDir, 'sessions', '1.json'), JSON.stringify({ pid: process.pid, status: 'busy', hostSessionId: 'local_busy', entrypoint: 'claude-desktop' }));
  writeFileSync(join(f.claudeDir, 'sessions', '2.json'), JSON.stringify({ pid: process.pid, status: 'busy', entrypoint: 'sdk-cli', name: 'review run', sessionId: 'sdk' }));
  writeFileSync(join(f.claudeDir, 'sessions', '3.key'), 'not json');
  f.write('old', { lastActivityAt: DAY_START - 1000 });
  const { items, unread, data } = await claudeSource({ claudeDir: f.claudeDir, store: f.store }).read({ now: NOW });
  const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
  assert.equal(unread, 0);
  assert.equal(byTitle.asks.group, 'waiting');
  assert.equal(byTitle.asks.detail, 'Merge it?');
  assert.equal(byTitle.busy.group, 'running');
  assert.equal(byTitle.asks.url, 'claude://claude.ai/epitaxy/local_asks');
  assert.equal(byTitle['review run'], undefined);
  assert.equal(data.parked, 1);
});

test('a broken record makes the claude source partial, and all broken makes it fail', async () => {
  const f = claudeFixture();
  writeFileSync(join(f.records, 'local_bad.json'), '{ not json');
  const source = claudeSource({ claudeDir: f.claudeDir, store: f.store });
  await assert.rejects(source.read({ now: NOW }), /unknown format/);
  f.write('good');
  const { unread, items } = await source.read({ now: NOW });
  assert.equal(unread, 1);
  assert.equal(items.length, 1);
});

test('a machine with no Claude data reports off', async () => {
  const root = tmp();
  await assert.rejects(claudeSource({ claudeDir: join(root, 'none'), store: join(root, 'nope') }).read({ now: NOW }), SourceOff);
});

test('lastLifecycle reads the newest task event', () => {
  const ev = (type) => line({ payload: { type } });
  assert.equal(lastLifecycle([ev('task_started'), ev('agent_message')].join('\n')), 'task_started');
  assert.equal(lastLifecycle([ev('task_started'), ev('task_complete')].join('\n')), 'task_complete');
  assert.equal(lastLifecycle(ev('agent_message')), null);
});

test('codex source separates running from finished and skips review threads', async () => {
  const dir = tmp();
  const running = join(dir, 'running.jsonl');
  const done = join(dir, 'done.jsonl');
  writeFileSync(running, line({ payload: { type: 'task_started' } }));
  writeFileSync(done, line({ payload: { type: 'task_complete' } }));
  const now = Date.now();
  const at = Math.floor(now / 1000);
  execFileSync('sqlite3', [join(dir, 'state_5.sqlite'), `
    create table threads (id text, rollout_path text, title text, name text, cwd text, source text, updated_at integer, created_at integer, tokens_used integer, model text);
    insert into threads values ('a', '${running}', 'Running thread', null, '/x/.codex/worktrees/1/poise', 'vscode', ${at}, ${at}, 5, 'gpt');
    insert into threads values ('b', '${done}', 'Done thread', 'Named', '/x/app', 'vscode', ${at}, ${at}, 5, 'gpt');
    insert into threads values ('c', '${done}', 'Review', null, '/x/app', 'exec', ${at}, ${at}, 5, 'gpt');`]);
  const { items } = await codexSource({ codexDir: dir }).read({ now, signal: undefined });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId['codex:a'].group, 'running');
  assert.equal(byId['codex:a'].repo, 'poise');
  assert.equal(byId['codex:b'].group, 'finished');
  assert.equal(byId['codex:b'].title, 'Named');
  assert.equal(byId['codex:c'], undefined);
});

test('codex source is off when Codex is not on the machine', async () => {
  await assert.rejects(codexSource({ codexDir: join(tmp(), 'none') }).read({ now: NOW }), SourceOff);
});

function fakeGh(script) {
  const bin = tmp();
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\n${script}\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  return bin;
}

async function withPath(path, fn) {
  const before = process.env.PATH;
  process.env.PATH = path;
  try {
    return await fn();
  } finally {
    process.env.PATH = before;
  }
}

test('github source leaves drafts out and keeps a pull request in one group', async () => {
  const pr = (over) => ({ url: `https://github.com/o/r/pull/${over.number}`, title: 't', isDraft: false, mergeable: 'MERGEABLE', updatedAt: '2026-11-05T10:00:00Z', mergedAt: null, repository: { nameWithOwner: 'o/r' }, commits: { nodes: [] }, reviewThreads: { nodes: [] }, ...over });
  const body = { data: { mine: { issueCount: 2, nodes: [pr({ number: 1 }), pr({ number: 2, isDraft: true })] }, asked: { issueCount: 1, nodes: [pr({ number: 1 })] }, merged: { nodes: [pr({ number: 3, mergedAt: new Date(NOW).toISOString() })] } } };
  const bin = fakeGh(`cat <<'J'\n${JSON.stringify(body)}\nJ`);
  const { items } = await withPath(`${bin}:${process.env.PATH}`, () => githubSource().read({ now: NOW }));
  assert.deepEqual(items.map((i) => [i.id.split('/').pop(), i.group]), [['1', 'waiting'], ['3', 'finished']]);
});

test('a local day reaches GitHub as an exact time, so an early morning merge is found', async () => {
  const bin = fakeGh(`case "$*" in *"merged:>=$EXPECTED"*) ;; *) echo "wrong query: $*" >&2; exit 1 ;; esac
echo '{"data":{"mine":{"issueCount":0,"nodes":[]},"asked":{"issueCount":0,"nodes":[]},"merged":{"nodes":[]}}}'`);
  process.env.EXPECTED = searchTime(startOfDay(NOW));
  assert.match(process.env.EXPECTED, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  await withPath(`${bin}:${process.env.PATH}`, () => githubSource().read({ now: NOW }));
  delete process.env.EXPECTED;
});

test('github source fails with gh\'s own message, and is off without gh', async () => {
  const bin = fakeGh('echo "gh: not logged in" >&2; exit 1');
  await withPath(`${bin}:${process.env.PATH}`, () => assert.rejects(githubSource().read({ now: NOW }), /not logged in/));
  await withPath(tmp(), () => assert.rejects(githubSource().read({ now: NOW }), SourceOff));
});

test('a pull request says what stands in its way', () => {
  const base = { url: 'u', title: 't', number: 1, updatedAt: '2026-11-05T10:00:00Z', repository: { nameWithOwner: 'o/r' } };
  assert.equal(toItem({ ...base }, 'waiting').detail, 'Ready to review or merge');
  const failing = { ...base, mergeable: 'CONFLICTING', reviewThreads: { nodes: [{ isResolved: false }, { isResolved: true }] }, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } };
  assert.equal(toItem(failing, 'waiting').detail, 'checks failing, conflicts, 1 unresolved thread');
});

test('open asks come from each checkout and repo labels survive worktrees', async () => {
  const repo = tmp();
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
  mkdirSync(join(repo, '.specs'));
  writeFileSync(join(repo, '.specs', 'requests.md'), '- first ask\nnot a list line\n- second ask\n');
  assert.deepEqual(parseAsks('- a\n\ntext\n* b'), ['a', 'b']);
  const { items, unread } = await asksSource({ repos: async () => [repo] }).read({});
  assert.deepEqual(items.map((i) => i.title), ['first ask', 'second ask']);
  assert.equal(items[0].group, 'waiting');
  assert.equal(unread, 0);
  assert.equal(repoLabel('/w/poise/.claude/worktrees/x-1/sub'), 'poise');
  assert.equal(repoLabel('/h/.codex/worktrees/ef90/poise'), 'poise');
  const found = await findRepos([process.cwd(), '/private/var/folders/x/repository', '/tmp/nothing-here', '/no/such/dir']);
  assert.equal(found.length, 1);
});

test('parseListeners reads lsof field output', () => {
  assert.deepEqual(parseListeners('p12\ncnode\nf3\nn127.0.0.1:3200\nTST=LISTEN\np13\ncpython\nn*:8000\np14\ncvite\nn[::1]:5173\n'), [
    { pid: 12, command: 'node', port: 3200, host: '127.0.0.1' },
    { pid: 13, command: 'python', port: 8000, host: '127.0.0.1' },
    { pid: 14, command: 'vite', port: 5173, host: '[::1]' },
  ]);
});

test('a slow size measure holds nothing back and lands later', async () => {
  let release;
  const measure = () => new Promise((resolve) => { release = resolve; });
  const size = createSizes(measure);
  assert.equal(size('/a'), null);
  assert.equal(size('/a'), null);
  release(2048);
  await new Promise(setImmediate);
  assert.equal(size('/a'), 2048);
});
