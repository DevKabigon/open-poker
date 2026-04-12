import { describe, expect, it } from 'vitest'
import { assertRoomStateInvariants, createInitialRoomState } from '../src'

describe('initial room state', () => {
  it('creates a valid waiting state with empty seats and no active hand', () => {
    const state = createInitialRoomState('room-alpha', {
      now: '2026-04-12T12:00:00.000Z',
    })

    expect(state.handStatus).toBe('waiting')
    expect(state.street).toBe('idle')
    expect(state.handId).toBeNull()
    expect(state.seats).toHaveLength(6)
    expect(state.pendingActionSeatIds).toEqual([])
    expect(state.mainPot).toBe(0)
    expect(state.currentBet).toBe(0)
    expect(state.createdAt).toBe('2026-04-12T12:00:00.000Z')

    expect(() => assertRoomStateInvariants(state)).not.toThrow()
  })
})
