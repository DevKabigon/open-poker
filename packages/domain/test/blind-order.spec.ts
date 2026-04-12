import { describe, expect, it } from 'vitest'
import { getBlindSeatAssignments, getBlindSeatAssignmentsForNextHand, getNextDealerSeat } from '../src'
import { createSeatFixtureState } from './seat-fixtures'

describe('blind order', () => {
  it('advances the dealer button and blinds on a full-ring table', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 1 },
      { seatId: 2 },
      { seatId: 3 },
      { seatId: 4 },
      { seatId: 5 },
    ])

    expect(getNextDealerSeat(state.seats, 0)).toBe(1)
    expect(getBlindSeatAssignmentsForNextHand(state.seats, 0)).toEqual({
      dealerSeat: 1,
      smallBlindSeat: 2,
      bigBlindSeat: 3,
      isHeadsUp: false,
    })
  })

  it('skips empty and unavailable seats when assigning blinds', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 2, isSittingOut: true },
      { seatId: 3, stack: 0 },
      { seatId: 4 },
      { seatId: 5 },
    ])

    expect(getNextDealerSeat(state.seats, 5)).toBe(0)
    expect(getBlindSeatAssignments(state.seats, 0)).toEqual({
      dealerSeat: 0,
      smallBlindSeat: 4,
      bigBlindSeat: 5,
      isHeadsUp: false,
    })
  })

  it('uses the dealer as the small blind in heads-up play', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 4 },
    ])

    expect(getBlindSeatAssignmentsForNextHand(state.seats, 4)).toEqual({
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 4,
      isHeadsUp: true,
    })
  })

  it('returns null when fewer than two players can start a hand', () => {
    const state = createSeatFixtureState([{ seatId: 2 }])

    expect(getBlindSeatAssignmentsForNextHand(state.seats, null)).toBeNull()
  })
})
