import { getHandEligibleSeatIds, type InternalRoomState } from '@openpoker/domain'

export const DEFAULT_BETWEEN_HANDS_DELAY_MS = 10_000
export const DEFAULT_UNCONTESTED_HAND_DELAY_MS = 5_000
export const DEFAULT_WAITING_ROOM_START_DELAY_MS = 3_000

export interface NextHandDelayOptions {
  settledHandJustCompleted?: boolean
}

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

function isSettledShowdown(state: InternalRoomState): boolean {
  return (state.showdownSummary?.handEvaluations.length ?? 0) > 0
}

export function getNextHandDelayMs(
  state: InternalRoomState,
  options: NextHandDelayOptions = {},
): number {
  if (state.handStatus === 'waiting') {
    return DEFAULT_WAITING_ROOM_START_DELAY_MS
  }

  if (state.handStatus === 'settled') {
    if (!options.settledHandJustCompleted) {
      return DEFAULT_WAITING_ROOM_START_DELAY_MS
    }

    return isSettledShowdown(state)
      ? DEFAULT_BETWEEN_HANDS_DELAY_MS
      : DEFAULT_UNCONTESTED_HAND_DELAY_MS
  }

  return DEFAULT_BETWEEN_HANDS_DELAY_MS
}

export function createNextHandStartAt(
  now: string,
  delayMs: number = DEFAULT_BETWEEN_HANDS_DELAY_MS,
): string {
  return new Date(parseTimestamp(now) + delayMs).toISOString()
}
