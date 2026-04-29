import { describe, expect, it } from 'vitest'
import { decideDomainEvents, dispatchDomainCommand, type InternalRoomState } from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function createRiverCheckState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 9_800, totalCommitted: 200 },
    { seatId: 1, stack: 9_800, totalCommitted: 200 },
  ])

  state.handId = 'river-hand'
  state.handNumber = 3
  state.handStatus = 'in-hand'
  state.street = 'river'
  state.dealerSeat = 1
  state.smallBlindSeat = 0
  state.bigBlindSeat = 1
  state.board = ['2c', '7d', '9h', 'Jc', 'Qd']
  state.currentBet = 0
  state.lastFullRaiseSize = 100
  state.pendingActionSeatIds = [0]
  state.raiseRightsSeatIds = [0]
  state.actingSeat = 0
  state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
  state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Kh'] }

  return state
}

describe('command handler', () => {
  it('dispatches start-hand to a single hand-started event when action is needed', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const result = dispatchDomainCommand(state, {
      type: 'start-hand',
      seed: 'dispatch-start',
      timestamp: '2026-04-13T12:00:00.000Z',
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.type).toBe('hand-started')
    expect(result.nextState.handStatus).toBe('in-hand')
    expect(result.nextState.street).toBe('preflop')
    expect(result.nextState.pendingActionSeatIds.length).toBeGreaterThan(0)
  })

  it('auto-runs a hand from start-hand when blinds put everyone all-in', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 50 },
      { seatId: 3, stack: 80 },
    ])

    const result = dispatchDomainCommand(state, {
      type: 'start-hand',
      seed: 'dispatch-all-in',
      timestamp: '2026-04-13T12:05:00.000Z',
    })

    expect(result.events.map((event) => event.type)).toEqual([
      'hand-started',
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'showdown-settled',
    ])
    expect(result.nextState.handStatus).toBe('settled')
    expect(result.nextState.street).toBe('showdown')
  })

  it('dispatches a normal act command without chaining when action remains', () => {
    const baseState = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const started = dispatchDomainCommand(baseState, {
      type: 'start-hand',
      seed: 'dispatch-act',
      timestamp: '2026-04-13T12:10:00.000Z',
    }).nextState

    const result = dispatchDomainCommand(started, {
      type: 'act',
      seatId: started.actingSeat!,
      action: { type: 'call' },
      timestamp: '2026-04-13T12:11:00.000Z',
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.type).toBe('action-applied')
    expect(result.nextState.handStatus).toBe('in-hand')
    expect(result.nextState.street).toBe('preflop')
  })

  it('auto-advances from a river check into showdown settlement', () => {
    const state = createRiverCheckState()

    const result = dispatchDomainCommand(state, {
      type: 'act',
      seatId: 0,
      action: { type: 'check' },
      timestamp: '2026-04-13T12:20:00.000Z',
    })

    expect(result.events.map((event) => event.type)).toEqual([
      'action-applied',
      'street-advanced',
      'showdown-settled',
    ])
    expect(result.nextState.handStatus).toBe('settled')
    expect(result.nextState.street).toBe('showdown')
  })

  it('timeout auto-checks when checking is legal', () => {
    const state = createRiverCheckState()

    const events = decideDomainEvents(state, {
      type: 'timeout',
      seatId: 0,
      timestamp: '2026-04-13T12:30:00.000Z',
    })

    expect(events[0]).toMatchObject({
      type: 'action-applied',
      source: 'timeout',
      action: {
        requestedType: 'check',
        resolvedType: 'check',
      },
    })
  })

  it('timeout auto-checks the big blind when preflop action returns unopened', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 9_900, committed: 100, totalCommitted: 100 },
      { seatId: 1, stack: 9_800, committed: 200, totalCommitted: 200 },
    ])

    state.handId = 'preflop-big-blind-check'
    state.handNumber = 4
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.dealerSeat = 0
    state.smallBlindSeat = 0
    state.bigBlindSeat = 1
    state.currentBet = 200
    state.lastFullRaiseSize = 200
    state.pendingActionSeatIds = [1]
    state.raiseRightsSeatIds = [1]
    state.actingSeat = 1
    state.seats[0] = { ...state.seats[0], holeCards: ['As', '4h'] }
    state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Qh'] }
    state.deck = ['2c', '7d', '9h', 'Jc', 'Qd']

    const events = decideDomainEvents(state, {
      type: 'timeout',
      seatId: 1,
      timestamp: '2026-04-13T12:35:00.000Z',
    })

    expect(events[0]).toMatchObject({
      type: 'action-applied',
      source: 'timeout',
      action: {
        requestedType: 'check',
        resolvedType: 'check',
      },
    })
  })

  it('accepts a big blind option raise after the small blind completes', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 9_800, committed: 200, totalCommitted: 200 },
      { seatId: 1, stack: 9_800, committed: 200, totalCommitted: 200 },
    ])

    state.handId = 'preflop-big-blind-option-raise'
    state.handNumber = 4
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.dealerSeat = 0
    state.smallBlindSeat = 0
    state.bigBlindSeat = 1
    state.currentBet = 200
    state.lastFullRaiseSize = 200
    state.pendingActionSeatIds = [1]
    state.raiseRightsSeatIds = [1]
    state.actingSeat = 1
    state.seats[0] = { ...state.seats[0], holeCards: ['As', '4h'] }
    state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Qh'] }

    const result = dispatchDomainCommand(state, {
      type: 'act',
      seatId: 1,
      action: { type: 'raise', amount: 400 },
      timestamp: '2026-04-13T12:37:00.000Z',
    })

    expect(result.events[0]).toMatchObject({
      type: 'action-applied',
      action: {
        requestedType: 'raise',
        resolvedType: 'raise',
        targetCommitted: 400,
        addedChips: 200,
      },
    })
    expect(result.nextState.currentBet).toBe(400)
    expect(result.nextState.pendingActionSeatIds).toEqual([0])
    expect(result.nextState.actingSeat).toBe(0)
  })

  it('timeout auto-folds when checking is not legal and can end the hand uncontested', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 9_700, committed: 300, totalCommitted: 300 },
      { seatId: 1, stack: 9_600, committed: 400, totalCommitted: 400 },
    ])

    state.handId = 'timeout-fold'
    state.handNumber = 4
    state.handStatus = 'in-hand'
    state.street = 'turn'
    state.board = ['As', 'Kd', 'Qc', 'Jh']
    state.dealerSeat = 0
    state.currentBet = 400
    state.lastFullRaiseSize = 100
    state.pendingActionSeatIds = [0]
    state.raiseRightsSeatIds = []
    state.actingSeat = 0
    state.seats[0] = { ...state.seats[0], holeCards: ['2c', '2d'] }
    state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Kh'] }

    const result = dispatchDomainCommand(state, {
      type: 'timeout',
      seatId: 0,
      timestamp: '2026-04-13T12:40:00.000Z',
    })

    expect(result.events.map((event) => event.type)).toEqual([
      'action-applied',
      'hand-awarded-uncontested',
    ])
    expect(result.nextState.handStatus).toBe('settled')
    expect(result.nextState.seats[1]?.stack).toBeGreaterThan(9_600)
  })

  it('advance-street command can continue an all-in runout to showdown', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 0, totalCommitted: 50, isAllIn: true },
      { seatId: 3, stack: 0, totalCommitted: 80, isAllIn: true },
    ])

    state.handId = 'runout-hand'
    state.handNumber = 5
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.dealerSeat = 0
    state.smallBlindSeat = 0
    state.bigBlindSeat = 3
    state.currentBet = 80
    state.lastFullRaiseSize = 100
    state.pendingActionSeatIds = []
    state.raiseRightsSeatIds = []
    state.actingSeat = null
    state.deck = ['Ad', '2c', '7d', 'Jh', 'Qs', '9c', 'Td', '8h']
    state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
    state.seats[3] = { ...state.seats[3], holeCards: ['Ks', 'Kh'] }

    const result = dispatchDomainCommand(state, {
      type: 'advance-street',
      timestamp: '2026-04-13T12:50:00.000Z',
    })

    expect(result.events.map((event) => event.type)).toEqual([
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'showdown-settled',
    ])
    expect(result.nextState.handStatus).toBe('settled')
  })
})
