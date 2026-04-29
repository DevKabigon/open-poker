import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  canAutoStartHand,
  canAutoStartHandImmediately,
  createAutoStartSeed,
  maybeAutoStartHand,
} from '../src/durable-objects/poker-room-auto-start'

function createRoomState(): InternalRoomState {
  return createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })
}

function seatPlayer(state: InternalRoomState, seatId: number, playerId: string, stack = 10_000): void {
  state.seats[seatId] = {
    ...state.seats[seatId]!,
    playerId,
    displayName: playerId,
    stack,
    isSittingOut: false,
    isDisconnected: false,
  }
}

describe('poker room auto start', () => {
  it('does not auto-start with fewer than the configured minimum eligible players', () => {
    const state = createRoomState()
    seatPlayer(state, 1, 'player-1')

    expect(canAutoStartHand(state)).toBe(false)
    expect(maybeAutoStartHand(state, '2026-04-13T20:00:00.000Z')).toBeNull()
  })

  it('auto-starts once enough eligible players are seated and the room is idle', () => {
    const state = createRoomState()
    seatPlayer(state, 1, 'player-1')
    seatPlayer(state, 4, 'player-4')

    const result = maybeAutoStartHand(state, '2026-04-13T20:00:00.000Z')

    expect(result).not.toBeNull()
    expect(result?.seed).toBe('room-1:auto-start:1:2026-04-13T20:00:00.000Z')
    expect(result?.events[0]?.type).toBe('hand-started')
    expect(result?.nextState.handStatus).toBe('in-hand')
    expect(result?.nextState.street).toBe('preflop')
    expect(result?.nextState.handNumber).toBe(1)
    expect(canAutoStartHandImmediately(state)).toBe(false)
  })

  it('does not auto-start while a hand is already active or showing down', () => {
    const inHandState = createRoomState()
    seatPlayer(inHandState, 1, 'player-1')
    seatPlayer(inHandState, 4, 'player-4')
    inHandState.handStatus = 'in-hand'
    inHandState.street = 'turn'

    const showdownState = createRoomState()
    seatPlayer(showdownState, 1, 'player-1')
    seatPlayer(showdownState, 4, 'player-4')
    showdownState.handStatus = 'showdown'
    showdownState.street = 'showdown'

    expect(canAutoStartHand(inHandState)).toBe(false)
    expect(canAutoStartHand(showdownState)).toBe(false)
    expect(maybeAutoStartHand(inHandState, '2026-04-13T20:00:00.000Z')).toBeNull()
    expect(maybeAutoStartHand(showdownState, '2026-04-13T20:00:00.000Z')).toBeNull()
  })

  it('allows generic auto-start from a settled state but not immediate waiting-style auto-start', () => {
    const state = createRoomState()
    seatPlayer(state, 1, 'player-1')
    seatPlayer(state, 4, 'player-4')
    state.handStatus = 'settled'
    state.street = 'showdown'

    expect(canAutoStartHand(state)).toBe(true)
    expect(canAutoStartHandImmediately(state)).toBe(false)
    expect(maybeAutoStartHand(state, '2026-04-13T20:00:00.000Z')?.nextState.handStatus).toBe('in-hand')
  })

  it('can generate a fresh auto-start seed for later hands too', () => {
    const state = createRoomState()
    state.handNumber = 7

    expect(createAutoStartSeed(state, '2026-04-13T20:00:00.000Z')).toBe(
      'room-1:auto-start:8:2026-04-13T20:00:00.000Z',
    )
  })
})
