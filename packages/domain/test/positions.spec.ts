import { describe, expect, it } from 'vitest'
import {
  assertRoomStateInvariants,
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
      { seatId: 3, stack: 6_000, isSittingOutNextHand: true },
      { seatId: 4, stack: 8_000, hasFolded: true },
      { seatId: 5, stack: 9_000, isWaitingForNextHand: true },
    ])

    expect(getOccupiedSeatIds(state.seats)).toEqual([0, 1, 2, 3, 4, 5])
    expect(getHandEligibleSeatIds(state.seats)).toEqual([0, 4, 5])
    expect(getActionableSeatIds(state.seats)).toEqual([0, 3])
    expect(isActionableSeat(state.seats[3])).toBe(true)
    expect(isActionableSeat(state.seats[5])).toBe(false)
    expect(isActionableSeat(state.seats[4])).toBe(false)
  })

  it('excludes disconnected seats from new hand eligibility without removing current-hand actionability', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000, isDisconnected: true },
    ])

    expect(getHandEligibleSeatIds(state.seats)).toEqual([0])
    expect(getActionableSeatIds(state.seats)).toEqual([0, 2])
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

  it('keeps a next-hand sit-out reservation actionable for the current hand', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 3, stack: 10_000, isSittingOutNextHand: true },
    ])

    state.handId = 'hand-1'
    state.handNumber = 1
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.actingSeat = 3
    state.pendingActionSeatIds = [3, 0]
    state.raiseRightsSeatIds = [3, 0]

    expect(isActionableSeat(state.seats[3])).toBe(true)
    expect(() => assertRoomStateInvariants(state)).not.toThrow()
  })
})
