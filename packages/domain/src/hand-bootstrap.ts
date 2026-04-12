import { getPreflopActingOrder } from './acting-order'
import {
  getBlindSeatAssignmentsForNextHand,
  type BlindSeatAssignments,
} from './blind-order'
import { assertRoomStateInvariants } from './invariants'
import { createShuffledDeck } from './deck'
import {
  applyHoleCardAssignmentsToState,
  dealHoleCards,
  type HoleCardAssignment,
} from './dealing'
import { getHandEligibleSeatIds, getSeatById } from './positions'
import { type InternalRoomState, type PlayerSeatState, type SeatId } from './state'

export type BlindKind = 'small-blind' | 'big-blind'
export type HandBootstrapResolution = 'needs-action' | 'all-in-runout'

export interface BlindPosting {
  seatId: SeatId
  blind: BlindKind
  amount: number
  isAllIn: boolean
}

export interface StartNextHandOptions {
  seed: number | string
  handId?: string
  now?: string
}

export interface StartNextHandResult {
  nextState: InternalRoomState
  blindAssignments: BlindSeatAssignments
  blindPostings: BlindPosting[]
  holeCardAssignments: HoleCardAssignment[]
  resolution: HandBootstrapResolution
}

function createTimestamp(now?: string): string {
  return now ?? new Date().toISOString()
}

function createDefaultHandId(roomId: string, handNumber: number): string {
  return `${roomId}:hand:${handNumber}`
}

function resetSeatForNextHand(seat: PlayerSeatState): PlayerSeatState {
  return {
    ...seat,
    committed: 0,
    totalCommitted: 0,
    hasFolded: false,
    isAllIn: false,
    actedThisStreet: false,
    holeCards: null,
  }
}

function prepareStateForNextHand(
  state: InternalRoomState,
  handId: string,
  now: string,
): InternalRoomState {
  return {
    ...state,
    handId,
    handNumber: state.handNumber + 1,
    handStatus: 'in-hand',
    street: 'preflop',
    dealerSeat: null,
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
    seats: state.seats.map(resetSeatForNextHand),
    updatedAt: now,
  }
}

function postBlind(
  state: InternalRoomState,
  seatId: SeatId,
  blind: BlindKind,
  targetAmount: number,
): BlindPosting {
  const seat = getSeatById(state.seats, seatId)

  if (!seat || seat.playerId === null) {
    throw new Error(`Cannot post ${blind} for missing or empty seat ${seatId}.`)
  }

  const amount = Math.min(seat.stack, targetAmount)
  seat.stack -= amount
  seat.committed = amount
  seat.totalCommitted = amount
  seat.isAllIn = seat.stack === 0

  return {
    seatId,
    blind,
    amount,
    isAllIn: seat.isAllIn,
  }
}

function ensureHandCanStart(state: InternalRoomState): void {
  if (state.handStatus === 'in-hand' || state.handStatus === 'showdown') {
    throw new Error(`Cannot start a new hand while handStatus is ${state.handStatus}.`)
  }

  const eligibleSeatIds = getHandEligibleSeatIds(state.seats)

  if (eligibleSeatIds.length < state.config.autoStartMinPlayers) {
    throw new Error(
      `Cannot start a new hand with only ${eligibleSeatIds.length} eligible seats; ` +
        `${state.config.autoStartMinPlayers} are required.`,
    )
  }
}

function getOpeningResolution(nextState: InternalRoomState): HandBootstrapResolution {
  return nextState.pendingActionSeatIds.length > 0 ? 'needs-action' : 'all-in-runout'
}

export function startNextHand(
  state: InternalRoomState,
  options: StartNextHandOptions,
): StartNextHandResult {
  ensureHandCanStart(state)

  const now = createTimestamp(options.now)
  const nextHandNumber = state.handNumber + 1
  const handId = options.handId?.trim() || createDefaultHandId(state.roomId, nextHandNumber)
  const blindAssignments = getBlindSeatAssignmentsForNextHand(state.seats, state.dealerSeat)

  if (!blindAssignments) {
    throw new Error('Unable to determine dealer and blind assignments for the next hand.')
  }

  let nextState = prepareStateForNextHand(state, handId, now)
  nextState.dealerSeat = blindAssignments.dealerSeat
  nextState.smallBlindSeat = blindAssignments.smallBlindSeat
  nextState.bigBlindSeat = blindAssignments.bigBlindSeat

  const shuffledDeck = createShuffledDeck(options.seed)
  const dealingResult = dealHoleCards(shuffledDeck, nextState.seats, blindAssignments.dealerSeat)

  nextState = applyHoleCardAssignmentsToState(
    nextState,
    dealingResult.assignments,
    dealingResult.remainingDeck,
    { now },
  )

  const blindPostings = [
    postBlind(nextState, blindAssignments.smallBlindSeat, 'small-blind', nextState.config.smallBlind),
    postBlind(nextState, blindAssignments.bigBlindSeat, 'big-blind', nextState.config.bigBlind),
  ]

  nextState.currentBet = blindPostings.reduce((max, posting) => Math.max(max, posting.amount), 0)
  nextState.lastFullRaiseSize = nextState.config.bigBlind

  const preflopActingOrder = getPreflopActingOrder(nextState.seats, blindAssignments)
  nextState.pendingActionSeatIds = preflopActingOrder
  nextState.raiseRightsSeatIds = [...preflopActingOrder]
  nextState.actingSeat = preflopActingOrder[0] ?? null

  const resolution = getOpeningResolution(nextState)

  assertRoomStateInvariants(nextState)

  return {
    nextState,
    blindAssignments,
    blindPostings,
    holeCardAssignments: dealingResult.assignments,
    resolution,
  }
}
