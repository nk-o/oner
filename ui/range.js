// The date range behind the charts. Pure, so it runs in the page and in the tests.
export const PRESETS = [7, 30, 90, 365];
export const DEFAULT_PRESET = 30;

const DAY = 86400000;
const toMs = (day) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDay = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text ?? '') && !Number.isNaN(toMs(text));

export const addDays = (day, n) => toDay(toMs(day) + n * DAY);

export function presetRange(days, today) {
  return { from: addDays(today, 1 - days), to: today, preset: days };
}

// A reversed pair is taken as the person meant it, and the future holds no data.
export function normalize(from, to, today, earliest) {
  let [a, b] = from <= to ? [from, to] : [to, from];
  if (b > today) b = today;
  if (a > today) a = today;
  if (a < earliest) a = earliest;
  if (b < a) b = a;
  return { from: a, to: b, preset: PRESETS.find((days) => b === today && a === addDays(today, 1 - days)) ?? null };
}

export function parseRange(search, today, earliest) {
  const params = new URLSearchParams(search);
  const from = params.get('from');
  const to = params.get('to');
  if (isDay(from) && isDay(to)) return normalize(from, to, today, earliest);
  const days = Number(params.get('range'));
  return presetRange(PRESETS.includes(days) ? days : DEFAULT_PRESET, today);
}

export function rangeToQuery(range) {
  if (range.preset === DEFAULT_PRESET) return '';
  return range.preset ? `range=${range.preset}` : `from=${range.from}&to=${range.to}`;
}

export function dayList(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

// Bars stay readable at any range: days up to two months, weeks up to about a year, then months.
export function bucketize(from, to) {
  const days = dayList(from, to);
  const unit = days.length <= 62 ? 'day' : days.length <= 400 ? 'week' : 'month';
  if (unit === 'day') return { unit, buckets: days.map((day) => ({ key: day, days: [day] })) };
  const buckets = [];
  let current = null;
  for (const day of days) {
    const date = new Date(toMs(day));
    const key = unit === 'month' ? day.slice(0, 7) : addDays(day, -((date.getUTCDay() + 6) % 7));
    if (current?.key !== key) buckets.push((current = { key, days: [] }));
    current.days.push(day);
  }
  return { unit, buckets };
}

export const sumDays = (daily, days, pick) => days.reduce((sum, day) => sum + (daily?.[day] ? pick(daily[day]) : 0), 0);

// Adds up a per-key map across the range, such as tokens by project.
export function mergeDays(daily, days, field) {
  const out = {};
  for (const day of days) {
    for (const [key, value] of Object.entries(daily?.[day]?.[field] ?? {})) {
      if (typeof value === 'number') out[key] = (out[key] ?? 0) + value;
      else {
        out[key] ??= {};
        for (const [k, v] of Object.entries(value)) out[key][k] = (out[key][k] ?? 0) + v;
      }
    }
  }
  return out;
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n) => compactNumber.format(n);
