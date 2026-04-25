import { getHandEligibleSeatIds, type InternalRoomState } from '@openpoker/domain'

export const DEFAULT_BETWEEN_HANDS_DELAY_MS = 3_000

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp)

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${timestamp}`)
  }

  return parsed
}

export function canScheduleNextHand(state: InternalRoomState): boolean {
  if (state.handStatus !== 'settled') {
    return false
  }

  return getHandEligibleSeatIds(state.seats).length >= state.config.autoStartMinPlayers
}

export function createNextHandStartAt(
  now: string,
  delayMs: number = DEFAULT_BETWEEN_HANDS_DELAY_MS,
): string {
  return new Date(parseTimestamp(now) + delayMs).toISOString()
}
