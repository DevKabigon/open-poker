import { type CardCode } from './cards'
import { evaluateSevenCardHand } from './evaluate-seven'
import { compareEvaluatedHands, type EvaluatedHand } from './hand-ranking'
import { assertRoomStateInvariants } from './invariants'
import { getClockwiseSeatIdsAfter } from './positions'
import {
  calculateSidePotsFromSeats,
  type SidePotCalculationResult,
  type SidePotSlice,
  type UncalledBetReturn,
} from './side-pot'
import {
  type InternalRoomState,
  type PlayerSeatState,
  type SeatId,
  type SeatNetPayoutState,
  type ShowdownSummaryState,
} from './state'

export interface ShowdownHandEvaluation {
  seatId: SeatId
  cards: [CardCode, CardCode]
  evaluatedHand: EvaluatedHand
}

export interface SeatPayout {
  seatId: SeatId
  amount: number
}

export interface PotAward {
  potIndex: number
  amount: number
  eligibleSeatIds: SeatId[]
  winnerSeatIds: SeatId[]
  shares: SeatPayout[]
}

export interface SettleShowdownOptions {
  now?: string
}

export interface ShowdownSettlementResult {
  nextState: InternalRoomState
  handEvaluations: ShowdownHandEvaluation[]
  potCalculation: SidePotCalculationResult
  potAwards: PotAward[]
  payouts: SeatPayout[]
  netPayouts: SeatNetPayoutState[]
  uncalledBetReturn: UncalledBetReturn | null
}

function cloneSeat(seat: PlayerSeatState): PlayerSeatState {
  return {
    ...seat,
    holeCards: seat.holeCards === null ? null : [...seat.holeCards] as [CardCode, CardCode],
  }
}

function cloneShowdownSummary(summary: ShowdownSummaryState | null): ShowdownSummaryState | null {
  if (summary === null) {
    return null
  }

  return {
    handId: summary.handId,
    handNumber: summary.handNumber,
    handEvaluations: summary.handEvaluations.map((evaluation) => ({
      seatId: evaluation.seatId,
      category: evaluation.category,
      bestCards: [...evaluation.bestCards],
    })),
    potAwards: summary.potAwards.map((award) => ({
      potIndex: award.potIndex,
      amount: award.amount,
      eligibleSeatIds: [...award.eligibleSeatIds],
      winnerSeatIds: [...award.winnerSeatIds],
      shares: award.shares.map((share) => ({ ...share })),
    })),
    payouts: summary.payouts.map((payout) => ({ ...payout })),
    netPayouts: (summary.netPayouts ?? []).map((payout) => ({ ...payout })),
    uncalledBetReturn: summary.uncalledBetReturn === null ? null : { ...summary.uncalledBetReturn },
  }
}

function cloneState(state: InternalRoomState): InternalRoomState {
  return {
    ...state,
    pendingActionSeatIds: [...state.pendingActionSeatIds],
    raiseRightsSeatIds: [...state.raiseRightsSeatIds],
    board: [...state.board],
    burnCards: [...state.burnCards],
    deck: [...state.deck],
    sidePots: state.sidePots.map((pot) => ({
      amount: pot.amount,
      eligibleSeatIds: [...pot.eligibleSeatIds],
    })),
    showdownSummary: cloneShowdownSummary(state.showdownSummary),
    seats: state.seats.map(cloneSeat),
  }
}

function sortSeatIdsAscending(seatIds: SeatId[]): SeatId[] {
  return [...seatIds].sort((left, right) => left - right)
}

function sortPayoutsAscending(payouts: Map<SeatId, number>): SeatPayout[] {
  return [...payouts.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([leftSeatId], [rightSeatId]) => leftSeatId - rightSeatId)
    .map(([seatId, amount]) => ({ seatId, amount }))
}

export function calculateSeatNetPayouts(
  seats: PlayerSeatState[],
  payouts: SeatPayout[],
  uncalledBetReturn: UncalledBetReturn | null,
): SeatNetPayoutState[] {
  const payoutBySeatId = new Map<SeatId, number>()

  for (const payout of payouts) {
    payoutBySeatId.set(payout.seatId, (payoutBySeatId.get(payout.seatId) ?? 0) + payout.amount)
  }

  return seats
    .filter((seat) => seat.playerId !== null)
    .map((seat) => ({
      seatId: seat.seatId,
      amount:
        (payoutBySeatId.get(seat.seatId) ?? 0) +
        (uncalledBetReturn?.seatId === seat.seatId ? uncalledBetReturn.amount : 0) -
        seat.totalCommitted,
    }))
    .filter((payout) => payout.amount !== 0)
    .sort((left, right) => left.seatId - right.seatId)
}

function getOddChipSeatOrder(state: InternalRoomState, winnerSeatIds: SeatId[]): SeatId[] {
  const orderedWinners = sortSeatIdsAscending(winnerSeatIds)

  if (state.dealerSeat === null) {
    return orderedWinners
  }

  return getClockwiseSeatIdsAfter(state.seats, state.dealerSeat, (seat) => orderedWinners.includes(seat.seatId))
}

function awardPot(amount: number, winnerSeatIds: SeatId[], state: InternalRoomState): SeatPayout[] {
  if (winnerSeatIds.length === 0) {
    throw new Error('Cannot award a pot without winners.')
  }

  const evenShare = Math.floor(amount / winnerSeatIds.length)
  const remainder = amount % winnerSeatIds.length
  const oddChipOrder = getOddChipSeatOrder(state, winnerSeatIds)

  return oddChipOrder.map((seatId, index) => ({
    seatId,
    amount: evenShare + (index < remainder ? 1 : 0),
  }))
}

function evaluateSeatAtShowdown(state: InternalRoomState, seat: PlayerSeatState): ShowdownHandEvaluation {
  if (seat.playerId === null || seat.hasFolded) {
    throw new Error(`Cannot evaluate folded or empty seat ${seat.seatId} at showdown.`)
  }

  if (seat.holeCards === null) {
    throw new Error(`Seat ${seat.seatId} is still in the hand but has no hole cards.`)
  }

  return {
    seatId: seat.seatId,
    cards: [...seat.holeCards],
    evaluatedHand: evaluateSevenCardHand([...seat.holeCards, ...state.board]),
  }
}

function getShowdownEvaluations(state: InternalRoomState): ShowdownHandEvaluation[] {
  return state.seats
    .filter((seat) => seat.playerId !== null && !seat.isWaitingForNextHand && !seat.hasFolded)
    .map((seat) => evaluateSeatAtShowdown(state, seat))
}

function getPotWinnerSeatIds(
  pot: SidePotSlice,
  evaluationBySeatId: Map<SeatId, ShowdownHandEvaluation>,
): SeatId[] {
  let bestEvaluation: ShowdownHandEvaluation | null = null
  const winnerSeatIds: SeatId[] = []

  for (const seatId of pot.eligibleSeatIds) {
    const evaluation = evaluationBySeatId.get(seatId)

    if (!evaluation) {
      throw new Error(`Missing showdown evaluation for eligible seat ${seatId}.`)
    }

    if (bestEvaluation === null) {
      bestEvaluation = evaluation
      winnerSeatIds.push(seatId)
      continue
    }

    const comparison = compareEvaluatedHands(evaluation.evaluatedHand, bestEvaluation.evaluatedHand)

    if (comparison > 0) {
      winnerSeatIds.length = 0
      winnerSeatIds.push(seatId)
      bestEvaluation = evaluation
      continue
    }

    if (comparison === 0) {
      winnerSeatIds.push(seatId)
    }
  }

  return sortSeatIdsAscending(winnerSeatIds)
}

function applyPayoutsToState(
  nextState: InternalRoomState,
  payouts: Map<SeatId, number>,
  uncalledBetReturn: UncalledBetReturn | null,
): void {
  for (const seat of nextState.seats) {
    const settledStack = seat.stack + (payouts.get(seat.seatId) ?? 0)
    const returnedAmount = uncalledBetReturn?.seatId === seat.seatId ? uncalledBetReturn.amount : 0

    seat.stack = settledStack + returnedAmount
    seat.committed = 0
    seat.totalCommitted = 0
    seat.actedThisStreet = false
  }
}

function resetSettledHandState(nextState: InternalRoomState, now?: string): void {
  nextState.handStatus = 'settled'
  nextState.street = 'showdown'
  nextState.actingSeat = null
  nextState.pendingActionSeatIds = []
  nextState.raiseRightsSeatIds = []
  nextState.mainPot = 0
  nextState.sidePots = []
  nextState.currentBet = 0
  nextState.lastFullRaiseSize = nextState.config.bigBlind
  nextState.actionSequence += 1
  if (now) {
    nextState.updatedAt = now
  }
}

function buildShowdownSummary(
  state: InternalRoomState,
  handEvaluations: ShowdownHandEvaluation[],
  potAwards: PotAward[],
  payouts: SeatPayout[],
  netPayouts: SeatNetPayoutState[],
  uncalledBetReturn: UncalledBetReturn | null,
): ShowdownSummaryState {
  return {
    handId: state.handId,
    handNumber: state.handNumber,
    handEvaluations: handEvaluations.map((evaluation) => ({
      seatId: evaluation.seatId,
      category: evaluation.evaluatedHand.category,
      bestCards: [...evaluation.evaluatedHand.cards],
    })),
    potAwards: potAwards.map((award) => ({
      potIndex: award.potIndex,
      amount: award.amount,
      eligibleSeatIds: [...award.eligibleSeatIds],
      winnerSeatIds: [...award.winnerSeatIds],
      shares: award.shares.map((share) => ({ ...share })),
    })),
    payouts: payouts.map((payout) => ({ ...payout })),
    netPayouts: netPayouts.map((payout) => ({ ...payout })),
    uncalledBetReturn: uncalledBetReturn === null ? null : { ...uncalledBetReturn },
  }
}

export function settleShowdown(
  state: InternalRoomState,
  options: SettleShowdownOptions = {},
): ShowdownSettlementResult {
  if (state.handStatus !== 'showdown' || state.street !== 'showdown') {
    throw new Error('Showdown settlement requires handStatus and street to both be showdown.')
  }

  if (state.board.length !== 5) {
    throw new Error(`Showdown settlement requires exactly 5 board cards, received ${state.board.length}.`)
  }

  const handEvaluations = getShowdownEvaluations(state)
  const evaluationBySeatId = new Map(handEvaluations.map((evaluation) => [evaluation.seatId, evaluation]))
  const potCalculation = calculateSidePotsFromSeats(state.seats)
  const payoutsBySeatId = new Map<SeatId, number>()
  const potAwards: PotAward[] = []

  potCalculation.pots.forEach((pot, potIndex) => {
    const winnerSeatIds = getPotWinnerSeatIds(pot, evaluationBySeatId)
    const shares = awardPot(pot.amount, winnerSeatIds, state)

    for (const share of shares) {
      payoutsBySeatId.set(share.seatId, (payoutsBySeatId.get(share.seatId) ?? 0) + share.amount)
    }

    potAwards.push({
      potIndex,
      amount: pot.amount,
      eligibleSeatIds: [...pot.eligibleSeatIds],
      winnerSeatIds,
      shares,
    })
  })

  const nextState = cloneState(state)
  const payouts = sortPayoutsAscending(payoutsBySeatId)
  const netPayouts = calculateSeatNetPayouts(state.seats, payouts, potCalculation.uncalledBetReturn)
  applyPayoutsToState(nextState, payoutsBySeatId, potCalculation.uncalledBetReturn)
  resetSettledHandState(nextState, options.now ?? state.updatedAt)
  nextState.showdownSummary = buildShowdownSummary(
    state,
    handEvaluations,
    potAwards,
    payouts,
    netPayouts,
    potCalculation.uncalledBetReturn,
  )
  assertRoomStateInvariants(nextState)

  return {
    nextState,
    handEvaluations,
    potCalculation,
    potAwards,
    payouts,
    netPayouts,
    uncalledBetReturn: potCalculation.uncalledBetReturn,
  }
}
