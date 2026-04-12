import { describe, expect, it } from 'vitest'
import {
  applyHoleCardAssignmentsToState,
  createOrderedDeck,
  dealHoleCards,
  drawCardsForStreetTransition,
  getHoleCardDealOrder,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

describe('dealing', () => {
  it('computes full-ring hole card deal order from the seat left of the dealer', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 1 },
      { seatId: 2 },
      { seatId: 3 },
      { seatId: 4 },
      { seatId: 5 },
    ])

    expect(getHoleCardDealOrder(state.seats, 0)).toEqual([1, 2, 3, 4, 5, 0])
  })

  it('deals hole cards in order and applies them to state', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 2 },
      { seatId: 5 },
    ])

    const deal = dealHoleCards(createOrderedDeck(), state.seats, 5)

    expect(deal.assignments).toEqual([
      { seatId: 0, cards: ['2c', '5c'] },
      { seatId: 2, cards: ['3c', '6c'] },
      { seatId: 5, cards: ['4c', '7c'] },
    ])

    const nextState = applyHoleCardAssignmentsToState(state, deal.assignments, deal.remainingDeck, {
      now: '2026-04-13T03:00:00.000Z',
    })

    expect(nextState.seats[0].holeCards).toEqual(['2c', '5c'])
    expect(nextState.seats[2].holeCards).toEqual(['3c', '6c'])
    expect(nextState.seats[5].holeCards).toEqual(['4c', '7c'])
    expect(nextState.deck[0]).toBe('8c')
    expect(nextState.updatedAt).toBe('2026-04-13T03:00:00.000Z')
  })

  it('uses the dealer as the first recipient in heads-up dealing', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 4 },
    ])

    expect(getHoleCardDealOrder(state.seats, 0)).toEqual([4, 0])

    const deal = dealHoleCards(createOrderedDeck(), state.seats, 4)

    expect(deal.assignments).toEqual([
      { seatId: 0, cards: ['2c', '4c'] },
      { seatId: 4, cards: ['3c', '5c'] },
    ])
  })

  it('draws cards for street transitions using the deck helpers', () => {
    const deck = createOrderedDeck()
    const flop = drawCardsForStreetTransition(deck, 'preflop')

    expect(flop.burnCard).toBe('2c')
    expect(flop.boardCards).toEqual(['3c', '4c', '5c'])
  })
})
