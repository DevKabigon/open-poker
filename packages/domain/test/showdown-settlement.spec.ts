import { describe, expect, it } from 'vitest'
import { assertRoomStateInvariants, settleShowdown, type InternalRoomState } from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createShowdownState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 9_800, totalCommitted: 200 },
    { seatId: 1, stack: 9_800, totalCommitted: 200 },
    { seatId: 2, stack: 9_800, totalCommitted: 200 },
  ])

  state.handId = 'hand-showdown'
  state.handNumber = 1
  state.handStatus = 'showdown'
  state.street = 'showdown'
  state.dealerSeat = 0
  state.smallBlindSeat = 1
  state.bigBlindSeat = 2
  state.board = ['2c', '7d', '9h', 'Jc', 'Qd']
  state.currentBet = 0
  state.pendingActionSeatIds = []
  state.raiseRightsSeatIds = []
  state.actingSeat = null

  return state
}

describe('showdown settlement', () => {
  it('awards the full main pot to the best hand and clears active pot state', () => {
    const state = createShowdownState()
    state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
    state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Kh'] }
    state.seats[2] = { ...state.seats[2], holeCards: ['3s', '3h'] }

    const result = settleShowdown(state, {
      now: '2026-04-13T09:00:00.000Z',
    })

    expect(result.potCalculation).toMatchObject({
      mainPot: 600,
      totalPot: 600,
      uncalledBetReturn: null,
    })
    expect(result.potAwards).toEqual([
      {
        potIndex: 0,
        amount: 600,
        eligibleSeatIds: [0, 1, 2],
        winnerSeatIds: [0],
        shares: [{ seatId: 0, amount: 600 }],
      },
    ])
    expect(result.payouts).toEqual([{ seatId: 0, amount: 600 }])
    expect(result.nextState.showdownSummary).toMatchObject({
      handId: 'hand-showdown',
      handNumber: 1,
      handEvaluations: [
        {
          seatId: 0,
          category: 'one-pair',
          bestCards: ['As', 'Ah', '9h', 'Jc', 'Qd'],
        },
        {
          seatId: 1,
          category: 'one-pair',
          bestCards: ['Ks', 'Kh', '9h', 'Jc', 'Qd'],
        },
        {
          seatId: 2,
          category: 'one-pair',
          bestCards: ['3s', '3h', '9h', 'Jc', 'Qd'],
        },
      ],
      potAwards: result.potAwards,
      payouts: result.payouts,
      uncalledBetReturn: null,
    })

    expect(result.nextState.handStatus).toBe('settled')
    expect(result.nextState.mainPot).toBe(0)
    expect(result.nextState.sidePots).toEqual([])
    expect(result.nextState.currentBet).toBe(0)
    expect(result.nextState.pendingActionSeatIds).toEqual([])
    expect(result.nextState.seats[0]).toMatchObject({
      stack: 10_400,
      committed: 0,
      totalCommitted: 0,
    })
    expect(result.nextState.seats[1]).toMatchObject({
      stack: 9_800,
      committed: 0,
      totalCommitted: 0,
    })

    expect(() => assertRoomStateInvariants(result.nextState)).not.toThrow()
  })

  it('awards the main pot and side pot to different winners when eligibility differs', () => {
    const state = createShowdownState()
    state.seats[0] = {
      ...state.seats[0],
      stack: 9_800,
      totalCommitted: 200,
      holeCards: ['As', 'Ad'],
    }
    state.seats[1] = {
      ...state.seats[1],
      stack: 9_600,
      totalCommitted: 400,
      holeCards: ['Ks', 'Qh'],
    }
    state.seats[2] = {
      ...state.seats[2],
      stack: 9_600,
      totalCommitted: 400,
      holeCards: ['Js', 'Th'],
    }
    state.board = ['Ac', 'Kd', '7h', '4s', '2d']

    const result = settleShowdown(state)

    expect(result.potAwards).toEqual([
      {
        potIndex: 0,
        amount: 600,
        eligibleSeatIds: [0, 1, 2],
        winnerSeatIds: [0],
        shares: [{ seatId: 0, amount: 600 }],
      },
      {
        potIndex: 1,
        amount: 400,
        eligibleSeatIds: [1, 2],
        winnerSeatIds: [1],
        shares: [{ seatId: 1, amount: 400 }],
      },
    ])
    expect(result.nextState.seats[0]?.stack).toBe(10_400)
    expect(result.nextState.seats[1]?.stack).toBe(10_000)
    expect(result.nextState.seats[2]?.stack).toBe(9_600)
  })

  it('splits tied pots and gives the odd chip to the first winner clockwise from the dealer', () => {
    const state = createShowdownState()
    state.dealerSeat = 2
    state.seats[0] = {
      ...state.seats[0],
      stack: 9_950,
      totalCommitted: 50,
      holeCards: ['2h', '3d'],
    }
    state.seats[1] = {
      ...state.seats[1],
      stack: 9_999,
      totalCommitted: 1,
      hasFolded: true,
      holeCards: ['4c', '5d'],
    }
    state.seats[2] = {
      ...state.seats[2],
      stack: 9_950,
      totalCommitted: 50,
      holeCards: ['6c', '7d'],
    }
    state.board = ['As', 'Ks', 'Qs', 'Js', 'Ts']

    const result = settleShowdown(state)

    expect(result.potCalculation).toMatchObject({
      mainPot: 3,
      totalPot: 101,
      uncalledBetReturn: null,
    })
    expect(result.potAwards).toEqual([
      {
        potIndex: 0,
        amount: 3,
        eligibleSeatIds: [0, 2],
        winnerSeatIds: [0, 2],
        shares: [
          { seatId: 0, amount: 2 },
          { seatId: 2, amount: 1 },
        ],
      },
      {
        potIndex: 1,
        amount: 98,
        eligibleSeatIds: [0, 2],
        winnerSeatIds: [0, 2],
        shares: [
          { seatId: 0, amount: 49 },
          { seatId: 2, amount: 49 },
        ],
      },
    ])
    expect(result.payouts).toEqual([
      { seatId: 0, amount: 51 },
      { seatId: 2, amount: 50 },
    ])
    expect(result.nextState.seats[0]?.stack).toBe(10_001)
    expect(result.nextState.seats[2]?.stack).toBe(10_000)
  })

  it('returns uncalled excess chips separately while still awarding dead chips in contested pots', () => {
    const state = createShowdownState()
    state.seats[0] = {
      ...state.seats[0],
      stack: 9_600,
      totalCommitted: 400,
      holeCards: ['As', 'Ad'],
    }
    state.seats[1] = {
      ...state.seats[1],
      stack: 9_700,
      totalCommitted: 300,
      holeCards: ['Ks', 'Kh'],
    }
    state.seats[2] = {
      ...state.seats[2],
      stack: 9_800,
      totalCommitted: 200,
      hasFolded: true,
      holeCards: ['2s', '3s'],
    }

    const result = settleShowdown(state)

    expect(result.potCalculation).toMatchObject({
      mainPot: 600,
      totalPot: 800,
      uncalledBetReturn: {
        seatId: 0,
        amount: 100,
      },
    })
    expect(result.potAwards).toEqual([
      {
        potIndex: 0,
        amount: 600,
        eligibleSeatIds: [0, 1],
        winnerSeatIds: [0],
        shares: [{ seatId: 0, amount: 600 }],
      },
      {
        potIndex: 1,
        amount: 200,
        eligibleSeatIds: [0, 1],
        winnerSeatIds: [0],
        shares: [{ seatId: 0, amount: 200 }],
      },
    ])
    expect(result.payouts).toEqual([{ seatId: 0, amount: 800 }])
    expect(result.nextState.seats[0]?.stack).toBe(10_500)
    expect(result.nextState.seats[1]?.stack).toBe(9_700)
    expect(result.nextState.seats[2]?.stack).toBe(9_800)
  })

  it('rejects settlement when an eligible seat is missing hole cards', () => {
    const state = createShowdownState()
    state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
    state.seats[1] = { ...state.seats[1], holeCards: null }
    state.seats[2] = { ...state.seats[2], holeCards: ['Ks', 'Kh'] }

    expect(() => settleShowdown(state)).toThrow('Seat 1 is still in the hand but has no hole cards.')
  })
})
