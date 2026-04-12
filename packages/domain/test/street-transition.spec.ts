import { describe, expect, it } from 'vitest'
import { advanceToNextStreet, getStreetTransitionPlan, type InternalRoomState } from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createStreetState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 10_000 },
    { seatId: 1, stack: 10_000 },
    { seatId: 2, stack: 10_000 },
  ])

  state.handStatus = 'in-hand'
  state.handId = 'hand-1'
  state.handNumber = 1
  state.dealerSeat = 0
  state.smallBlindSeat = 1
  state.bigBlindSeat = 2

  return state
}

describe('street transition', () => {
  it('describes how many cards each street transition should consume', () => {
    expect(getStreetTransitionPlan('preflop')).toEqual({
      fromStreet: 'preflop',
      toStreet: 'flop',
      burnCount: 1,
      boardCardCount: 3,
    })
    expect(getStreetTransitionPlan('turn')).toEqual({
      fromStreet: 'turn',
      toStreet: 'river',
      burnCount: 1,
      boardCardCount: 1,
    })
    expect(getStreetTransitionPlan('showdown')).toBeNull()
  })

  it('advances from preflop to flop and resets betting state for the next round', () => {
    const state = createStreetState()
    state.street = 'preflop'
    state.currentBet = 300
    state.lastFullRaiseSize = 200
    state.pendingActionSeatIds = [0, 1, 2]
    state.raiseRightsSeatIds = [0, 1, 2]
    state.actingSeat = 0
    state.seats[0] = { ...state.seats[0], committed: 300, totalCommitted: 300, actedThisStreet: true }
    state.seats[1] = { ...state.seats[1], committed: 300, totalCommitted: 300, actedThisStreet: true }
    state.seats[2] = { ...state.seats[2], committed: 300, totalCommitted: 300, actedThisStreet: true }
    state.deck = ['Xx', '2c', '7d', 'Jh', 'Qs']

    const result = advanceToNextStreet(
      state,
      {
        burnCard: '2c',
        boardCards: ['7d', 'Jh', 'Qs'],
      },
      { now: '2026-04-13T02:00:00.000Z' },
    )

    expect(result.fromStreet).toBe('preflop')
    expect(result.toStreet).toBe('flop')
    expect(result.requiresAction).toBe(true)
    expect(result.isTerminal).toBe(false)
    expect(result.nextState.street).toBe('flop')
    expect(result.nextState.board).toEqual(['7d', 'Jh', 'Qs'])
    expect(result.nextState.burnCards).toEqual(['2c'])
    expect(result.nextState.deck).toEqual(['Xx'])
    expect(result.nextState.currentBet).toBe(0)
    expect(result.nextState.lastFullRaiseSize).toBe(state.config.bigBlind)
    expect(result.nextState.pendingActionSeatIds).toEqual([1, 2, 0])
    expect(result.nextState.raiseRightsSeatIds).toEqual([1, 2, 0])
    expect(result.nextState.actingSeat).toBe(1)
    expect(
      result.nextState.seats
        .filter((seat) => seat.playerId !== null)
        .map((seat) => seat.committed),
    ).toEqual([0, 0, 0])
    expect(
      result.nextState.seats
        .filter((seat) => seat.playerId !== null)
        .map((seat) => seat.actedThisStreet),
    ).toEqual([false, false, false])
    expect(result.nextState.updatedAt).toBe('2026-04-13T02:00:00.000Z')
  })

  it('advances from flop to turn by appending one board card', () => {
    const state = createStreetState()
    state.street = 'flop'
    state.board = ['7d', 'Jh', 'Qs']
    state.burnCards = ['2c']
    state.currentBet = 500
    state.lastFullRaiseSize = 300
    state.pendingActionSeatIds = [1, 2, 0]
    state.raiseRightsSeatIds = [1, 2, 0]
    state.actingSeat = 1
    state.seats[0] = { ...state.seats[0], committed: 500, totalCommitted: 800, actedThisStreet: true }
    state.seats[1] = { ...state.seats[1], committed: 500, totalCommitted: 800, actedThisStreet: true }
    state.seats[2] = { ...state.seats[2], committed: 500, totalCommitted: 800, actedThisStreet: true }

    const result = advanceToNextStreet(state, {
      burnCard: '4h',
      boardCards: ['Ac'],
    })

    expect(result.toStreet).toBe('turn')
    expect(result.nextState.board).toEqual(['7d', 'Jh', 'Qs', 'Ac'])
    expect(result.nextState.burnCards).toEqual(['2c', '4h'])
    expect(result.nextState.pendingActionSeatIds).toEqual([1, 2, 0])
    expect(result.nextState.actingSeat).toBe(1)
    expect(result.nextState.currentBet).toBe(0)
  })

  it('moves from river to showdown without consuming any more cards', () => {
    const state = createStreetState()
    state.street = 'river'
    state.board = ['7d', 'Jh', 'Qs', 'Ac', '9s']
    state.burnCards = ['2c', '4h', '5d']
    state.currentBet = 0
    state.pendingActionSeatIds = []
    state.raiseRightsSeatIds = []
    state.actingSeat = null

    const result = advanceToNextStreet(state)

    expect(result.toStreet).toBe('showdown')
    expect(result.requiresAction).toBe(false)
    expect(result.isTerminal).toBe(true)
    expect(result.nextState.handStatus).toBe('showdown')
    expect(result.nextState.street).toBe('showdown')
    expect(result.nextState.board).toEqual(['7d', 'Jh', 'Qs', 'Ac', '9s'])
    expect(result.nextState.pendingActionSeatIds).toEqual([])
    expect(result.nextState.actingSeat).toBeNull()
  })

  it('keeps acting state empty while running out streets after all players are all-in', () => {
    const state = createStreetState()
    state.street = 'flop'
    state.board = ['7d', 'Jh', 'Qs']
    state.burnCards = ['2c']
    state.pendingActionSeatIds = []
    state.raiseRightsSeatIds = []
    state.actingSeat = null
    state.seats[0] = { ...state.seats[0], isAllIn: true, stack: 0, totalCommitted: 1_000 }
    state.seats[1] = { ...state.seats[1], isAllIn: true, stack: 0, totalCommitted: 1_000 }
    state.seats[2] = { ...state.seats[2], hasFolded: true }

    const turn = advanceToNextStreet(state, {
      burnCard: '4h',
      boardCards: ['Ac'],
    })

    expect(turn.toStreet).toBe('turn')
    expect(turn.requiresAction).toBe(false)
    expect(turn.nextState.pendingActionSeatIds).toEqual([])
    expect(turn.nextState.raiseRightsSeatIds).toEqual([])
    expect(turn.nextState.actingSeat).toBeNull()

    const river = advanceToNextStreet(turn.nextState, {
      burnCard: '5d',
      boardCards: ['9s'],
    })

    expect(river.toStreet).toBe('river')
    expect(river.requiresAction).toBe(false)
    expect(river.nextState.actingSeat).toBeNull()
  })
})
