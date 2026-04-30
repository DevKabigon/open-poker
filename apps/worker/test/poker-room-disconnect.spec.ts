import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  applyDisconnectGraceExpirations,
  markSeatDisconnected,
  restoreSeatConnection,
} from '../src/durable-objects/poker-room-disconnect'

function createOccupiedWaitingState(): InternalRoomState {
  const state = createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })

  state.seats[1] = {
    ...state.seats[1]!,
    playerId: 'player-1',
    displayName: 'Player 1',
    stack: 10_000,
  }
  state.seats[4] = {
    ...state.seats[4]!,
    playerId: 'player-4',
    displayName: 'Player 4',
    stack: 10_000,
  }

  return state
}

describe('poker room disconnect lifecycle', () => {
  it('marks an occupied seat disconnected and restores it on reconnect', () => {
    const state = createOccupiedWaitingState()
    const disconnected = markSeatDisconnected(state, 1, '2026-04-13T12:00:00.000Z')

    expect(disconnected.seats[1]?.isDisconnected).toBe(true)
    expect(disconnected.updatedAt).toBe('2026-04-13T12:00:00.000Z')

    const restored = restoreSeatConnection(disconnected, 1, '2026-04-13T12:00:10.000Z')

    expect(restored.seats[1]?.isDisconnected).toBe(false)
    expect(restored.updatedAt).toBe('2026-04-13T12:00:10.000Z')
  })

  it('moves a disconnected waiting seat into sit-out after the grace window', () => {
    const state = createOccupiedWaitingState()
    state.seats[1] = {
      ...state.seats[1]!,
      isDisconnected: true,
    }

    const nextState = applyDisconnectGraceExpirations(state, [1], '2026-04-13T12:01:00.000Z')

    expect(nextState.seats[1]?.isDisconnected).toBe(true)
    expect(nextState.seats[1]?.isSittingOut).toBe(true)
    expect(nextState.seats[1]?.isSittingOutNextHand).toBe(false)
    expect(nextState.seats[1]?.isWaitingForNextHand).toBe(false)
  })

  it('defers active-hand disconnect expiration until the next hand', () => {
    const state = createOccupiedWaitingState()
    state.handId = 'hand-1'
    state.handNumber = 1
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.seats[1] = {
      ...state.seats[1]!,
      isDisconnected: true,
    }

    const nextState = applyDisconnectGraceExpirations(state, [1], '2026-04-13T12:01:00.000Z')

    expect(nextState.seats[1]?.isDisconnected).toBe(true)
    expect(nextState.seats[1]?.isSittingOut).toBe(false)
    expect(nextState.seats[1]?.isSittingOutNextHand).toBe(true)
  })
})
