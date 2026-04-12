import { describe, expect, it } from 'vitest'
import { createInitialRoomState, getRoomStateInvariantIssues, type InternalRoomState } from '../src'

function createActiveSeatState(): InternalRoomState {
  const state = createInitialRoomState('room-beta', {
    now: '2026-04-12T12:00:00.000Z',
  })

  state.handStatus = 'in-hand'
  state.handId = 'hand-1'
  state.handNumber = 1
  state.street = 'preflop'

  state.seats[0] = {
    ...state.seats[0],
    playerId: 'p1',
    displayName: 'Alice',
    stack: 10_000,
    holeCards: ['As', 'Kd'],
  }

  state.seats[1] = {
    ...state.seats[1],
    playerId: 'p2',
    displayName: 'Bob',
    stack: 10_000,
    holeCards: ['Qc', 'Qh'],
  }

  state.dealerSeat = 0
  state.smallBlindSeat = 0
  state.bigBlindSeat = 1
  state.actingSeat = 0
  state.pendingActionSeatIds = [0, 1]

  return state
}

describe('room state invariants', () => {
  it('rejects duplicate player ids across occupied seats', () => {
    const state = createActiveSeatState()
    state.seats[1] = {
      ...state.seats[1],
      playerId: 'p1',
    }

    const issues = getRoomStateInvariantIssues(state)

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'seats[1].playerId' })]),
    )
  })

  it('rejects board lengths that do not match the street', () => {
    const state = createActiveSeatState()
    state.street = 'flop'
    state.board = ['Ah', 'Kh']

    const issues = getRoomStateInvariantIssues(state)

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'board' })]),
    )
  })

  it('rejects acting seats that cannot legally act', () => {
    const state = createActiveSeatState()
    state.seats[0] = {
      ...state.seats[0],
      isAllIn: true,
    }

    const issues = getRoomStateInvariantIssues(state)

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'actingSeat' })]),
    )
  })

  it('rejects duplicate cards across players and board state', () => {
    const state = createActiveSeatState()
    state.street = 'flop'
    state.board = ['As', '2d', '3c']

    const issues = getRoomStateInvariantIssues(state)

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'seats[0].holeCards[0]',
          message: expect.stringContaining('duplicated'),
        }),
      ]),
    )
  })
})
