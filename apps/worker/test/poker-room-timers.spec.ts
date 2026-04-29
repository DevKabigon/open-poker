import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  createEmptyPokerRoomRuntimeState,
  derivePokerRoomRuntimeState,
  getNextRuntimeAlarmAt,
  getTimedOutSeatId,
  isRuntimeDeadlineCurrent,
  isRuntimeNextHandStartCurrent,
  shouldAutoStartNextHand,
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

function createSettledState(): InternalRoomState {
  const state = createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })

  state.handId = 'hand-1'
  state.handNumber = 1
  state.handStatus = 'settled'
  state.street = 'showdown'
  state.seats[1] = {
    ...state.seats[1],
    playerId: 'player-1',
    displayName: 'Player 1',
    stack: 9_900,
  }
  state.seats[4] = {
    ...state.seats[4],
    playerId: 'player-4',
    displayName: 'Player 4',
    stack: 10_100,
  }

  return state
}

describe('poker room timers', () => {
  it('derives an action deadline when a seat is currently acting', () => {
    const state = createActingState()

    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(runtimeState).toEqual({
      actionDeadlineAt: '2026-04-13T12:00:30.000Z',
      actionSeatId: 2,
      actionSequence: 3,
      nextHandStartAt: null,
      nextHandFromHandNumber: null,
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

  it('preserves a current action deadline when deriving metadata for the same turn', () => {
    const state = createActingState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    const nextRuntimeState = derivePokerRoomRuntimeState(
      state,
      '2026-04-13T12:00:10.000Z',
      runtimeState,
    )

    expect(nextRuntimeState.actionDeadlineAt).toBe('2026-04-13T12:00:30.000Z')
    expect(nextRuntimeState.actionSeatId).toBe(2)
    expect(nextRuntimeState.actionSequence).toBe(3)
  })

  it('returns the acting seat only once the deadline has actually expired', () => {
    const state = createActingState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(getTimedOutSeatId(state, runtimeState, '2026-04-13T12:00:29.999Z')).toBeNull()
    expect(getTimedOutSeatId(state, runtimeState, '2026-04-13T12:00:30.000Z')).toBe(2)
  })

  it('derives a next-hand start timestamp once a settled table still has enough eligible players', () => {
    const state = createSettledState()

    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(runtimeState).toEqual({
      actionDeadlineAt: null,
      actionSeatId: null,
      actionSequence: null,
      nextHandStartAt: '2026-04-13T12:00:05.000Z',
      nextHandFromHandNumber: 1,
    })
  })

  it('can leave a settled table unscheduled for manual next-hand control', () => {
    const state = createSettledState()

    const runtimeState = derivePokerRoomRuntimeState(
      state,
      '2026-04-13T12:00:00.000Z',
      null,
      { scheduleNextHand: false },
    )

    expect(runtimeState).toEqual(createEmptyPokerRoomRuntimeState())
    expect(getNextRuntimeAlarmAt(runtimeState)).toBeNull()
    expect(shouldAutoStartNextHand(state, runtimeState, '2026-04-13T12:00:05.000Z')).toBe(false)
  })

  it('recognizes when a between-hands auto-start schedule is still current', () => {
    const state = createSettledState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(isRuntimeNextHandStartCurrent(state, runtimeState)).toBe(true)

    state.handNumber = 2

    expect(isRuntimeNextHandStartCurrent(state, runtimeState)).toBe(false)
  })

  it('preserves a current next-hand start timestamp when deriving metadata for the same settled hand', () => {
    const state = createSettledState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    const nextRuntimeState = derivePokerRoomRuntimeState(
      state,
      '2026-04-13T12:00:02.000Z',
      runtimeState,
    )

    expect(nextRuntimeState.nextHandStartAt).toBe('2026-04-13T12:00:05.000Z')
    expect(nextRuntimeState.nextHandFromHandNumber).toBe(1)
  })

  it('starts the next hand only after the between-hands delay has expired', () => {
    const state = createSettledState()
    const runtimeState = derivePokerRoomRuntimeState(state, '2026-04-13T12:00:00.000Z')

    expect(shouldAutoStartNextHand(state, runtimeState, '2026-04-13T12:00:04.999Z')).toBe(false)
    expect(shouldAutoStartNextHand(state, runtimeState, '2026-04-13T12:00:05.000Z')).toBe(true)
  })

  it('can choose the nearest pending runtime alarm timestamp', () => {
    expect(
      getNextRuntimeAlarmAt({
        actionDeadlineAt: '2026-04-13T12:00:30.000Z',
        actionSeatId: 2,
        actionSequence: 3,
        nextHandStartAt: '2026-04-13T12:00:05.000Z',
        nextHandFromHandNumber: 1,
      }),
    ).toBe('2026-04-13T12:00:05.000Z')
  })
})
