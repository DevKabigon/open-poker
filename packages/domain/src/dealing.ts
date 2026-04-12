import { drawCards, drawStreetCards, type StreetDrawResult } from './deck'
import { getClockwiseSeatIdsAfter, isEligibleToStartHand } from './positions'
import { type CardCode } from './cards'
import { type InternalRoomState, type PlayerSeatState, type SeatId, type Street } from './state'

export interface HoleCardAssignment {
  seatId: SeatId
  cards: [CardCode, CardCode]
}

export interface DealHoleCardsResult {
  assignments: HoleCardAssignment[]
  remainingDeck: CardCode[]
}

export interface ApplyHoleCardsOptions {
  now?: string
}

export function getHoleCardDealOrder(seats: PlayerSeatState[], dealerSeat: SeatId): SeatId[] {
  return getClockwiseSeatIdsAfter(seats, dealerSeat, isEligibleToStartHand)
}

export function dealHoleCards(
  deck: CardCode[],
  seats: PlayerSeatState[],
  dealerSeat: SeatId,
): DealHoleCardsResult {
  const dealOrder = getHoleCardDealOrder(seats, dealerSeat)

  if (dealOrder.length < 2) {
    throw new Error('At least two eligible seats are required to deal a hold’em hand.')
  }

  const totalCardsNeeded = dealOrder.length * 2
  const drawResult = drawCards(deck, totalCardsNeeded)
  const assignments = new Map<SeatId, CardCode[]>()

  dealOrder.forEach((seatId) => {
    assignments.set(seatId, [])
  })

  for (let round = 0; round < 2; round += 1) {
    for (const seatId of dealOrder) {
      const cardIndex = round * dealOrder.length + dealOrder.indexOf(seatId)
      assignments.get(seatId)!.push(drawResult.cards[cardIndex]!)
    }
  }

  return {
    assignments: dealOrder.map((seatId) => ({
      seatId,
      cards: assignments.get(seatId)! as [CardCode, CardCode],
    })),
    remainingDeck: drawResult.remainingDeck,
  }
}

export function applyHoleCardAssignmentsToState(
  state: InternalRoomState,
  assignments: HoleCardAssignment[],
  remainingDeck: CardCode[],
  options: ApplyHoleCardsOptions = {},
): InternalRoomState {
  const nextState: InternalRoomState = {
    ...state,
    deck: [...remainingDeck],
    seats: state.seats.map((seat) => ({
      ...seat,
      holeCards: seat.holeCards === null ? null : [...seat.holeCards] as [CardCode, CardCode],
    })),
    updatedAt: options.now ?? state.updatedAt,
  }

  for (const assignment of assignments) {
    const seat = nextState.seats.find((candidate) => candidate.seatId === assignment.seatId)

    if (!seat || seat.playerId === null) {
      throw new Error(`Cannot assign hole cards to missing or empty seat ${assignment.seatId}.`)
    }

    seat.holeCards = [...assignment.cards]
  }

  return nextState
}

export function drawCardsForStreetTransition(deck: CardCode[], street: Street): StreetDrawResult {
  return drawStreetCards(deck, street)
}
