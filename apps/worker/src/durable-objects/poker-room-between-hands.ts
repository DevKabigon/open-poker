import {
  getHandEligibleSeatIds,
  type InternalRoomState,
  type PlayerSeatState,
} from '@openpoker/domain'

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

function resetSeatForWaiting(state: PlayerSeatState): PlayerSeatState {
  return {
    ...state,
    committed: 0,
    totalCommitted: 0,
    hasFolded: false,
    isAllIn: false,
    isSittingOut: state.isSittingOut || state.isSittingOutNextHand,
    isSittingOutNextHand: false,
    isWaitingForNextHand: false,
    actedThisStreet: false,
    lastAction: null,
    holeCards: null,
  }
}

export function clearSettledHandForWaiting(
  state: InternalRoomState,
  now: string,
): InternalRoomState {
  if (state.handStatus !== 'settled') {
    throw new Error('Only a settled hand can be cleared back to waiting.')
  }

  return {
    ...state,
    handId: null,
    handStatus: 'waiting',
    street: 'idle',
    smallBlindSeat: null,
    bigBlindSeat: null,
    actingSeat: null,
    pendingActionSeatIds: [],
    raiseRightsSeatIds: [],
    board: [],
    burnCards: [],
    deck: [],
    mainPot: 0,
    sidePots: [],
    currentBet: 0,
    lastFullRaiseSize: state.config.bigBlind,
    actionSequence: 0,
    showdownSummary: null,
    seats: state.seats.map(resetSeatForWaiting),
    updatedAt: now,
  }
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
