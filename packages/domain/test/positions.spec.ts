import { describe, expect, it } from 'vitest'
import {
  getActionableSeatIds,
  getClockwiseSeatIdsAfter,
  getHandEligibleSeatIds,
  getNextSeatIdClockwise,
  getOccupiedSeatIds,
  isActionableSeat,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

describe('positions', () => {
  it('separates occupied, hand-eligible, and actionable seats', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 5_000 },
      { seatId: 1, stack: 0 },
      { seatId: 2, stack: 7_000, isSittingOut: true },
      { seatId: 4, stack: 8_000, hasFolded: true },
      { seatId: 5, stack: 9_000 },
    ])

    expect(getOccupiedSeatIds(state.seats)).toEqual([0, 1, 2, 4, 5])
    expect(getHandEligibleSeatIds(state.seats)).toEqual([0, 4, 5])
    expect(getActionableSeatIds(state.seats)).toEqual([0, 5])
    expect(isActionableSeat(state.seats[5])).toBe(true)
    expect(isActionableSeat(state.seats[4])).toBe(false)
  })

  it('walks clockwise over sparse tables and wraps around the button ring', () => {
    const state = createSeatFixtureState([
      { seatId: 0 },
      { seatId: 2 },
      { seatId: 5 },
    ])

    expect(getClockwiseSeatIdsAfter(state.seats, 2, (seat) => seat.playerId !== null)).toEqual([5, 0, 2])
    expect(getNextSeatIdClockwise(state.seats, 5, (seat) => seat.playerId !== null)).toBe(0)
  })
})
