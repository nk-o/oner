import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, bucketize, dayList, mergeDays, normalize, parseRange, presetRange, rangeToQuery, sumDays } from '../ui/range.js';

const TODAY = '2026-11-05';
const EARLIEST = '2025-10-01';

test('with nothing chosen the charts show the last 30 days including today', () => {
  const range = parseRange('', TODAY, EARLIEST);
  assert.deepEqual(range, { from: '2026-10-07', to: TODAY, preset: 30 });
  assert.equal(dayList(range.from, range.to).length, 30);
  assert.equal(rangeToQuery(range), '');
});

test('a range survives a reload through the address', () => {
  const custom = normalize('2026-10-05', '2026-10-20', TODAY, EARLIEST);
  assert.equal(rangeToQuery(custom), 'from=2026-10-05&to=2026-10-20');
  assert.deepEqual(parseRange(`?${rangeToQuery(custom)}`, TODAY, EARLIEST), custom);
  const preset = presetRange(90, TODAY);
  assert.equal(rangeToQuery(preset), 'range=90');
  assert.deepEqual(parseRange('?range=90', TODAY, EARLIEST), preset);
});

test('reversed dates swap, the future and the distant past are clamped', () => {
  assert.deepEqual(normalize('2026-10-20', '2026-10-05', TODAY, EARLIEST), { from: '2026-10-05', to: '2026-10-20', preset: null });
  assert.equal(normalize('2026-10-01', '2031-01-01', TODAY, EARLIEST).to, TODAY);
  const future = normalize('2031-01-01', '2031-02-01', TODAY, EARLIEST);
  assert.deepEqual([future.from, future.to], [TODAY, TODAY]);
  assert.equal(normalize('2001-01-01', '2026-10-01', TODAY, EARLIEST).from, EARLIEST);
});

test('dates that match a preset select it, and nonsense falls back to the default', () => {
  assert.equal(normalize('2026-10-30', TODAY, TODAY, EARLIEST).preset, 7);
  for (const search of ['?from=nope&to=2026-10-01', '?from=2026-13-45&to=2026-10-01', '?range=12']) {
    assert.equal(parseRange(search, TODAY, EARLIEST).preset, 30, search);
  }
});

test('bars are days up to two months, then weeks, then months, and lose no day', () => {
  const days = bucketize(addDays(TODAY, -61), TODAY);
  assert.equal(days.unit, 'day');
  assert.equal(days.buckets.length, 62);
  assert.equal(bucketize(addDays(TODAY, -89), TODAY).unit, 'week');
  const weeks = bucketize(addDays(TODAY, -364), TODAY);
  assert.equal(weeks.unit, 'week');
  assert.equal(weeks.buckets.flatMap((b) => b.days).length, 365);
  assert.equal(new Date(`${weeks.buckets[1].key}T00:00:00Z`).getUTCDay(), 1);
  const months = bucketize('2024-01-15', TODAY);
  assert.equal(months.unit, 'month');
  assert.equal(months.buckets[0].key, '2024-01');
  assert.equal(months.buckets.flatMap((b) => b.days).length, dayList('2024-01-15', TODAY).length);
});

test('a range crossing a clock change keeps every day once', () => {
  const list = dayList('2026-03-28', '2026-03-31');
  assert.deepEqual(list, ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
});

test('sums cover only the chosen days', () => {
  const daily = {
    '2026-10-01': { merged: 2, repos: { a: 1, b: 1 }, models: { opus: { output: 5 } } },
    '2026-10-02': { merged: 3, repos: { a: 3 }, models: { opus: { output: 7 } } },
    '2026-10-03': { merged: 100, repos: { c: 100 } },
  };
  const days = ['2026-10-01', '2026-10-02', '2026-09-30'];
  assert.equal(sumDays(daily, days, (d) => d.merged), 5);
  assert.deepEqual(mergeDays(daily, days, 'repos'), { a: 4, b: 1 });
  assert.deepEqual(mergeDays(daily, days, 'models'), { opus: { output: 12 } });
  assert.equal(sumDays(undefined, days, (d) => d.merged), 0);
});
