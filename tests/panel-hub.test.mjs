import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHub } from '../panel/hub.mjs';
import { SourceOff } from '../panel/run.mjs';
import { assemble } from '../panel/today.mjs';

const source = (read, extra = {}) => ({ id: 's', label: 'S', interval: 1000, timeout: 1000, read, ...extra });

function setup(read, extra) {
  let time = 1_000_000;
  const hub = createHub([source(read, extra)], { clock: () => time });
  return {
    hub,
    tick: (ms) => { time += ms; },
    read: async () => {
      hub.snapshot(['s']);
      await hub.settled(['s']);
      return hub.snapshot(['s'])[0];
    },
  };
}

test('a failed source reports not checked with its reason and keeps its last known items', async () => {
  let fail = false;
  const { read, tick } = setup(async () => {
    if (fail) throw new Error('gh is signed out');
    return { items: [{ id: 'a' }] };
  });
  const first = await read();
  assert.equal(first.state, 'ok');
  fail = true;
  tick(1000);
  const failed = await read();
  assert.equal(failed.state, 'failed');
  assert.equal(failed.reason, 'gh is signed out');
  assert.deepEqual(failed.items, [{ id: 'a' }]);
  assert.equal(failed.checkedAt, first.checkedAt);
});

test('a source that never answered has no items and no check time, so it cannot read as empty', async () => {
  const { read } = setup(async () => { throw new Error('boom'); });
  const view = await read();
  assert.equal(view.state, 'failed');
  assert.equal(view.checkedAt, null);
});

test('a tool that is absent is off, not failed', async () => {
  const { read } = setup(async () => { throw new SourceOff('no gh'); });
  const view = await read();
  assert.equal(view.state, 'off');
  assert.equal(view.reason, 'no gh');
});

test('unread records make a source partial', async () => {
  const { read } = setup(async () => ({ items: [], unread: 2 }));
  const view = await read();
  assert.equal(view.state, 'partial');
  assert.equal(view.unread, 2);
});

test('stale turns on when a source stops answering', async () => {
  let fail = false;
  const s = setup(async () => {
    if (fail) throw new Error('down');
    return { items: [] };
  });
  await s.read();
  fail = true;
  s.tick(2500);
  const view = await s.read();
  assert.equal(view.stale, true);
});

test('any number of callers cause one read per source', async () => {
  let reads = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const hub = createHub([source(async () => { reads++; await gate; return { items: [] }; })]);
  hub.snapshot(['s']);
  hub.snapshot(['s']);
  hub.snapshot(['s'], { force: true });
  await new Promise(setImmediate);
  assert.equal(reads, 1);
  release();
  await hub.settled(['s']);
});

test('a slow source times out alone and the other one still answers', async () => {
  const hub = createHub([
    source(() => new Promise(() => {}), { id: 'slow', timeout: 20 }),
    source(async () => ({ items: [{ id: 'x' }] }), { id: 'fast' }),
  ]);
  hub.snapshot(['slow', 'fast']);
  await hub.settled(['fast']);
  assert.equal(hub.snapshot(['fast'])[0].state, 'ok');
  assert.equal(hub.snapshot(['slow'])[0].state, 'checking');
  await hub.settled(['slow']);
  const [slow] = hub.snapshot(['slow']);
  assert.equal(slow.state, 'failed');
  assert.match(slow.reason, /no answer/);
});

test('one item sits in one group, and a pull request a running session holds shows on that session', () => {
  const session = { id: 'c', kind: 'session', group: 'running', at: 2, prUrls: ['https://github.com/o/r/pull/1'] };
  const held = { id: 'p1', kind: 'pr', group: 'waiting', at: 1, url: 'https://github.com/o/r/pull/1', detail: 'checks running' };
  const free = { id: 'p2', kind: 'pr', group: 'waiting', at: 1, url: 'https://github.com/o/r/pull/2' };
  const groups = assemble([{ state: 'ok', items: [session, held, free] }]);
  assert.deepEqual(groups.waiting.map((i) => i.id), ['p2']);
  assert.equal(groups.running[0].pr.url, held.url);
});

test('items from a failed source say how old they are', () => {
  const item = { id: 'x', kind: 'ask', group: 'waiting', at: 1 };
  const groups = assemble([{ state: 'failed', checkedAt: 555, items: [item] }]);
  assert.equal(groups.waiting[0].from, 555);
});

test('waiting orders by who waits, then oldest first, and the order is stable', () => {
  const items = [
    { id: 'ask', kind: 'ask', group: 'waiting', at: 1 },
    { id: 'pr', kind: 'pr', group: 'waiting', at: 1 },
    { id: 'new', kind: 'session', group: 'waiting', at: 9 },
    { id: 'old', kind: 'session', group: 'waiting', at: 2 },
  ];
  const order = () => assemble([{ state: 'ok', items }]).waiting.map((i) => i.id);
  assert.deepEqual(order(), ['old', 'new', 'pr', 'ask']);
  assert.deepEqual(order(), order());
});

test('a range asked for during a read is read right after it', async () => {
  let finish;
  let reads = 0;
  let from = '2026-10-01';
  const source = { id: 'stats-prs', label: 'PRs', interval: 3600000, timeout: 5000, read: async () => { reads++; await new Promise((r) => { finish = r; }); return { data: { from } }; } };
  const hub = createHub([source]);
  const ask = (day) => {
    const [view] = hub.snapshot(['stats-prs']);
    if (!view.checking && view.data && view.data.from > day) hub.snapshot(['stats-prs'], { force: true });
    return hub.snapshot(['stats-prs'])[0];
  };
  ask('2026-08-01');
  await new Promise(setImmediate);
  finish();
  await hub.settled(['stats-prs']);
  from = '2026-08-01';
  assert.equal(ask('2026-08-01').checking, true);
  await new Promise(setImmediate);
  assert.equal(reads, 2);
  finish();
  await hub.settled(['stats-prs']);
  assert.equal(ask('2026-08-01').checking, false);
  assert.equal(reads, 2);
});
