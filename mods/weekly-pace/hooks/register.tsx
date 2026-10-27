import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { DayStart, FiveHourReading, WeeklyReading } from '../types'
import { card } from './card'
import type { FiveHour, Today } from './card'
import { COLOR, dayStart, pace, pct, todayStatus, todayTarget, windowStatus, worst } from './pace'

const reading = atom({ plugin: 'weekly-pace', key: 'reading' } as const, null)
const fiveHourReading = atom({ plugin: 'weekly-pace', key: 'fiveHour' } as const, null)
const now = atom({ plugin: 'weekly-pace', key: 'now' } as const, 0)
const isOpen = atom({ plugin: 'weekly-pace', key: 'isOpen' } as const, false)
const start = atom({ plugin: 'weekly-pace', key: 'dayStart' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('reading')
    await update($, reading, () => (stored ?? null) as WeeklyReading | null)
    const storedFive = await $.store.get('fiveHour')
    await update($, fiveHourReading, () => (storedFive ?? null) as FiveHourReading | null)
    const storedStart = await $.store.get('dayStart')
    await update($, start, () => parseDayStart(storedStart))
    const t = await $.clock.now()
    await update($, now, () => t)
    // A start dropped as outdated comes back from the stored reading before the first draw.
    await roll($)
    $.clock.every(60_000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
      await roll($)
    })
    await take($, (await $.session.usage()).rateLimits)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await take($, e.rateLimits)

    return next(e)
  })

  // The footer row under the prompt, where the mode labels sit. The desktop draws it as one
  // line of plain text, so the details open in a card above the prompt on a press.
  // The dot stays outside the Button: a desktop's native button draws the label alone and
  // drops its children, and it places the dot to the right of the button.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const p = await current($)
    if (p === null) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const five = await fiveHour($)
    const fiveStatus = five === null ? 'ok' : windowStatus(five.used)
    // The five-hour window joins the footer only once it nears its limit.
    const label = `${pct(p.used)} / ${pct(p.target)}${fiveStatus === 'ok' ? '' : ` · 5h ${pct(five!.used)}`}`

    return (
      <Box flexDirection="row" alignItems="center">
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')} · </Text>}
        <Text color={COLOR[worst(todayStatus(p.used, p.start, p.target), fiveStatus)]}>• </Text>
        <Button key="pace" plain label={label} onPress={() => update($, isOpen, v => !v)} />
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await current($)
    if (e.props.hasSurvey || p === null || !(await read($, isOpen))) return next(e)

    const staleMs = (await read($, now)) - (await read($, reading))!.readAt

    return card($.ui.resolve(e), p, await fiveHour($), staleMs, () => update($, isOpen, () => false))
  })
}

async function current($: EngineInterface): Promise<Today | null> {
  const r = await read($, reading)
  const t = await read($, now)
  const s = await read($, start)
  if (r === null || r.resetsAt === null || r.resetsAt <= t || s === null) return null

  return { ...pace(r.percentUsed, r.resetsAt, t), start: s, target: todayTarget(s) }
}

/** The five-hour window, or null when unread or already reset. */
async function fiveHour($: EngineInterface): Promise<FiveHour | null> {
  const r = await read($, fiveHourReading)
  const t = await read($, now)
  if (r === null || (r.resetsAt !== null && r.resetsAt <= t)) return null

  return { used: r.percentUsed, msLeft: r.resetsAt === null ? null : r.resetsAt - t }
}

/** Takes the day's starting spend from the latest reading once the day or the window changes. */
async function roll($: EngineInterface) {
  const r = await read($, reading)
  if (r === null || r.resetsAt === null) return

  const prev = await read($, start)
  const next = dayStart(prev, r.percentUsed, r.resetsAt, await read($, now))
  if (next === prev) return
  await update($, start, () => next)
  await $.store.set('dayStart', next)
}

/** A stored start in the current shape, or null: an older version kept `date` in place of `daysLeft`. */
function parseDayStart(v: unknown): DayStart | null {
  const s = v as Partial<DayStart> | null | undefined
  const ok = typeof s?.daysLeft === 'number' && typeof s.percentUsed === 'number' && typeof s.resetsAt === 'number'
  return ok ? (s as DayStart) : null
}

const parseReset =(l: SessionRateLimit) => (l.resetsAt === undefined ? null : Date.parse(l.resetsAt))

async function take($: EngineInterface, limits: SessionRateLimit[]) {
  const t = await $.clock.now()
  await update($, now, () => t)

  const five = limits.find(l => l.kind === 'five_hour')
  if (five !== undefined) {
    const f: FiveHourReading = { percentUsed: five.percentUsed, resetsAt: parseReset(five) }
    await update($, fiveHourReading, () => f)
    await $.store.set('fiveHour', f)
  }

  const week = limits.find(l => l.kind === 'seven_day')
  if (week === undefined) return

  const r: WeeklyReading = { percentUsed: week.percentUsed, resetsAt: parseReset(week), readAt: t }
  await update($, reading, () => r)
  await $.store.set('reading', r)
  await roll($)
}
