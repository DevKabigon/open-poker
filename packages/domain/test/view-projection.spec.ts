import { describe, expect, it } from 'vitest'
import {
  dispatchDomainCommand,
  projectPrivatePlayerView,
  projectPublicTableView,
  projectRoomSnapshotMessage,
  type InternalRoomState,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createStartedThreeSeatState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 10_000 },
    { seatId: 2, stack: 10_000 },
    { seatId: 4, stack: 10_000 },
  ])

  return dispatchDomainCommand(state, {
    type: 'start-hand',
    seed: 'view-projection-three-seat',
    timestamp: '2026-04-13T16:00:00.000Z',
  }).nextState
}

function createSettledShowdownState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 9_800, totalCommitted: 200 },
    { seatId: 2, stack: 9_800, totalCommitted: 200 },
    { seatId: 4, stack: 9_800, totalCommitted: 200, hasFolded: true },
  ])

  state.handId = 'settled-hand'
  state.handNumber = 7
  state.handStatus = 'settled'
  state.street = 'showdown'
  state.dealerSeat = 0
  state.smallBlindSeat = 2
  state.bigBlindSeat = 4
  state.board = ['Ah', 'Kd', 'Qc', 'Js', '7d']
  state.currentBet = 0
  state.pendingActionSeatIds = []
  state.raiseRightsSeatIds = []
  state.actingSeat = null
  state.seats[0] = { ...state.seats[0], holeCards: ['2c', '2d'], showCardsAtShowdown: true }
  state.seats[2] = { ...state.seats[2], holeCards: ['As', 'Ad'] }
  state.seats[4] = { ...state.seats[4], holeCards: ['Kh', 'Kc'], showCardsAtShowdown: true }
  state.showdownSummary = {
    handId: state.handId,
    handNumber: state.handNumber,
    handEvaluations: [
      {
        seatId: 0,
        category: 'one-pair',
        bestCards: ['2c', '2d', 'Ah', 'Kd', 'Qc'],
      },
      {
        seatId: 2,
        category: 'three-of-a-kind',
        bestCards: ['As', 'Ad', 'Ah', 'Kd', 'Qc'],
      },
    ],
    potAwards: [
      {
        potIndex: 0,
        amount: 600,
        eligibleSeatIds: [0, 2],
        winnerSeatIds: [2],
        shares: [{ seatId: 2, amount: 600 }],
      },
    ],
    payouts: [{ seatId: 2, amount: 600 }],
    netPayouts: [
      { seatId: 0, amount: -200 },
      { seatId: 2, amount: 400 },
      { seatId: 4, amount: -200 },
    ],
    uncalledBetReturn: null,
  }

  return state
}

function createUncontestedSettledState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 1, stack: 10_400, totalCommitted: 200 },
    { seatId: 3, stack: 9_600, totalCommitted: 200, hasFolded: true },
  ])

  state.handId = 'uncontested-hand'
  state.handNumber = 8
  state.handStatus = 'settled'
  state.street = 'turn'
  state.dealerSeat = 1
  state.smallBlindSeat = 1
  state.bigBlindSeat = 3
  state.board = ['Ah', 'Kd', 'Qc', 'Js']
  state.currentBet = 0
  state.pendingActionSeatIds = []
  state.raiseRightsSeatIds = []
  state.actingSeat = null
  state.seats[1] = { ...state.seats[1], holeCards: ['As', 'Ad'], showCardsAtShowdown: true }
  state.seats[3] = { ...state.seats[3], holeCards: ['Kh', 'Kc'], showCardsAtShowdown: true }
  state.showdownSummary = {
    handId: state.handId,
    handNumber: state.handNumber,
    handEvaluations: [],
    potAwards: [
      {
        potIndex: 0,
        amount: 400,
        eligibleSeatIds: [1],
        winnerSeatIds: [1],
        shares: [{ seatId: 1, amount: 400 }],
      },
    ],
    payouts: [{ seatId: 1, amount: 400 }],
    netPayouts: [
      { seatId: 1, amount: 200 },
      { seatId: 3, amount: -200 },
    ],
    uncalledBetReturn: null,
  }

  return state
}

describe('view projection', () => {
  it('hides every player hole cards from the public table before showdown', () => {
    const state = createStartedThreeSeatState()

    const publicView = projectPublicTableView(state)

    expect(publicView.handStatus).toBe('in-hand')
    expect(publicView.street).toBe('preflop')
    expect(publicView.nextHandStartAt).toBeNull()
    expect(publicView.mainPot).toBe(150)
    expect(publicView.totalPot).toBe(150)
    expect(publicView.uncalledBetReturn).toEqual({
      seatId: state.bigBlindSeat!,
      amount: 50,
    })
    expect(publicView.seats.filter((seat) => seat.isOccupied)).toHaveLength(3)
    expect(publicView.seats.every((seat) => seat.revealedHoleCards === null)).toBe(true)
  })

  it('shows only the seated player own hole cards and legal actions in the private view', () => {
    const state = createStartedThreeSeatState()
    const actingSeat = state.actingSeat!

    const privateView = projectPrivatePlayerView(state, actingSeat, {
      actionDeadlineAt: '2026-04-13T16:00:20.000Z',
    })

    expect(privateView).not.toBeNull()
    expect(privateView?.seatId).toBe(actingSeat)
    expect(privateView?.holeCards).toEqual(state.seats[actingSeat]?.holeCards)
    expect(privateView?.showCardsAtShowdown).toBe(false)
    expect(privateView?.canAct).toBe(true)
    expect(privateView?.allowedActions).toEqual(expect.arrayContaining(['fold', 'call', 'all-in']))
    expect(privateView?.callAmount).toBeGreaterThan(0)
    expect(privateView?.minBetOrRaiseTo).toBeGreaterThan(state.currentBet)
    expect(privateView?.maxBetOrRaiseTo).toBe(state.seats[actingSeat]?.committed + state.seats[actingSeat]?.stack)
    expect(privateView?.actionDeadlineAt).toBe('2026-04-13T16:00:20.000Z')
  })

  it('returns no legal actions for a seated player who is not currently acting', () => {
    const state = createStartedThreeSeatState()
    const waitingSeat = state.seats.find((seat) => seat.playerId !== null && seat.seatId !== state.actingSeat)?.seatId

    expect(waitingSeat).not.toBeUndefined()

    const privateView = projectPrivatePlayerView(state, waitingSeat!)

    expect(privateView).not.toBeNull()
    expect(privateView?.holeCards).toEqual(state.seats[waitingSeat!]?.holeCards)
    expect(privateView?.canAct).toBe(false)
    expect(privateView?.allowedActions).toEqual([])
    expect(privateView?.callAmount).toBe(0)
    expect(privateView?.minBetOrRaiseTo).toBeNull()
    expect(privateView?.maxBetOrRaiseTo).toBeNull()
    expect(privateView?.actionDeadlineAt).toBeNull()
  })

  it('reveals showdown winners and opted-in showdown losers after the hand ends', () => {
    const state = createSettledShowdownState()

    const publicView = projectPublicTableView(state, {
      nextHandStartAt: '2026-04-13T16:05:03.000Z',
    })

    expect(publicView.board).toEqual(['Ah', 'Kd', 'Qc', 'Js', '7d'])
    expect(publicView.nextHandStartAt).toBe('2026-04-13T16:05:03.000Z')
    expect(publicView.seats[0]?.revealedHoleCards).toEqual(['2c', '2d'])
    expect(publicView.seats[2]?.revealedHoleCards).toEqual(['As', 'Ad'])
    expect(publicView.seats[4]?.revealedHoleCards).toBeNull()
    expect(publicView.showdownSummary?.payouts).toEqual([{ seatId: 2, amount: 600 }])
    expect(publicView.showdownSummary?.handEvaluations[0]).toMatchObject({
      seatId: 0,
      category: 'one-pair',
      isRevealed: true,
    })
    expect(publicView.showdownSummary?.handEvaluations[1]).toMatchObject({
      seatId: 2,
      category: 'three-of-a-kind',
      bestCards: ['As', 'Ad', 'Ah', 'Kd', 'Qc'],
      isRevealed: true,
    })
  })

  it('mucks losing showdown hands that did not opt in', () => {
    const state = createSettledShowdownState()
    state.seats[0] = { ...state.seats[0], showCardsAtShowdown: false }

    const publicView = projectPublicTableView(state)

    expect(publicView.seats[0]?.revealedHoleCards).toBeNull()
    expect(publicView.seats[2]?.revealedHoleCards).toEqual(['As', 'Ad'])
    expect(publicView.showdownSummary?.handEvaluations[0]).toMatchObject({
      seatId: 0,
      category: null,
      bestCards: null,
      isRevealed: false,
    })
    expect(publicView.showdownSummary?.handEvaluations[1]).toMatchObject({
      seatId: 2,
      category: 'three-of-a-kind',
      bestCards: ['As', 'Ad', 'Ah', 'Kd', 'Qc'],
      isRevealed: true,
    })
  })

  it('reveals only opted-in seats after an uncontested folded hand ends', () => {
    const state = createUncontestedSettledState()

    const publicView = projectPublicTableView(state)

    expect(publicView.handStatus).toBe('settled')
    expect(publicView.street).toBe('turn')
    expect(publicView.showdownSummary).toMatchObject({
      handEvaluations: [],
      potAwards: [
        {
          winnerSeatIds: [1],
          shares: [{ seatId: 1, amount: 400 }],
        },
      ],
      payouts: [{ seatId: 1, amount: 400 }],
    })
    expect(publicView.seats[1]?.revealedHoleCards).toEqual(['As', 'Ad'])
    expect(publicView.seats[3]?.revealedHoleCards).toEqual(['Kh', 'Kc'])
  })

  it('builds a room snapshot with public and viewer-specific private state', () => {
    const state = createStartedThreeSeatState()
    const viewerSeatId = state.actingSeat!

    const snapshot = projectRoomSnapshotMessage(state, {
      viewerSeatId,
      actionDeadlineAt: '2026-04-13T16:10:00.000Z',
      nextHandStartAt: '2026-04-13T16:10:03.000Z',
    })

    expect(snapshot.type).toBe('room-snapshot')
    expect(snapshot.roomVersion).toBe(state.roomVersion)
    expect(snapshot.table.roomId).toBe(state.roomId)
    expect(snapshot.table.nextHandStartAt).toBe('2026-04-13T16:10:03.000Z')
    expect(snapshot.privateView?.seatId).toBe(viewerSeatId)
    expect(snapshot.privateView?.actionDeadlineAt).toBe('2026-04-13T16:10:00.000Z')
  })
})
