import { describe, expect, it } from 'vitest'
import {
  applyValidatedActionToBettingRound,
  validateActionRequest,
  type ActionRequest,
  type InternalRoomState,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function mustValidate(state: InternalRoomState, seatId: number, action: ActionRequest) {
  const result = validateActionRequest(state, seatId, action)

  expect(result).toEqual(expect.objectContaining({ ok: true }))

  if (!result.ok) {
    throw new Error(result.reason)
  }

  return result.value
}

function createRoundState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 10_000 },
    { seatId: 1, stack: 10_000 },
    { seatId: 2, stack: 10_000 },
  ])

  state.handStatus = 'in-hand'
  state.handId = 'hand-1'
  state.handNumber = 1
  state.street = 'preflop'
  state.pendingActionSeatIds = [0, 1, 2]
  state.raiseRightsSeatIds = [0, 1, 2]
  state.actingSeat = 0

  return state
}

describe('betting round transitions', () => {
  it('completes the round after all remaining players check', () => {
    const state = createRoundState()

    const first = applyValidatedActionToBettingRound(state, 0, mustValidate(state, 0, { type: 'check' }))
    expect(first.resolution).toBe('needs-action')
    expect(first.nextState.actingSeat).toBe(1)
    expect(first.nextState.pendingActionSeatIds).toEqual([1, 2])
    expect(first.nextState.raiseRightsSeatIds).toEqual([1, 2])

    const second = applyValidatedActionToBettingRound(
      first.nextState,
      1,
      mustValidate(first.nextState, 1, { type: 'check' }),
    )

    const third = applyValidatedActionToBettingRound(
      second.nextState,
      2,
      mustValidate(second.nextState, 2, { type: 'check' }),
    )

    expect(third.resolution).toBe('round-complete')
    expect(third.nextState.actingSeat).toBeNull()
    expect(third.nextState.pendingActionSeatIds).toEqual([])
    expect(third.nextState.raiseRightsSeatIds).toEqual([])
  })

  it('resets pending action and raise rights after a full raise', () => {
    const state = createRoundState()
    state.currentBet = 100
    state.lastFullRaiseSize = 100
    state.seats[2] = {
      ...state.seats[2],
      committed: 100,
      totalCommitted: 100,
    }

    const validatedRaise = mustValidate(state, 0, { type: 'raise', amount: 300 })
    const transition = applyValidatedActionToBettingRound(state, 0, validatedRaise)

    expect(transition.resolution).toBe('needs-action')
    expect(transition.nextState.currentBet).toBe(300)
    expect(transition.nextState.lastFullRaiseSize).toBe(200)
    expect(transition.nextState.pendingActionSeatIds).toEqual([1, 2])
    expect(transition.nextState.raiseRightsSeatIds).toEqual([1, 2])
    expect(transition.nextState.actingSeat).toBe(1)
  })

  it('does not reopen raising to players who already acted when a short all-in raise occurs', () => {
    const state = createRoundState()
    state.currentBet = 300
    state.lastFullRaiseSize = 200
    state.pendingActionSeatIds = [1, 2]
    state.raiseRightsSeatIds = [1, 2]
    state.actingSeat = 1
    state.seats[0] = {
      ...state.seats[0],
      committed: 300,
      totalCommitted: 300,
    }
    state.seats[1] = {
      ...state.seats[1],
      committed: 100,
      totalCommitted: 100,
      stack: 350,
    }

    const validatedAllIn = mustValidate(state, 1, { type: 'all-in' })
    const transition = applyValidatedActionToBettingRound(state, 1, validatedAllIn)

    expect(transition.resolution).toBe('needs-action')
    expect(transition.nextState.currentBet).toBe(450)
    expect(transition.nextState.pendingActionSeatIds).toEqual([2, 0])
    expect(transition.nextState.raiseRightsSeatIds).toEqual([2])
    expect(transition.nextState.actingSeat).toBe(2)
  })

  it('ends the hand immediately when only one contesting seat remains', () => {
    const state = createRoundState()
    state.currentBet = 100
    state.lastFullRaiseSize = 100
    state.pendingActionSeatIds = [0]
    state.raiseRightsSeatIds = [0]
    state.seats[1] = {
      ...state.seats[1],
      hasFolded: true,
      stack: 10_000,
    }
    state.seats[2] = {
      ...state.seats[2],
      committed: 100,
      totalCommitted: 100,
    }

    const validatedFold = mustValidate(state, 0, { type: 'fold' })
    const transition = applyValidatedActionToBettingRound(state, 0, validatedFold)

    expect(transition.resolution).toBe('hand-complete')
    expect(transition.winningSeatId).toBe(2)
    expect(transition.nextState.actingSeat).toBeNull()
  })

  it('ends a 6-max hand only after five players have folded', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000, hasFolded: true },
      { seatId: 1, stack: 10_000, hasFolded: true },
      { seatId: 2, stack: 10_000, hasFolded: true },
      { seatId: 3, stack: 10_000, hasFolded: true },
      { seatId: 4, stack: 10_000 },
      { seatId: 5, stack: 10_000, committed: 100, totalCommitted: 100 },
    ])
    state.handStatus = 'in-hand'
    state.handId = 'hand-6max-foldout'
    state.handNumber = 1
    state.street = 'preflop'
    state.currentBet = 100
    state.lastFullRaiseSize = 100
    state.pendingActionSeatIds = [4]
    state.raiseRightsSeatIds = [4]
    state.actingSeat = 4

    const validatedFold = mustValidate(state, 4, { type: 'fold' })
    const transition = applyValidatedActionToBettingRound(state, 4, validatedFold)

    expect(transition.resolution).toBe('hand-complete')
    expect(transition.winningSeatId).toBe(5)
    expect(transition.nextState.seats.filter((seat) => seat.playerId !== null && !seat.hasFolded)).toHaveLength(1)
  })

  it('switches to all-in runout when no contesting seat can act anymore', () => {
    const state = createRoundState()
    state.currentBet = 500
    state.lastFullRaiseSize = 300
    state.pendingActionSeatIds = [0]
    state.raiseRightsSeatIds = []
    state.actingSeat = 0
    state.seats[0] = {
      ...state.seats[0],
      committed: 300,
      totalCommitted: 300,
      stack: 200,
    }
    state.seats[1] = {
      ...state.seats[1],
      committed: 500,
      totalCommitted: 500,
      stack: 0,
      isAllIn: true,
    }
    state.seats[2] = {
      ...state.seats[2],
      hasFolded: true,
    }

    const validatedCall = mustValidate(state, 0, { type: 'call' })
    const transition = applyValidatedActionToBettingRound(state, 0, validatedCall)

    expect(transition.resolution).toBe('all-in-runout')
    expect(transition.nextState.actingSeat).toBeNull()
    expect(transition.nextState.pendingActionSeatIds).toEqual([])
  })
})
