import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  createEmptyPokerRoomRuntimeState,
  derivePokerRoomRuntimeState,
  getTimedOutSeatId,
  isRuntimeDeadlineCurrent,
} from '../src/durable-objects/poker-room-timers'

function createActingState(): InternalRoomState {
  const state = createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })

  state.handId = 'hand-1'
  state.handNumber = 1
  state.handStatus = 'in-hand'
  state.street = 'preflop'
  state.actionSequence = 3
  state.actingSeat = 2
  state.pendingActionSeatIds = [2, 4]
  state.raiseRightsSeatIds = [2, 4]
  state.seats[2] = {
    ...state.seats[2],
    playerId: 'player-2',
    displayName: 'Player 2',
    stack: 9_900,
  }
  state.seats[4] = {
    ...state.seats[4],
    playerId: 'player-4',
    displayName: 'Player 4',
    stack: 9_900,
  }

  return state
}

describe('poker room timers', () => {
  it('derives an action deadline when a seat is currently acting', () => {
    const state = createActingState()

    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(runtimeState).toEqual({
      actionDeadlineAt: '2026-04-13T12:00:20.000Z',
      actionSeatId: 2,
      actionSequence: 3,
    })
  })

  it('clears runtime deadline metadata when no action is pending', () => {
    const state = createActingState()
    state.actingSeat = null
    state.pendingActionSeatIds = []

    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(runtimeState).toEqual(createEmptyPokerRoomRuntimeState())
  })

  it('recognizes when stored timeout metadata still matches the current turn', () => {
    const state = createActingState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(isRuntimeDeadlineCurrent(state, runtimeState)).toBe(true)

    state.actionSequence += 1

    expect(isRuntimeDeadlineCurrent(state, runtimeState)).toBe(false)
  })

  it('returns the acting seat only once the deadline has actually expired', () => {
    const state = createActingState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(getTimedOutSeatId(state, runtimeState, '2026-04-13T12:00:19.999Z')).toBeNull()
    expect(getTimedOutSeatId(state, runtimeState, '2026-04-13T12:00:20.000Z')).toBe(2)
  })
})
