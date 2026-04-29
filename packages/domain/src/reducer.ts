import { assertValidDomainEvent, type DomainEvent } from './events'
import { type CardCode } from './cards'
import { assertRoomStateInvariants } from './invariants'
import { getSeatById } from './positions'
import { calculateSeatNetPayouts } from './showdown-settlement'
import {
  type InternalRoomState,
  type PlayerSeatState,
  type SeatId,
  type SeatLastActionState,
  type ShowdownSummaryState,
} from './state'

function cloneSeat(seat: PlayerSeatState): PlayerSeatState {
  return {
    ...seat,
    lastAction: seat.lastAction === null ? null : { ...seat.lastAction },
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

function resetSeatForNewHand(seat: PlayerSeatState): PlayerSeatState {
  return {
    ...seat,
    committed: 0,
    totalCommitted: 0,
    hasFolded: false,
    isAllIn: false,
    isSittingOut: seat.isSittingOut || seat.isSittingOutNextHand,
    isSittingOutNextHand: false,
    isWaitingForNextHand: false,
    actedThisStreet: false,
    lastAction: null,
    holeCards: null,
  }
}

function resetCommittedForSettledHand(nextState: InternalRoomState): void {
  for (const seat of nextState.seats) {
    seat.committed = 0
    seat.totalCommitted = 0
    seat.isSittingOut = seat.isSittingOut || seat.isSittingOutNextHand
    seat.isSittingOutNextHand = false
    seat.actedThisStreet = false
  }
}

function getSeatLastActionFromEvent(
  event: Extract<DomainEvent, { type: 'action-applied' }>,
): SeatLastActionState {
  const type = event.action.isAllIn ? 'all-in' : event.action.resolvedType
  const amount =
    type === 'fold' || type === 'check'
      ? null
      : type === 'call'
        ? event.action.addedChips
        : event.action.targetCommitted

  return { type, amount }
}

function buildUncontestedSummary(
  state: InternalRoomState,
  event: Extract<DomainEvent, { type: 'hand-awarded-uncontested' }>,
): ShowdownSummaryState {
  const payouts = [{ seatId: event.winnerSeatId, amount: event.potAmount }]
  const uncalledBetReturn =
    event.uncalledBetReturnAmount === 0
      ? null
      : {
          seatId: event.winnerSeatId,
          amount: event.uncalledBetReturnAmount,
        }

  return {
    handId: state.handId,
    handNumber: state.handNumber,
    handEvaluations: [],
    potAwards: [
      {
        potIndex: 0,
        amount: event.potAmount,
        eligibleSeatIds: [event.winnerSeatId],
        winnerSeatIds: [event.winnerSeatId],
        shares: [{ seatId: event.winnerSeatId, amount: event.potAmount }],
      },
    ],
    payouts,
    netPayouts: calculateSeatNetPayouts(state.seats, payouts, uncalledBetReturn),
    uncalledBetReturn,
  }
}

function removeCardsFromDeck(deck: CardCode[], cards: CardCode[]): CardCode[] {
  if (cards.length === 0) {
    return [...deck]
  }

  const remainingDeck = [...deck]

  for (const card of cards) {
    const index = remainingDeck.indexOf(card)

    if (index === -1) {
      throw new Error(`Cannot remove card ${card} because it is not present in the deck.`)
    }

    remainingDeck.splice(index, 1)
  }

  return remainingDeck
}

function applyHandStarted(nextState: InternalRoomState, event: Extract<DomainEvent, { type: 'hand-started' }>): void {
  nextState.handId = event.handId
  nextState.handNumber = event.handNumber
  nextState.handStatus = 'in-hand'
  nextState.street = 'preflop'
  nextState.dealerSeat = event.blindAssignments.dealerSeat
  nextState.smallBlindSeat = event.blindAssignments.smallBlindSeat
  nextState.bigBlindSeat = event.blindAssignments.bigBlindSeat
  nextState.actingSeat = event.actingSeat
  nextState.pendingActionSeatIds = [...event.pendingActionSeatIds]
  nextState.raiseRightsSeatIds = [...event.raiseRightsSeatIds]
  nextState.board = []
  nextState.burnCards = []
  nextState.deck = [...event.remainingDeck]
  nextState.mainPot = 0
  nextState.sidePots = []
  nextState.currentBet = event.currentBet
  nextState.lastFullRaiseSize = event.lastFullRaiseSize
  nextState.actionSequence = 0
  nextState.showdownSummary = null
  nextState.updatedAt = event.timestamp
  nextState.seats = nextState.seats.map(resetSeatForNewHand)

  for (const assignment of event.holeCardAssignments) {
    const seat = getSeatById(nextState.seats, assignment.seatId)

    if (!seat || seat.playerId === null) {
      throw new Error(`Cannot apply hole card assignment for missing or empty seat ${assignment.seatId}.`)
    }

    seat.holeCards = [...assignment.cards]
  }

  for (const posting of event.blindPostings) {
    const seat = getSeatById(nextState.seats, posting.seatId)

    if (!seat || seat.playerId === null) {
      throw new Error(`Cannot apply blind posting for missing or empty seat ${posting.seatId}.`)
    }

    if (seat.stack < posting.amount) {
      throw new Error(`Seat ${posting.seatId} does not have enough chips to apply blind posting ${posting.amount}.`)
    }

    seat.stack -= posting.amount
    seat.committed = posting.amount
    seat.totalCommitted = posting.amount
    seat.isAllIn = posting.isAllIn || seat.stack === 0
  }
}

function applyActionApplied(nextState: InternalRoomState, event: Extract<DomainEvent, { type: 'action-applied' }>): void {
  const seat = getSeatById(nextState.seats, event.seatId)

  if (!seat || seat.playerId === null) {
    throw new Error(`Cannot apply action for missing or empty seat ${event.seatId}.`)
  }

  if (event.action.addedChips > 0) {
    if (seat.stack < event.action.addedChips) {
      throw new Error(`Seat ${event.seatId} does not have enough chips to apply action.`)
    }

    seat.stack -= event.action.addedChips
    seat.committed = event.action.targetCommitted
    seat.totalCommitted += event.action.addedChips
  }

  if (event.action.resolvedType === 'fold') {
    seat.hasFolded = true
  }

  if (event.action.isAllIn || seat.stack === 0) {
    seat.isAllIn = true
  }

  seat.actedThisStreet = true
  seat.lastAction = getSeatLastActionFromEvent(event)

  nextState.currentBet = event.currentBet
  nextState.lastFullRaiseSize = event.lastFullRaiseSize
  nextState.pendingActionSeatIds = [...event.pendingActionSeatIds]
  nextState.raiseRightsSeatIds = [...event.raiseRightsSeatIds]
  nextState.actingSeat = event.actingSeat
  nextState.actionSequence += 1
  nextState.updatedAt = event.timestamp
}

function applyHandAwardedUncontested(
  nextState: InternalRoomState,
  event: Extract<DomainEvent, { type: 'hand-awarded-uncontested' }>,
): void {
  const seat = getSeatById(nextState.seats, event.winnerSeatId)

  if (!seat || seat.playerId === null) {
    throw new Error(`Cannot award uncontested hand to missing or empty seat ${event.winnerSeatId}.`)
  }

  seat.stack += event.potAmount + event.uncalledBetReturnAmount

  nextState.showdownSummary = buildUncontestedSummary(nextState, event)
  resetCommittedForSettledHand(nextState)
  nextState.handStatus = 'settled'
  nextState.actingSeat = null
  nextState.pendingActionSeatIds = []
  nextState.raiseRightsSeatIds = []
  nextState.mainPot = 0
  nextState.sidePots = []
  nextState.currentBet = 0
  nextState.lastFullRaiseSize = nextState.config.bigBlind
  nextState.actionSequence += 1
  nextState.updatedAt = event.timestamp
}

function applyStreetAdvanced(nextState: InternalRoomState, event: Extract<DomainEvent, { type: 'street-advanced' }>): void {
  const consumedCards = [
    ...(event.burnCard ? [event.burnCard] : []),
    ...event.boardCards,
  ]

  nextState.deck = removeCardsFromDeck(nextState.deck, consumedCards)

  if (event.burnCard) {
    nextState.burnCards.push(event.burnCard)
  }

  if (event.boardCards.length > 0) {
    nextState.board.push(...event.boardCards)
  }

  for (const seat of nextState.seats) {
    seat.committed = 0
    seat.actedThisStreet = false
    seat.lastAction = null
  }

  nextState.street = event.toStreet
  nextState.handStatus = event.toStreet === 'showdown' ? 'showdown' : 'in-hand'
  nextState.currentBet = 0
  nextState.lastFullRaiseSize = nextState.config.bigBlind
  nextState.pendingActionSeatIds = [...event.pendingActionSeatIds]
  nextState.raiseRightsSeatIds = [...event.raiseRightsSeatIds]
  nextState.actingSeat = event.actingSeat
  nextState.actionSequence += 1
  nextState.updatedAt = event.timestamp
}

function applyShowdownSettled(nextState: InternalRoomState, event: Extract<DomainEvent, { type: 'showdown-settled' }>): void {
  const payoutBySeatId = new Map<SeatId, number>()

  for (const payout of event.payouts) {
    payoutBySeatId.set(payout.seatId, (payoutBySeatId.get(payout.seatId) ?? 0) + payout.amount)
  }

  for (const seat of nextState.seats) {
    seat.stack += payoutBySeatId.get(seat.seatId) ?? 0

    if (event.uncalledBetReturn?.seatId === seat.seatId) {
      seat.stack += event.uncalledBetReturn.amount
    }
  }

  const netPayouts = calculateSeatNetPayouts(nextState.seats, event.payouts, event.uncalledBetReturn)

  resetCommittedForSettledHand(nextState)
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
  nextState.showdownSummary = {
    handId: nextState.handId,
    handNumber: nextState.handNumber,
    handEvaluations: event.handEvaluations.map((evaluation) => ({
      seatId: evaluation.seatId,
      category: evaluation.category,
      bestCards: [...evaluation.bestCards],
    })),
    potAwards: event.potAwards.map((award) => ({
      potIndex: award.potIndex,
      amount: award.amount,
      eligibleSeatIds: [...award.eligibleSeatIds],
      winnerSeatIds: [...award.winnerSeatIds],
      shares: award.shares.map((share) => ({ ...share })),
    })),
    payouts: event.payouts.map((payout) => ({ ...payout })),
    netPayouts,
    uncalledBetReturn: event.uncalledBetReturn === null ? null : { ...event.uncalledBetReturn },
  }
  nextState.updatedAt = event.timestamp
}

export function applyDomainEvent(state: InternalRoomState, event: DomainEvent): InternalRoomState {
  assertValidDomainEvent(event)

  const nextState = cloneState(state)

  switch (event.type) {
    case 'hand-started':
      applyHandStarted(nextState, event)
      break
    case 'action-applied':
      applyActionApplied(nextState, event)
      break
    case 'hand-awarded-uncontested':
      applyHandAwardedUncontested(nextState, event)
      break
    case 'street-advanced':
      applyStreetAdvanced(nextState, event)
      break
    case 'showdown-settled':
      applyShowdownSettled(nextState, event)
      break
  }

  assertRoomStateInvariants(nextState)
  return nextState
}

export function applyDomainEvents(state: InternalRoomState, events: DomainEvent[]): InternalRoomState {
  return events.reduce((currentState, event) => applyDomainEvent(currentState, event), state)
}
