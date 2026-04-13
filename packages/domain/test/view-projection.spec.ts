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
  state.board = ['Ah', 'Kd', 'Qc', 'Js', 'Td']
  state.currentBet = 0
  state.pendingActionSeatIds = []
  state.raiseRightsSeatIds = []
  state.actingSeat = null
  state.seats[0] = { ...state.seats[0], holeCards: ['2c', '2d'] }
  state.seats[2] = { ...state.seats[2], holeCards: ['As', 'Ad'] }
  state.seats[4] = { ...state.seats[4], holeCards: ['Kh', 'Kc'] }

  return state
}

describe('view projection', () => {
  it('hides every player hole cards from the public table before showdown', () => {
    const state = createStartedThreeSeatState()

    const publicView = projectPublicTableView(state)

    expect(publicView.handStatus).toBe('in-hand')
    expect(publicView.street).toBe('preflop')
    expect(publicView.mainPot).toBe(100)
    expect(publicView.totalPot).toBe(100)
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

  it('reveals showdown hole cards only for players who did not fold', () => {
    const state = createSettledShowdownState()

    const publicView = projectPublicTableView(state)

    expect(publicView.board).toEqual(['Ah', 'Kd', 'Qc', 'Js', 'Td'])
    expect(publicView.seats[0]?.revealedHoleCards).toEqual(['2c', '2d'])
    expect(publicView.seats[2]?.revealedHoleCards).toEqual(['As', 'Ad'])
    expect(publicView.seats[4]?.revealedHoleCards).toBeNull()
  })

  it('builds a room snapshot with public and viewer-specific private state', () => {
    const state = createStartedThreeSeatState()
    const viewerSeatId = state.actingSeat!

    const snapshot = projectRoomSnapshotMessage(state, {
      viewerSeatId,
      actionDeadlineAt: '2026-04-13T16:10:00.000Z',
    })

    expect(snapshot.type).toBe('room-snapshot')
    expect(snapshot.roomVersion).toBe(state.roomVersion)
    expect(snapshot.table.roomId).toBe(state.roomId)
    expect(snapshot.privateView?.seatId).toBe(viewerSeatId)
    expect(snapshot.privateView?.actionDeadlineAt).toBe('2026-04-13T16:10:00.000Z')
  })
})
