/** The spend when the day began, taken from the first reading of the day. A day ends at the reset time of day. */
export type DayStart = { daysLeft: number; percentUsed: number; resetsAt: number }

export type WeeklyReading = {
  /** 0 to 100, as the rate-limit window reports it. */
  percentUsed: number
  /** Epoch ms when the seven-day window resets; null when the API gave none. */
  resetsAt: number | null
  /** Epoch ms when this reading arrived. */
  readAt: number
}

/** The five-hour window as last read. */
export type FiveHourReading = {
  /** 0 to 100. */
  percentUsed: number
  /** Epoch ms when the window resets; null when the API gave none. */
  resetsAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'weekly-pace': {
      reading: WeeklyReading | null
      fiveHour: FiveHourReading | null
      now: number
      isOpen: boolean
      dayStart: DayStart | null
    }
  }
}
