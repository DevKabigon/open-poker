import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  canScheduleNextHand,
  createNextHandStartAt,
  DEFAULT_BETWEEN_HANDS_DELAY_MS,
} from '../src/durable-objects/poker-room-between-hands'

function createRoomState(): InternalRoomState {
  return createInitialRoomState('room-1', {
    now: '2026-04-25T00:00:00.000Z',
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

describe('poker room between hands', () => {
  it('schedules the next hand only when a settled table still has enough eligible players', () => {
    const state = createRoomState()
    state.handStatus = 'settled'
    state.street = 'showdown'
    seatPlayer(state, 1, 'player-1')
    seatPlayer(state, 4, 'player-4')

    expect(canScheduleNextHand(state)).toBe(true)

    state.seats[4] = {
      ...state.seats[4]!,
      isSittingOut: true,
    }

    expect(canScheduleNextHand(state)).toBe(false)
  })

  it('never schedules the next hand while the current hand is still active', () => {
    const state = createRoomState()
    seatPlayer(state, 1, 'player-1')
    seatPlayer(state, 4, 'player-4')
    state.handStatus = 'in-hand'
    state.street = 'river'

    expect(canScheduleNextHand(state)).toBe(false)
  })

  it('derives the next hand start timestamp from the configured delay window', () => {
    expect(createNextHandStartAt('2026-04-25T12:00:00.000Z')).toBe('2026-04-25T12:00:10.000Z')
    expect(DEFAULT_BETWEEN_HANDS_DELAY_MS).toBe(10_000)
  })
})
