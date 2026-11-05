import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { aggregate, claudeStatsSource, monthsBetween, prStatsSource, scanTranscript, windowStart } from '../panel/stats.mjs';

const roots = [];
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-stats-'));
  roots.push(dir);
  return dir;
};

const SECRET = 'text-from-the-conversation';
const at = new Date().toISOString();
const assistant = (id, output) => JSON.stringify({ type: 'assistant', timestamp: at, cwd: '/w/poise/.claude/worktrees/a', entrypoint: 'claude-desktop', message: { id, model: 'opus', content: [{ type: 'text', text: SECRET }], usage: { input_tokens: 1, output_tokens: output, cache_read_input_tokens: 10, cache_creation_input_tokens: 2 } } });

test('a streamed message counts once with its final usage', async () => {
  const file = join(tmp(), 'a.jsonl');
  writeFileSync(file, [assistant('m1', 5), assistant('m1', 7), assistant('m2', 1)].join('\n'));
  const summary = await scanTranscript(file);
  const [models] = Object.values(summary.tokens);
  assert.equal(models.opus.output, 8);
  assert.equal(summary.repo, 'poise');
  assert.equal(summary.entry, 'claude-desktop');
});

test('review runs count nothing and subagents add tokens, not sessions', () => {
  const day = new Date().toISOString().slice(0, 10);
  const row = { input: 1, output: 10, cacheRead: 0, cacheWrite: 0 };
  const tokens = { [day]: { opus: row } };
  const { daily } = aggregate([
    { entry: 'claude-desktop', repo: 'poise', day, sub: false, turns: true, tokens },
    { entry: 'claude-desktop', repo: 'poise', day, sub: true, turns: true, tokens },
    { entry: 'sdk-cli', repo: 'poise', day, sub: false, turns: true, tokens },
  ], Date.parse(`${day}T00:00:00`) - 86400000);
  assert.equal(daily[day].sessions, 1);
  assert.equal(daily[day].models.opus.output, 20);
  assert.equal(daily[day].repos.poise, 20);
});

test('a second run reads only changed files, and the cache holds no transcript text', async () => {
  const root = tmp();
  const claudeDir = join(root, 'claude');
  const project = join(claudeDir, 'projects', 'p');
  mkdirSync(join(project, 'sid', 'subagents'), { recursive: true });
  writeFileSync(join(project, 'one.jsonl'), assistant('m1', 5));
  writeFileSync(join(project, 'sid', 'subagents', 'a.jsonl'), assistant('m9', 3));
  const cacheFile = join(root, 'cache.json');
  const source = claudeStatsSource({ claudeDir, cacheFile });
  const signal = new AbortController().signal;
  const first = await source.read({ signal, now: Date.now() });
  assert.equal(first.data.read, 2);
  assert.equal(Object.values(first.data.daily).reduce((a, d) => a + d.sessions, 0), 1);
  const second = await source.read({ signal, now: Date.now() });
  assert.equal(second.data.read, 0);
  assert.deepEqual(second.data.daily, first.data.daily);
  assert.equal(readFileSync(cacheFile, 'utf8').includes(SECRET), false);
  writeFileSync(join(project, 'two.jsonl'), assistant('m2', 5));
  assert.equal((await source.read({ signal, now: Date.now() })).data.read, 1);
});

test('the window covers thirty days including today', () => {
  const now = Date.parse('2026-11-05T12:00:00');
  assert.equal(new Date(windowStart(now)).getDate(), 7);
});

test('months cover a range once, across a new year', () => {
  assert.deepEqual(monthsBetween(Date.UTC(2025, 10, 20), Date.UTC(2026, 1, 3)), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('pull requests load a month at a time, finished months stay cached, and older ones load only when asked', async () => {
  const root = tmp();
  const log = join(root, 'calls.log');
  writeFileSync(join(root, 'gh'), `#!/bin/sh
echo "$*" >> "${log}"
echo '{"data":{"search":{"issueCount":1,"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[{"mergedAt":"2026-10-15T10:00:00Z","repository":{"nameWithOwner":"o/r"}}]}}}'
`);
  chmodSync(join(root, 'gh'), 0o755);
  const before = process.env.PATH;
  process.env.PATH = `${root}:${before}`;
  const calls = () => readFileSync(log, 'utf8').split('api graphql').length - 1;
  const now = Date.UTC(2026, 10, 5);
  try {
    const source = prStatsSource({ cacheFile: join(root, 'prs.json') });
    const signal = new AbortController().signal;
    const first = await source.read({ signal, now });
    assert.equal(calls(), 2);
    assert.equal(first.data.daily['2026-10-15'].repos['o/r'], 2);
    await source.read({ signal, now });
    assert.equal(calls(), 3);
    source.want(Date.UTC(2026, 7, 1));
    source.want(Date.UTC(2026, 8, 1));
    await source.read({ signal, now });
    assert.equal(calls(), 6);
  } finally {
    process.env.PATH = before;
  }
});
