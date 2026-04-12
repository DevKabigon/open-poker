import { describe, expect, it } from 'vitest'
import {
  getAllowedActionTypes,
  getSeatActionContext,
  validateActionRequest,
  type InternalRoomState,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createActingState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 10_000 },
    { seatId: 1, stack: 10_000 },
    { seatId: 2, stack: 10_000 },
  ])

  state.handStatus = 'in-hand'
  state.handId = 'hand-1'
  state.handNumber = 1
  state.street = 'preflop'
  state.dealerSeat = 0
  state.smallBlindSeat = 1
  state.bigBlindSeat = 2
  state.actingSeat = 0
  state.pendingActionSeatIds = [0, 1, 2]

  return state
}

describe('action validation', () => {
  it('returns check, bet, and all-in in an unopened pot', () => {
    const state = createActingState()
    state.currentBet = 0
    state.lastFullRaiseSize = state.config.bigBlind

    expect(getAllowedActionTypes(state, 0)).toEqual(['fold', 'all-in', 'check', 'bet'])
    expect(getSeatActionContext(state, 0)).toMatchObject({
      outstandingCallAmount: 0,
      minOpenBetTo: 100,
      minRaiseTo: null,
    })
  })

  it('returns call, raise, and all-in when facing a bet with enough chips', () => {
    const state = createActingState()
    state.currentBet = 200
    state.lastFullRaiseSize = 100
    state.seats[0] = {
      ...state.seats[0],
      committed: 100,
      totalCommitted: 100,
    }
    state.seats[2] = {
      ...state.seats[2],
      committed: 200,
      totalCommitted: 200,
    }

    expect(getAllowedActionTypes(state, 0)).toEqual(['fold', 'all-in', 'call', 'raise'])
    expect(getSeatActionContext(state, 0)).toMatchObject({
      outstandingCallAmount: 100,
      requiredCallAmount: 100,
      minRaiseTo: 300,
    })
  })

  it('still allows a short-stack call and all-in when a full call is not possible', () => {
    const state = createActingState()
    state.currentBet = 500
    state.lastFullRaiseSize = 300
    state.seats[0] = {
      ...state.seats[0],
      stack: 200,
      committed: 100,
      totalCommitted: 100,
    }

    expect(getAllowedActionTypes(state, 0)).toEqual(['fold', 'all-in', 'call'])

    const result = validateActionRequest(state, 0, { type: 'call' })

    expect(result).toEqual({
      ok: true,
      value: {
        requestedType: 'call',
        resolvedType: 'call',
        targetCommitted: 300,
        addedChips: 200,
        isAllIn: true,
        isFullRaise: false,
      },
    })
  })

  it('rejects check when there is an outstanding bet', () => {
    const state = createActingState()
    state.currentBet = 200
    state.seats[0] = {
      ...state.seats[0],
      committed: 100,
      totalCommitted: 100,
    }

    expect(validateActionRequest(state, 0, { type: 'check' })).toEqual({
      ok: false,
      reason: 'Check is only legal when there is no outstanding bet to call.',
    })
  })

  it('rejects an opening bet below the minimum unless it is all-in', () => {
    const state = createActingState()
    state.currentBet = 0

    expect(validateActionRequest(state, 0, { type: 'bet', amount: 50 })).toEqual({
      ok: false,
      reason: 'Opening bet must be at least the big blind unless it is an all-in bet.',
    })
  })

  it('allows an all-in opening bet below the big blind as a short all-in', () => {
    const state = createActingState()
    state.currentBet = 0
    state.seats[0] = {
      ...state.seats[0],
      stack: 60,
    }

    expect(validateActionRequest(state, 0, { type: 'all-in' })).toEqual({
      ok: true,
      value: {
        requestedType: 'all-in',
        resolvedType: 'bet',
        targetCommitted: 60,
        addedChips: 60,
        isAllIn: true,
        isFullRaise: false,
      },
    })
  })

  it('rejects a raise below the minimum when it is not all-in', () => {
    const state = createActingState()
    state.currentBet = 300
    state.lastFullRaiseSize = 200
    state.seats[0] = {
      ...state.seats[0],
      committed: 100,
      totalCommitted: 100,
    }

    expect(validateActionRequest(state, 0, { type: 'raise', amount: 450 })).toEqual({
      ok: false,
      reason: 'Raise target must meet the minimum raise unless it is an all-in raise.',
    })
  })

  it('allows a short all-in raise that does not meet the full raise size', () => {
    const state = createActingState()
    state.currentBet = 300
    state.lastFullRaiseSize = 200
    state.seats[0] = {
      ...state.seats[0],
      stack: 350,
      committed: 100,
      totalCommitted: 100,
    }

    expect(validateActionRequest(state, 0, { type: 'all-in' })).toEqual({
      ok: true,
      value: {
        requestedType: 'all-in',
        resolvedType: 'raise',
        targetCommitted: 450,
        addedChips: 350,
        isAllIn: true,
        isFullRaise: false,
      },
    })
  })

  it('rejects actions from seats that are not currently allowed to act', () => {
    const state = createActingState()
    state.actingSeat = 1

    expect(validateActionRequest(state, 0, { type: 'fold' })).toEqual({
      ok: false,
      reason: 'Seat cannot act in the current state.',
    })
  })
})
