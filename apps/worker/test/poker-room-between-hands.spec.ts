import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  canScheduleNextHand,
  clearSettledHandForWaiting,
  createNextHandStartAt,
  DEFAULT_BETWEEN_HANDS_DELAY_MS,
  DEFAULT_UNCONTESTED_HAND_DELAY_MS,
  DEFAULT_WAITING_ROOM_START_DELAY_MS,
  getNextHandDelayMs,
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

  it('schedules a waiting room start once enough players are seated', () => {
    const state = createRoomState()
    seatPlayer(state, 1, 'player-1')
    seatPlayer(state, 4, 'player-4')

    expect(canScheduleNextHand(state)).toBe(true)
    expect(getNextHandDelayMs(state)).toBe(DEFAULT_WAITING_ROOM_START_DELAY_MS)
  })

  it('uses result delays only for hands that just completed', () => {
    const showdownState = createRoomState()
    showdownState.handStatus = 'settled'
    showdownState.street = 'showdown'
    showdownState.showdownSummary = {
      handId: 'hand-1',
      handNumber: 1,
      handEvaluations: [{ seatId: 1, category: 'one-pair', bestCards: ['As', 'Ah', 'Kc', 'Qd', '2s'] }],
      potAwards: [],
      payouts: [],
      netPayouts: [],
      uncalledBetReturn: null,
    }

    const uncontestedState = createRoomState()
    uncontestedState.handStatus = 'settled'
    uncontestedState.street = 'showdown'
    uncontestedState.showdownSummary = {
      handId: 'hand-2',
      handNumber: 2,
      handEvaluations: [],
      potAwards: [],
      payouts: [],
      netPayouts: [],
      uncalledBetReturn: null,
    }

    expect(getNextHandDelayMs(showdownState, { settledHandJustCompleted: true })).toBe(DEFAULT_BETWEEN_HANDS_DELAY_MS)
    expect(getNextHandDelayMs(uncontestedState, { settledHandJustCompleted: true })).toBe(DEFAULT_UNCONTESTED_HAND_DELAY_MS)
    expect(getNextHandDelayMs(showdownState)).toBe(DEFAULT_WAITING_ROOM_START_DELAY_MS)
  })

  it('derives the next hand start timestamp from the configured delay window', () => {
    expect(createNextHandStartAt('2026-04-25T12:00:00.000Z')).toBe('2026-04-25T12:00:10.000Z')
    expect(DEFAULT_BETWEEN_HANDS_DELAY_MS).toBe(10_000)
    expect(DEFAULT_UNCONTESTED_HAND_DELAY_MS).toBe(5_000)
    expect(DEFAULT_WAITING_ROOM_START_DELAY_MS).toBe(3_000)
  })

  it('clears a settled result back to waiting without losing seated players or button memory', () => {
    const state = createRoomState()
    state.handId = 'hand-12'
    state.handNumber = 12
    state.handStatus = 'settled'
    state.street = 'showdown'
    state.dealerSeat = 4
    state.smallBlindSeat = 4
    state.bigBlindSeat = 1
    state.board = ['2c', '7d', 'Jh', 'Qs', 'Ad']
    state.burnCards = ['3c', '4c', '5c']
    state.deck = ['6c', '8c']
    state.showdownSummary = {
      handId: 'hand-12',
      handNumber: 12,
      handEvaluations: [{ seatId: 1, category: 'one-pair', bestCards: ['As', 'Ad', 'Qs', 'Jh', '7d'] }],
      potAwards: [],
      payouts: [],
      netPayouts: [],
      uncalledBetReturn: null,
    }
    seatPlayer(state, 1, 'player-1')
    state.seats[1] = {
      ...state.seats[1]!,
      holeCards: ['As', 'Kh'],
      hasFolded: true,
      isAllIn: true,
      committed: 100,
      totalCommitted: 200,
      isSittingOutNextHand: true,
      actedThisStreet: true,
      lastAction: { type: 'call', amount: 100 },
    }

    const nextState = clearSettledHandForWaiting(state, '2026-04-25T12:00:10.000Z')

    expect(nextState).toMatchObject({
      handId: null,
      handNumber: 12,
      handStatus: 'waiting',
      street: 'idle',
      dealerSeat: 4,
      smallBlindSeat: null,
      bigBlindSeat: null,
      board: [],
      burnCards: [],
      deck: [],
      showdownSummary: null,
      updatedAt: '2026-04-25T12:00:10.000Z',
    })
    expect(nextState.seats[1]).toMatchObject({
      playerId: 'player-1',
      holeCards: null,
      hasFolded: false,
      isAllIn: false,
      committed: 0,
      totalCommitted: 0,
      isSittingOut: true,
      isSittingOutNextHand: false,
      actedThisStreet: false,
      lastAction: null,
    })
  })
})
