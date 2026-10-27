import type { EngineInterface } from 'claude-code'

import type { DayStart } from '../types'
import { COLOR, bar, clock, dayEnd, fmtLeft, paceLine, pct, status, todaySpend, todayStatus, windowStatus } from './pace'
import type { Pace, Run } from './pace'

export type Today = Pace & { start: DayStart; target: number }

/** The five-hour window now; `msLeft` null when the API gave no reset. */
export type FiveHour = { used: number; msLeft: number | null }

const CELLS = 28
const LABEL = 13

/** The details card: the day's share first, then the week, then the five-hour window when read. */
export function card(
  els: ReturnType<EngineInterface['ui']['resolve']>,
  p: Today,
  fiveHour: FiveHour | null,
  staleMs: number,
  onClose: () => void,
) {
  const { Box, Text, Button } = els
  const { spent, share } = todaySpend(p.used, p.start, p.target)
  const left = share - spent
  const row = (label: string, fill: number, color: string, value: string, note: string | null) => (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box width={LABEL}>
          <Text>{label}</Text>
        </Box>
        <Text>
          {bar(fill, CELLS, color).map((run: Run) => (
            <Text color={run.color} dimColor={run.dim}>
              {run.text}
            </Text>
          ))}
        </Text>
        <Text>  {value}</Text>
      </Box>
      {note !== null && (
        <Box paddingLeft={LABEL}>
          <Text dimColor>└ {note}</Text>
        </Box>
      )}
    </Box>
  )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Usage limits</Text>
        <Button key="close" plain role="dismiss" label="Close" onPress={onClose} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {row(
          `Until ${clock(dayEnd(p.start))}`,
          share > 0 ? spent / share : 1,
          COLOR[todayStatus(p.used, p.start, p.target)],
          left >= 0 ? `${pct(left)} left` : `${pct(-left)} over`,
          // A day that began past an even pace has no share of its own.
          share > 0
            ? `${pct(spent)} of the day's ${pct(share)} spent · weekly cap ${pct(p.target)}`
            : `${pct(spent)} spent today · weekly cap ${pct(p.target)}`,
        )}
        {row(
          'Week',
          p.used / 100,
          COLOR[status(p.aheadDays)],
          `${pct(p.used)} used`,
          `${paceLine(p)} · resets in ${fmtLeft(p.msLeft)}`,
        )}
        {fiveHour !== null &&
          row(
            '5 hours',
            fiveHour.used / 100,
            COLOR[windowStatus(fiveHour.used)],
            `${pct(fiveHour.used)} used`,
            fiveHour.msLeft === null ? null : `resets in ${fmtLeft(fiveHour.msLeft)}`,
          )}
      </Box>
      {staleMs > 15 * 60_000 && (
        <Box paddingLeft={LABEL} marginTop={1}>
          <Text dimColor>updated {fmtLeft(staleMs)} ago, refreshes after each reply</Text>
        </Box>
      )}
    </Box>
  )
}
