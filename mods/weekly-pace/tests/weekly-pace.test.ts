import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { DAY, bar, clock, dayEnd, dayStart, pace, paceLine, todayStatus, todayTarget, windowStatus, worst } from '../hooks/pace'

const NOW = new Date(2026, 9, 18, 12).getTime()
const local = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime()
const at = (used: number) => pace(used, NOW + 4.5 * DAY, NOW)

test('pace measures spend against an even week', async () => {
  // 2.5 days into the window, 42% spent: even pace is 35.7%.
  const p = at(42)
  expect(Math.round(p.expected * 10)).toBe(357)
  expect(Math.round(p.aheadDays * 100)).toBe(-44)
})

test("the day's limit splits the rest evenly over the days to the reset", async () => {
  // Sunday 10:00, 30% used, reset Wednesday 17:00: the day runs to 17:00 and is one of 4 left.
  const start = dayStart(null, 30, local(21, 17), local(18, 10))
  expect(start.percentUsed).toBe(30)
  expect(todayTarget(start)).toBe(47.5)
  expect(dayEnd(start)).toBe(local(18, 17))
  expect(clock(dayEnd(start))).toBe('17:00')
  expect(todayStatus(40, start, 47.5)).toBe('ok')
  expect(todayStatus(45, start, 47.5)).toBe('warn')
  expect(todayStatus(48, start, 47.5)).toBe('over')

  // The day keeps its start until the reset time of day; then a new one begins, and a new window begins at 0%.
  expect(dayStart(start, 58, local(21, 17), local(18, 16))).toBe(start)
  expect(dayStart(start, 58, local(21, 17), local(18, 17)).percentUsed).toBe(58)
  expect(dayStart(start, 2, local(25, 15), local(18, 16)).percentUsed).toBe(0)

  // A day that begins past an even pace stops at an even pace: the fourth day at four sevenths.
  const over = dayStart(null, 62, local(21, 17), local(18, 10))
  expect(Math.round(todayTarget(over) * 100)).toBe(5714)
  expect(todayStatus(64, over, todayTarget(over))).toBe('over')

  // On the reset day the rest is all the day's; a window that just began gives the day a seventh.
  expect(todayTarget(dayStart(null, 90, local(21, 17), local(21, 9)))).toBe(100)
  expect(Math.round(todayTarget(dayStart(null, 0, local(25, 17), local(18, 18))) * 100)).toBe(1429)
})

test("the window's first day starts at 0% even when its first reading comes late", async () => {
  // The window began Sunday 17:00; its first reading, Monday 14:00, shows 3% that the first day spent.
  const start = dayStart(null, 3, local(25, 17), local(19, 14))
  expect(start.percentUsed).toBe(0)
  expect(Math.round(todayTarget(start) * 100)).toBe(1429)
  expect(todayStatus(15, start, todayTarget(start))).toBe('over')
})

test('the bar fills to the share spent and the lines name the pace', async () => {
  expect(bar(0.25, 8, '#3fb950').map(r => r.text).join('')).toBe('▓▓░░░░░░')
  expect(bar(1.4, 4, '#3fb950')).toEqual([{ text: '▓▓▓▓', color: '#3fb950' }])
  expect(paceLine(at(42))).toBe('6% over an even pace')
  expect(paceLine(at(30))).toBe('6% under an even pace')
  expect(windowStatus(69)).toBe('ok')
  expect(windowStatus(70)).toBe('warn')
  expect(windowStatus(90)).toBe('over')
  expect(worst('ok', 'over', 'warn')).toBe('over')
})

test('a press on the footer opens the details card', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/' }))
  on('session.measure', () => ({ changed: ['rateLimits'] }))
  // The engine's own drawing of a site the mod passes on.
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(NOW + 2 * 3_600_000).toISOString() },
      { kind: 'seven_day', percentUsed: 42, resetsAt: new Date(NOW + 4.5 * DAY).toISOString() },
    ],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'weekly-pace', surface, component: 'SessionMode', props: { modes: ['focus'] } })
    const card = await $.ui.mount({
      plugin: 'weekly-pace',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9, rows: 0 } },
    } as never)
    // 4.5 days to a reset at midnight: the day runs to midnight and, past an even pace, stops at three sevenths.
    // The dot stands outside the Button, which a desktop draws as its label alone.
    expect(await ui.find({ type: 'Button', text: '42% / 43%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '• ' })).toBeDefined()
    expect(await card.find({ type: 'Text', text: 'Usage limits' })).toBeUndefined()

    await ui.press({ key: 'pace' })
    // Nothing spent since the day began: its whole share, under a point, is left.
    expect(await card.find({ type: 'Text', text: 'Until 00:00' })).toBeDefined()
    expect(await card.find({ type: 'Text', text: /1% left/ })).toBeDefined()
    expect(await card.find({ type: 'Text', text: /6% over an even pace · resets in 4d 12h/ })).toBeDefined()
    expect(await card.find({ type: 'Text', text: /resets in 2h 0m/ })).toBeDefined()

    await card.press({ key: 'close' })
    expect(await card.find({ type: 'Text', text: 'Usage limits' })).toBeUndefined()
    await ui.unmount()
    await card.unmount()
  }
})

test('a day start stored by an older version is taken again from the stored reading', async ($, on) => {
  mock.clock(on, { now: NOW })
  const stored: Record<string, unknown> = {
    reading: { percentUsed: 42, resetsAt: NOW + 4.5 * DAY, readAt: NOW },
    dayStart: { date: '2026-10-18', percentUsed: 40, resetsAt: NOW + 4.5 * DAY },
  }
  on('store.get', (_$, e) => ({ value: stored[e.key] ?? null }))
  on('store.set', (_$, e) => {
    stored[e.key] = e.value
    return {}
  })
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/' }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'weekly-pace', surface: 'desktop', component: 'SessionMode', props: { modes: [] } })
  expect(await ui.find({ type: 'Button', text: '42% / 43%' })).toBeDefined()
  await ui.unmount()
})

test('the footer names the five-hour window once it nears the limit',async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/' }))
  on('session.measure', () => ({ changed: ['rateLimits'] }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 85, resetsAt: new Date(NOW + 3_600_000).toISOString() },
      { kind: 'seven_day', percentUsed: 42, resetsAt: new Date(NOW + 4.5 * DAY).toISOString() },
    ],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'weekly-pace', surface, component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ type: 'Button', text: '42% / 43% · 5h 85%' })).toBeDefined()
    // Today is green, the five-hour window orange: the dot takes the worse.
    expect((await ui.drawn()).children).toContainEqual(expect.objectContaining({ props: expect.objectContaining({ color: '#e3892b' }) }))
    await ui.unmount()
  }
})

test('a day that begins past an even pace shows how far over it is', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/' }))
  on('session.measure', () => ({ changed: ['rateLimits'] }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 64, resetsAt: new Date(NOW + 3.5 * DAY).toISOString() }],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ plugin: 'weekly-pace', surface: 'desktop', component: 'SessionMode', props: { modes: [] } })
  const card = await $.ui.mount({
    plugin: 'weekly-pace',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9, rows: 0 } },
  } as never)
  // The fourth day of seven stops at 57%, which the week passed before the day began.
  expect(await ui.find({ type: 'Button', text: '64% / 57%' })).toBeDefined()
  await ui.press({ key: 'pace' })
  expect(await card.find({ type: 'Text', text: /7% over/ })).toBeDefined()
  expect(await card.find({ type: 'Text', text: /0% spent today · weekly cap 57%/ })).toBeDefined()
  await ui.unmount()
  await card.unmount()
})
