import type { DayStart } from '../types'

export const DAY = 86_400_000
export const WEEK = 7 * DAY
const PER_DAY = 100 / 7

export type Pace = {
  used: number
  /** Where an even spend would stand now, 0 to 100. */
  expected: number
  /** expected - used in days of even spend: positive is reserve, negative overspend. */
  aheadDays: number
  msLeft: number
}

export function pace(used: number, resetsAt: number, now: number): Pace {
  const msLeft = Math.min(WEEK, Math.max(0, resetsAt - now))
  const elapsed = WEEK - msLeft
  const expected = (elapsed / WEEK) * 100

  return {
    used,
    expected,
    aheadDays: (expected - used) / PER_DAY,
    msLeft,
  }
}

/** Days to the reset, the current one included. Days run from one reset time of day to the next. */
const daysLeft = (resetsAt: number, now: number) => Math.ceil((resetsAt - now) / DAY)

/**
 * Keeps `prev` while its day and window last; otherwise the spend now starts the day.
 * The window's first day begins at the reset, at 0%, however late its first reading comes.
 */
export function dayStart(prev: DayStart | null, used: number, resetsAt: number, now: number): DayStart {
  const days = daysLeft(resetsAt, now)
  if (prev?.daysLeft === days && prev.resetsAt === resetsAt) return prev
  return { daysLeft: days, percentUsed: days >= 7 ? 0 : used, resetsAt }
}

/** When the current day ends: the reset time of day. */
export const dayEnd = (start: DayStart) => start.resetsAt - (start.daysLeft - 1) * DAY

/**
 * The day's limit: the spend at its start plus an equal share of what was left then,
 * but never past an even pace at the day's end, so overspending does not raise it.
 */
export function todayTarget(start: DayStart): number {
  const even = (8 - start.daysLeft) * PER_DAY
  return Math.min(even, start.percentUsed + Math.max(0, 100 - start.percentUsed) / start.daysLeft)
}

export type Status = 'ok' | 'warn' | 'over'

/** Green up to about 2 points over the even pace, orange up to 10, red past that. */
export function status(aheadDays: number): Status {
  if (aheadDays >= -0.15) return 'ok'
  if (aheadDays >= -0.7) return 'warn'
  return 'over'
}

/** Green under 80% of today's share, orange up to the limit, red past it. */
export function todayStatus(used: number, start: DayStart, target: number): Status {
  if (used > target) return 'over'
  if (used >= start.percentUsed + 0.8 * (target - start.percentUsed)) return 'warn'
  return 'ok'
}

export const COLOR: Record<Status, string> = { ok: '#3fb950', warn: '#e3892b', over: '#f85149' }

export const pct = (n: number) => `${Math.round(n)}%`

/** How far the spend is from the even pace, in points of the weekly limit. */
export function paceLine(p: Pace): string {
  const delta = Math.round(p.used - p.expected)
  if (delta > 0) return `${delta}% over an even pace`
  if (delta < 0) return `${-delta}% under an even pace`
  return 'on an even pace'
}

/** Green under 70% of a window, orange up to 90%, red past that. */
export function windowStatus(used: number): Status {
  if (used >= 90) return 'over'
  if (used >= 70) return 'warn'
  return 'ok'
}

const RANK: Record<Status, number> = { ok: 0, warn: 1, over: 2 }

export const worst = (...all: Status[]): Status => all.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok')

/** What today has spent of its share: the points since this morning against the points it may add. */
export function todaySpend(used: number, start: DayStart, target: number) {
  return { spent: Math.max(0, used - start.percentUsed), share: target - start.percentUsed }
}

/** One styled stretch of text. */
export type Run = { text: string; color?: string; dim?: boolean }

/** A dithered bar of `cells`: `▓` in `color` up to `fill` (0 to 1), `░` dim after. */
export function bar(fill: number, cells: number, color: string): Run[] {
  const n = Math.round(Math.min(1, Math.max(0, fill)) * cells)
  const runs: Run[] = [
    { text: '▓'.repeat(n), color },
    { text: '░'.repeat(cells - n), dim: true },
  ]
  return runs.filter(r => r.text.length > 0)
}

export function fmtLeft(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

/** Local time of day as HH:MM. */
export function clock(t: number): string {
  const d = new Date(Math.round(t / 60_000) * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
