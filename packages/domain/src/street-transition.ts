import { getPostflopActingOrder } from './acting-order'
import { type CardCode } from './cards'
import { assertRoomStateInvariants } from './invariants'
import { type InternalRoomState, type Street } from './state'

export interface StreetTransitionCards {
  burnCard?: CardCode
  boardCards?: CardCode[]
}

export interface AdvanceStreetOptions {
  now?: string
}

export interface StreetTransitionPlan {
  fromStreet: Exclude<Street, 'idle' | 'showdown'>
  toStreet: Exclude<Street, 'idle'>
  burnCount: 0 | 1
  boardCardCount: 0 | 1 | 3
}

export interface StreetTransitionResult {
  nextState: InternalRoomState
  fromStreet: Exclude<Street, 'idle' | 'showdown'>
  toStreet: Exclude<Street, 'idle'>
  requiresAction: boolean
  isTerminal: boolean
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
    seats: state.seats.map((seat) => ({
      ...seat,
      holeCards: seat.holeCards === null ? null : [...seat.holeCards] as [CardCode, CardCode],
    })),
  }
}

function removeCardsFromDeckIfPresent(deck: CardCode[], cards: CardCode[]): CardCode[] {
  if (deck.length === 0 || cards.length === 0) {
    return deck
  }

  const nextDeck = [...deck]

  for (const card of cards) {
    const index = nextDeck.indexOf(card)

    if (index === -1) {
      throw new Error(`Card ${card} was not found in the remaining deck.`)
    }

    nextDeck.splice(index, 1)
  }

  return nextDeck
}

export function getStreetTransitionPlan(street: Street): StreetTransitionPlan | null {
  switch (street) {
    case 'preflop':
      return {
        fromStreet: 'preflop',
        toStreet: 'flop',
        burnCount: 1,
        boardCardCount: 3,
      }
    case 'flop':
      return {
        fromStreet: 'flop',
        toStreet: 'turn',
        burnCount: 1,
        boardCardCount: 1,
      }
    case 'turn':
      return {
        fromStreet: 'turn',
        toStreet: 'river',
        burnCount: 1,
        boardCardCount: 1,
      }
    case 'river':
      return {
        fromStreet: 'river',
        toStreet: 'showdown',
        burnCount: 0,
        boardCardCount: 0,
      }
    case 'idle':
    case 'showdown':
      return null
  }
}

export function getNextStreet(street: Street): Exclude<Street, 'idle'> | null {
  return getStreetTransitionPlan(street)?.toStreet ?? null
}

function validateTransitionCards(plan: StreetTransitionPlan, cards: StreetTransitionCards): void {
  const boardCards = cards.boardCards ?? []
  const hasBurnCard = cards.burnCard !== undefined

  if (plan.burnCount === 1 && !hasBurnCard) {
    throw new Error(`Transition from ${plan.fromStreet} to ${plan.toStreet} requires a burn card.`)
  }

  if (plan.burnCount === 0 && hasBurnCard) {
    throw new Error(`Transition from ${plan.fromStreet} to ${plan.toStreet} must not consume a burn card.`)
  }

  if (boardCards.length !== plan.boardCardCount) {
    throw new Error(
      `Transition from ${plan.fromStreet} to ${plan.toStreet} requires exactly ${plan.boardCardCount} board cards.`,
    )
  }
}

function resetStreetBettingState(nextState: InternalRoomState): void {
  for (const seat of nextState.seats) {
    seat.committed = 0
    seat.actedThisStreet = false
    seat.lastAction = null
  }

  nextState.currentBet = 0
  nextState.lastFullRaiseSize = nextState.config.bigBlind
}

export function advanceToNextStreet(
  state: InternalRoomState,
  cards: StreetTransitionCards = {},
  options: AdvanceStreetOptions = {},
): StreetTransitionResult {
  const plan = getStreetTransitionPlan(state.street)

  if (!plan) {
    throw new Error(`Cannot advance from street ${state.street}.`)
  }

  if (state.handStatus === 'waiting' || state.handStatus === 'settled') {
    throw new Error(`Cannot advance streets while handStatus is ${state.handStatus}.`)
  }

  validateTransitionCards(plan, cards)

  const nextState = cloneState(state)
  const consumedCards = [
    ...(cards.burnCard ? [cards.burnCard] : []),
    ...((cards.boardCards ?? [])),
  ]

  nextState.deck = removeCardsFromDeckIfPresent(nextState.deck, consumedCards)

  if (cards.burnCard) {
    nextState.burnCards.push(cards.burnCard)
  }

  if (cards.boardCards && cards.boardCards.length > 0) {
    nextState.board.push(...cards.boardCards)
  }

  resetStreetBettingState(nextState)

  nextState.street = plan.toStreet
  nextState.pendingActionSeatIds = []
  nextState.raiseRightsSeatIds = []
  nextState.actingSeat = null
  nextState.actionSequence += 1
  nextState.updatedAt = options.now ?? nextState.updatedAt

  if (plan.toStreet === 'showdown') {
    nextState.handStatus = 'showdown'
    assertRoomStateInvariants(nextState)

    return {
      nextState,
      fromStreet: plan.fromStreet,
      toStreet: plan.toStreet,
      requiresAction: false,
      isTerminal: true,
    }
  }

  if (nextState.dealerSeat === null) {
    throw new Error('dealerSeat is required to determine postflop acting order.')
  }

  const postflopOrder = getPostflopActingOrder(nextState.seats, nextState.dealerSeat)

  nextState.pendingActionSeatIds = postflopOrder
  nextState.raiseRightsSeatIds = [...postflopOrder]
  nextState.actingSeat = postflopOrder[0] ?? null
  nextState.handStatus = 'in-hand'

  assertRoomStateInvariants(nextState)

  return {
    nextState,
    fromStreet: plan.fromStreet,
    toStreet: plan.toStreet,
    requiresAction: postflopOrder.length > 0,
    isTerminal: false,
  }
}
