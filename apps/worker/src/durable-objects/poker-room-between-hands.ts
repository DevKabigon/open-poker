import { getHandEligibleSeatIds, type InternalRoomState } from '@openpoker/domain'

export const DEFAULT_BETWEEN_HANDS_DELAY_MS = 10_000
export const DEFAULT_WAITING_ROOM_START_DELAY_MS = 3_000

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp)

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${timestamp}`)
  }

  return parsed
}

export function canScheduleNextHand(state: InternalRoomState): boolean {
  if (state.handStatus !== 'waiting' && state.handStatus !== 'settled') {
    return false
  }

  return getHandEligibleSeatIds(state.seats).length >= state.config.autoStartMinPlayers
}

export function getNextHandDelayMs(state: InternalRoomState): number {
  return state.handStatus === 'waiting'
    ? DEFAULT_WAITING_ROOM_START_DELAY_MS
    : DEFAULT_BETWEEN_HANDS_DELAY_MS
}

export function createNextHandStartAt(
  now: string,
  delayMs: number = DEFAULT_BETWEEN_HANDS_DELAY_MS,
): string {
  return new Date(parseTimestamp(now) + delayMs).toISOString()
}
