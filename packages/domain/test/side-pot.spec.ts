import { describe, expect, it } from 'vitest'
import {
  calculateSidePots,
  calculateSidePotsFromSeats,
  getPotParticipantsFromSeats,
  type PotParticipant,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createParticipants(participants: PotParticipant[]): PotParticipant[] {
  return participants
}

describe('side pot calculation', () => {
  it('returns an empty result when nobody has committed chips', () => {
    expect(calculateSidePots([])).toEqual({
      pots: [],
      mainPot: 0,
      sidePots: [],
      totalPot: 0,
      uncalledBetReturn: null,
    })
  })

  it('creates only a main pot when all live seats commit the same amount', () => {
    const result = calculateSidePots(
      createParticipants([
        { seatId: 4, committed: 100, isEligible: true },
        { seatId: 1, committed: 100, isEligible: true },
        { seatId: 0, committed: 100, isEligible: true },
      ]),
    )

    expect(result).toEqual({
      pots: [
        {
          amount: 300,
          eligibleSeatIds: [0, 1, 4],
          contributingSeatIds: [0, 1, 4],
        },
      ],
      mainPot: 300,
      sidePots: [],
      totalPot: 300,
      uncalledBetReturn: null,
    })
  })

  it('returns unmatched excess chips instead of turning them into a side pot', () => {
    const result = calculateSidePots(
      createParticipants([
        { seatId: 0, committed: 300, isEligible: true },
        { seatId: 1, committed: 200, isEligible: true },
        { seatId: 2, committed: 200, isEligible: true },
      ]),
    )

    expect(result).toEqual({
      pots: [
        {
          amount: 600,
          eligibleSeatIds: [0, 1, 2],
          contributingSeatIds: [0, 1, 2],
        },
      ],
      mainPot: 600,
      sidePots: [],
      totalPot: 600,
      uncalledBetReturn: {
        seatId: 0,
        amount: 100,
      },
    })
  })

  it('creates layered side pots and keeps folded dead chips in the amount only', () => {
    const result = calculateSidePots(
      createParticipants([
        { seatId: 3, committed: 100, isEligible: false },
        { seatId: 0, committed: 400, isEligible: true },
        { seatId: 2, committed: 200, isEligible: true },
        { seatId: 1, committed: 300, isEligible: true },
      ]),
    )

    expect(result).toEqual({
      pots: [
        {
          amount: 400,
          eligibleSeatIds: [0, 1, 2],
          contributingSeatIds: [0, 1, 2, 3],
        },
        {
          amount: 300,
          eligibleSeatIds: [0, 1, 2],
          contributingSeatIds: [0, 1, 2],
        },
        {
          amount: 200,
          eligibleSeatIds: [0, 1],
          contributingSeatIds: [0, 1],
        },
      ],
      mainPot: 400,
      sidePots: [
        { amount: 300, eligibleSeatIds: [0, 1, 2] },
        { amount: 200, eligibleSeatIds: [0, 1] },
      ],
      totalPot: 900,
      uncalledBetReturn: {
        seatId: 0,
        amount: 100,
      },
    })
  })

  it('allows a pot slice to have one eligible seat when other contributors folded', () => {
    const result = calculateSidePots(
      createParticipants([
        { seatId: 0, committed: 200, isEligible: true },
        { seatId: 2, committed: 200, isEligible: false },
      ]),
    )

    expect(result).toEqual({
      pots: [
        {
          amount: 400,
          eligibleSeatIds: [0],
          contributingSeatIds: [0, 2],
        },
      ],
      mainPot: 400,
      sidePots: [],
      totalPot: 400,
      uncalledBetReturn: null,
    })
  })

  it('returns all committed chips when only one seat has invested', () => {
    const result = calculateSidePots(
      createParticipants([{ seatId: 5, committed: 175, isEligible: true }]),
    )

    expect(result).toEqual({
      pots: [],
      mainPot: 0,
      sidePots: [],
      totalPot: 0,
      uncalledBetReturn: {
        seatId: 5,
        amount: 175,
      },
    })
  })

  it('derives pot participants from seat state using totalCommitted and fold status', () => {
    const state = createSeatFixtureState([
      { seatId: 0, totalCommitted: 150 },
      { seatId: 1, totalCommitted: 0 },
      { seatId: 3, totalCommitted: 150, hasFolded: true },
      { seatId: 5, totalCommitted: 50 },
    ])

    expect(getPotParticipantsFromSeats(state.seats)).toEqual([
      { seatId: 0, committed: 150, isEligible: true },
      { seatId: 3, committed: 150, isEligible: false },
      { seatId: 5, committed: 50, isEligible: true },
    ])

    expect(calculateSidePotsFromSeats(state.seats)).toEqual({
      pots: [
        {
          amount: 150,
          eligibleSeatIds: [0, 5],
          contributingSeatIds: [0, 3, 5],
        },
        {
          amount: 200,
          eligibleSeatIds: [0],
          contributingSeatIds: [0, 3],
        },
      ],
      mainPot: 150,
      sidePots: [{ amount: 200, eligibleSeatIds: [0] }],
      totalPot: 350,
      uncalledBetReturn: null,
    })
  })

  it('rejects duplicate participant seat ids', () => {
    expect(() =>
      calculateSidePots(
        createParticipants([
          { seatId: 1, committed: 100, isEligible: true },
          { seatId: 1, committed: 200, isEligible: true },
        ]),
      ),
    ).toThrow('Participant seatId 1 is duplicated.')
  })
})
