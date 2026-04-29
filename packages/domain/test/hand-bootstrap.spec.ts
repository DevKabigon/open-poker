import { describe, expect, it } from 'vitest'
import { assertRoomStateInvariants, startNextHand } from '../src'
import { createSeatFixtureState } from './seat-fixtures'

describe('hand bootstrap', () => {
  it('starts a new preflop hand with blinds, hole cards, and acting order', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 1, stack: 10_000, isSittingOut: true },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const result = startNextHand(state, {
      seed: 'hand-1',
      now: '2026-04-13T01:00:00.000Z',
    })

    expect(result.blindAssignments).toEqual({
      dealerSeat: 0,
      smallBlindSeat: 2,
      bigBlindSeat: 4,
      isHeadsUp: false,
    })
    expect(result.blindPostings).toEqual([
      { seatId: 2, blind: 'small-blind', amount: 50, isAllIn: false },
      { seatId: 4, blind: 'big-blind', amount: 100, isAllIn: false },
    ])
    expect(result.holeCardAssignments.map((assignment) => assignment.seatId)).toEqual([2, 4, 0])

    const nextState = result.nextState

    expect(result.resolution).toBe('needs-action')
    expect(nextState.handId).toBe('test-room:hand:1')
    expect(nextState.handNumber).toBe(1)
    expect(nextState.handStatus).toBe('in-hand')
    expect(nextState.street).toBe('preflop')
    expect(nextState.dealerSeat).toBe(0)
    expect(nextState.smallBlindSeat).toBe(2)
    expect(nextState.bigBlindSeat).toBe(4)
    expect(nextState.currentBet).toBe(100)
    expect(nextState.lastFullRaiseSize).toBe(100)
    expect(nextState.pendingActionSeatIds).toEqual([0, 2, 4])
    expect(nextState.raiseRightsSeatIds).toEqual([0, 2, 4])
    expect(nextState.actingSeat).toBe(0)
    expect(nextState.board).toEqual([])
    expect(nextState.burnCards).toEqual([])
    expect(nextState.deck).toHaveLength(46)

    expect(nextState.seats[0]?.holeCards).not.toBeNull()
    expect(nextState.seats[1]?.holeCards).toBeNull()
    expect(nextState.seats[2]).toMatchObject({
      committed: 50,
      totalCommitted: 50,
      stack: 9_950,
      hasFolded: false,
      isAllIn: false,
    })
    expect(nextState.seats[4]).toMatchObject({
      committed: 100,
      totalCommitted: 100,
      stack: 9_900,
      hasFolded: false,
      isAllIn: false,
    })

    expect(() => assertRoomStateInvariants(nextState)).not.toThrow()
  })

  it('resets stale hand state before starting the next hand', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 1, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
    ])

    state.handStatus = 'settled'
    state.handId = 'previous-hand'
    state.handNumber = 7
    state.street = 'showdown'
    state.dealerSeat = 1
    state.smallBlindSeat = 2
    state.bigBlindSeat = 0
    state.actingSeat = 2
    state.pendingActionSeatIds = [2]
    state.raiseRightsSeatIds = [2]
    state.board = ['As', 'Kd', 'Qc', 'Jh', 'Td']
    state.burnCards = ['2c', '3d', '4h']
    state.deck = ['5s', '6s']
    state.mainPot = 2_400
    state.sidePots = [{ amount: 600, eligibleSeatIds: [0, 1] }]
    state.currentBet = 700
    state.lastFullRaiseSize = 400
    state.actionSequence = 9
    state.seats[0] = {
      ...state.seats[0],
      committed: 300,
      totalCommitted: 900,
      hasFolded: true,
      actedThisStreet: true,
      holeCards: ['Ac', 'Ah'],
    }
    state.seats[1] = {
      ...state.seats[1],
      committed: 700,
      totalCommitted: 1_200,
      isAllIn: true,
      actedThisStreet: true,
      holeCards: ['Ks', 'Kh'],
    }
    state.seats[2] = {
      ...state.seats[2],
      isWaitingForNextHand: true,
    }

    const result = startNextHand(state, {
      seed: 'hand-8',
      now: '2026-04-13T02:00:00.000Z',
    })

    const nextState = result.nextState

    expect(nextState.handId).toBe('test-room:hand:8')
    expect(nextState.handNumber).toBe(8)
    expect(nextState.street).toBe('preflop')
    expect(nextState.board).toEqual([])
    expect(nextState.burnCards).toEqual([])
    expect(nextState.mainPot).toBe(0)
    expect(nextState.sidePots).toEqual([])
    expect(nextState.actionSequence).toBe(0)
    expect(nextState.pendingActionSeatIds).toEqual([2, 0, 1])

    expect(nextState.seats[0]).toMatchObject({
      committed: 50,
      totalCommitted: 50,
      hasFolded: false,
      isAllIn: false,
      isWaitingForNextHand: false,
      actedThisStreet: false,
    })
    expect(nextState.seats[1]).toMatchObject({
      committed: 100,
      totalCommitted: 100,
      hasFolded: false,
      isAllIn: false,
      actedThisStreet: false,
    })
    expect(nextState.seats[2]).toMatchObject({
      committed: 0,
      totalCommitted: 0,
      hasFolded: false,
      isAllIn: false,
      isWaitingForNextHand: false,
      actedThisStreet: false,
    })

    expect(() => assertRoomStateInvariants(nextState)).not.toThrow()
  })

  it('handles heads-up dealer, blinds, and preflop action order', () => {
    const state = createSeatFixtureState([
      { seatId: 1, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])
    state.dealerSeat = 4

    const result = startNextHand(state, {
      seed: 'heads-up-1',
      now: '2026-04-13T03:00:00.000Z',
    })

    expect(result.blindAssignments).toEqual({
      dealerSeat: 1,
      smallBlindSeat: 1,
      bigBlindSeat: 4,
      isHeadsUp: true,
    })
    expect(result.nextState.pendingActionSeatIds).toEqual([1, 4])
    expect(result.nextState.raiseRightsSeatIds).toEqual([1, 4])
    expect(result.nextState.actingSeat).toBe(1)
    expect(result.nextState.seats[1]).toMatchObject({
      committed: 50,
      totalCommitted: 50,
      stack: 9_950,
    })
    expect(result.nextState.seats[4]).toMatchObject({
      committed: 100,
      totalCommitted: 100,
      stack: 9_900,
    })
  })

  it('starts in all-in runout mode when no eligible seat can act after blinds', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 50 },
      { seatId: 3, stack: 80 },
    ])

    const result = startNextHand(state, {
      seed: 'all-in-blinds',
      now: '2026-04-13T04:00:00.000Z',
    })

    expect(result.resolution).toBe('all-in-runout')
    expect(result.nextState.currentBet).toBe(80)
    expect(result.nextState.pendingActionSeatIds).toEqual([])
    expect(result.nextState.raiseRightsSeatIds).toEqual([])
    expect(result.nextState.actingSeat).toBeNull()
    expect(result.nextState.seats[0]).toMatchObject({
      committed: 50,
      totalCommitted: 50,
      stack: 0,
      isAllIn: true,
    })
    expect(result.nextState.seats[3]).toMatchObject({
      committed: 80,
      totalCommitted: 80,
      stack: 0,
      isAllIn: true,
    })

    expect(() => assertRoomStateInvariants(result.nextState)).not.toThrow()
  })

  it('rejects starting a hand when too few eligible seats remain', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 1, stack: 10_000, isSittingOut: true },
    ])

    expect(() =>
      startNextHand(state, {
        seed: 'too-few-players',
        now: '2026-04-13T05:00:00.000Z',
      }),
    ).toThrow('Cannot start a new hand with only 1 eligible seats; 2 are required.')
  })
})
