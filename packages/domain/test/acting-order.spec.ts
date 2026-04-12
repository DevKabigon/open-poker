import { describe, expect, it } from 'vitest'
import {
  getBlindSeatAssignments,
  getPostflopActingOrder,
  getPostflopFirstToActSeat,
  getPreflopActingOrder,
  getPreflopFirstToActSeat,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

describe('acting order', () => {
  it('computes full-ring preflop and postflop action order', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 1 },
      { seatId: 2 },
      { seatId: 3 },
      { seatId: 4 },
      { seatId: 5 },
    ])

    const blinds = getBlindSeatAssignments(state.seats, 0)

    expect(blinds).not.toBeNull()
    expect(getPreflopFirstToActSeat(state.seats, blinds!)).toBe(3)
    expect(getPreflopActingOrder(state.seats, blinds!)).toEqual([3, 4, 5, 0, 1, 2])
    expect(getPostflopFirstToActSeat(state.seats, 0)).toBe(1)
    expect(getPostflopActingOrder(state.seats, 0)).toEqual([1, 2, 3, 4, 5, 0])
  })

  it('computes correct action order on sparse tables', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 2 },
      { seatId: 5 },
    ])

    const blinds = getBlindSeatAssignments(state.seats, 5)

    expect(blinds).toEqual({
      dealerSeat: 5,
      smallBlindSeat: 0,
      bigBlindSeat: 2,
      isHeadsUp: false,
    })
    expect(getPreflopActingOrder(state.seats, blinds!)).toEqual([5, 0, 2])
    expect(getPostflopActingOrder(state.seats, 5)).toEqual([0, 2, 5])
  })

  it('applies the heads-up exception where the dealer acts first preflop', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 4 },
    ])

    const blinds = getBlindSeatAssignments(state.seats, 0)

    expect(blinds).toEqual({
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 4,
      isHeadsUp: true,
    })
    expect(getPreflopActingOrder(state.seats, blinds!)).toEqual([0, 4])
    expect(getPostflopActingOrder(state.seats, 0)).toEqual([4, 0])
  })

  it('skips folded and all-in seats when producing current action order', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 1, isAllIn: true },
      { seatId: 2 },
      { seatId: 4 },
      { seatId: 5, hasFolded: true },
    ])

    const blinds = getBlindSeatAssignments(state.seats, 0)

    expect(blinds).not.toBeNull()
    expect(getPreflopActingOrder(state.seats, blinds!)).toEqual([4, 0, 2])
    expect(getPostflopActingOrder(state.seats, 0)).toEqual([2, 4, 0])
  })
})
