import { describe, expect, it } from 'vitest'
import {
  advanceToNextStreet,
  applyDomainEvent,
  applyDomainEvents,
  applyValidatedActionToBettingRound,
  settleShowdown,
  startNextHand,
  validateActionRequest,
  type ActionAppliedEvent,
  type HandStartedEvent,
  type InternalRoomState,
  type ShowdownSettledEvent,
  type StreetAdvancedEvent,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function toHandStartedEvent(
  state: ReturnType<typeof startNextHand>,
  timestamp: string,
): HandStartedEvent {
  return {
    type: 'hand-started',
    handId: state.nextState.handId!,
    handNumber: state.nextState.handNumber,
    blindAssignments: state.blindAssignments,
    blindPostings: state.blindPostings,
    holeCardAssignments: state.holeCardAssignments,
    remainingDeck: state.nextState.deck,
    currentBet: state.nextState.currentBet,
    lastFullRaiseSize: state.nextState.lastFullRaiseSize,
    pendingActionSeatIds: state.nextState.pendingActionSeatIds,
    raiseRightsSeatIds: state.nextState.raiseRightsSeatIds,
    actingSeat: state.nextState.actingSeat,
    resolution: state.resolution,
    timestamp,
  }
}

function toActionAppliedEvent(
  seatId: number,
  source: 'player' | 'timeout',
  actionTransition: ReturnType<typeof applyValidatedActionToBettingRound>,
  action: Exclude<ReturnType<typeof validateActionRequest>, { ok: false }>['value'],
  timestamp: string,
): ActionAppliedEvent {
  return {
    type: 'action-applied',
    seatId,
    source,
    action,
    currentBet: actionTransition.nextState.currentBet,
    lastFullRaiseSize: actionTransition.nextState.lastFullRaiseSize,
    pendingActionSeatIds: actionTransition.nextState.pendingActionSeatIds,
    raiseRightsSeatIds: actionTransition.nextState.raiseRightsSeatIds,
    actingSeat: actionTransition.nextState.actingSeat,
    resolution: actionTransition.resolution,
    winningSeatId: actionTransition.winningSeatId,
    timestamp,
  }
}

function toStreetAdvancedEvent(
  result: ReturnType<typeof advanceToNextStreet>,
  burnCard: StreetAdvancedEvent['burnCard'],
  boardCards: StreetAdvancedEvent['boardCards'],
  timestamp: string,
): StreetAdvancedEvent {
  return {
    type: 'street-advanced',
    fromStreet: result.fromStreet,
    toStreet: result.toStreet,
    burnCard,
    boardCards,
    pendingActionSeatIds: result.nextState.pendingActionSeatIds,
    raiseRightsSeatIds: result.nextState.raiseRightsSeatIds,
    actingSeat: result.nextState.actingSeat,
    requiresAction: result.requiresAction,
    isTerminal: result.isTerminal,
    timestamp,
  }
}

function toShowdownSettledEvent(
  result: ReturnType<typeof settleShowdown>,
  timestamp: string,
): ShowdownSettledEvent {
  return {
    type: 'showdown-settled',
    handEvaluations: result.handEvaluations.map((evaluation) => ({
      seatId: evaluation.seatId,
      category: evaluation.evaluatedHand.category,
      bestCards: [...evaluation.evaluatedHand.cards],
    })),
    potAwards: result.potAwards,
    payouts: result.payouts,
    uncalledBetReturn: result.uncalledBetReturn,
    timestamp,
  }
}

function mustValidateAction(
  state: InternalRoomState,
  seatId: number,
  action: Parameters<typeof validateActionRequest>[2],
) {
  const result = validateActionRequest(state, seatId, action)

  expect(result).toEqual(expect.objectContaining({ ok: true }))

  if (!result.ok) {
    throw new Error(result.reason)
  }

  return result.value
}

function createShowdownState(): InternalRoomState {
  const state = createSeatFixtureState([
    { seatId: 0, stack: 9_800, totalCommitted: 200 },
    { seatId: 1, stack: 9_800, totalCommitted: 200 },
    { seatId: 2, stack: 9_800, totalCommitted: 200 },
  ])

  state.handId = 'hand-showdown'
  state.handNumber = 1
  state.handStatus = 'showdown'
  state.street = 'showdown'
  state.dealerSeat = 0
  state.smallBlindSeat = 1
  state.bigBlindSeat = 2
  state.board = ['2c', '7d', '9h', 'Jc', 'Qd']
  state.currentBet = 0
  state.pendingActionSeatIds = []
  state.raiseRightsSeatIds = []
  state.actingSeat = null
  state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
  state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Kh'] }
  state.seats[2] = { ...state.seats[2], holeCards: ['3s', '3h'] }

  return state
}

describe('event reducer', () => {
  it('replays a hand-started event into the same state as hand bootstrap', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const started = startNextHand(state, {
      seed: 'reducer-start',
      now: '2026-04-13T11:00:00.000Z',
    })
    const event = toHandStartedEvent(started, '2026-04-13T11:00:00.000Z')

    expect(applyDomainEvent(state, event)).toEqual(started.nextState)
  })

  it('replays an action-applied event into the same state as betting transition logic', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const started = startNextHand(state, {
      seed: 'reducer-action',
      now: '2026-04-13T11:10:00.000Z',
    })
    const action = mustValidateAction(started.nextState, 0, { type: 'call' })
    const transition = applyValidatedActionToBettingRound(started.nextState, 0, action, {
      now: '2026-04-13T11:11:00.000Z',
    })
    const event = toActionAppliedEvent(0, 'player', transition, action, '2026-04-13T11:11:00.000Z')

    expect(applyDomainEvent(started.nextState, event)).toEqual(transition.nextState)
  })

  it('replays a street-advanced event into the same state as street transition logic', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 1, stack: 10_000 },
      { seatId: 3, stack: 10_000 },
    ])

    state.handId = 'hand-street'
    state.handNumber = 1
    state.handStatus = 'in-hand'
    state.street = 'preflop'
    state.dealerSeat = 0
    state.smallBlindSeat = 1
    state.bigBlindSeat = 3
    state.pendingActionSeatIds = []
    state.raiseRightsSeatIds = []
    state.actingSeat = null
    state.deck = ['Ad', '2c', '7d', 'Jh', 'Qs']
    state.seats[0] = { ...state.seats[0], holeCards: ['As', 'Ah'] }
    state.seats[1] = { ...state.seats[1], holeCards: ['Ks', 'Kh'] }
    state.seats[3] = { ...state.seats[3], holeCards: ['Qc', 'Qd'] }

    const advanced = advanceToNextStreet(
      state,
      {
        burnCard: 'Ad',
        boardCards: ['2c', '7d', 'Jh'],
      },
      { now: '2026-04-13T11:20:00.000Z' },
    )
    const event = toStreetAdvancedEvent(advanced, 'Ad', ['2c', '7d', 'Jh'], '2026-04-13T11:20:00.000Z')

    expect(applyDomainEvent(state, event)).toEqual(advanced.nextState)
  })

  it('replays a showdown-settled event into the same state as showdown settlement logic', () => {
    const state = createShowdownState()
    const settled = settleShowdown(state, {
      now: '2026-04-13T11:30:00.000Z',
    })
    const event = toShowdownSettledEvent(settled, '2026-04-13T11:30:00.000Z')

    expect(applyDomainEvent(state, event)).toEqual(settled.nextState)
  })

  it('applies multiple events sequentially and preserves deterministic replay', () => {
    const baseState = createSeatFixtureState([
      { seatId: 0, stack: 10_000 },
      { seatId: 2, stack: 10_000 },
      { seatId: 4, stack: 10_000 },
    ])

    const started = startNextHand(baseState, {
      seed: 'reducer-sequence',
      now: '2026-04-13T11:40:00.000Z',
    })
    const handStartedEvent = toHandStartedEvent(started, '2026-04-13T11:40:00.000Z')

    const action = mustValidateAction(started.nextState, 0, { type: 'call' })
    const actionTransition = applyValidatedActionToBettingRound(started.nextState, 0, action, {
      now: '2026-04-13T11:41:00.000Z',
    })
    const actionEvent = toActionAppliedEvent(0, 'player', actionTransition, action, '2026-04-13T11:41:00.000Z')

    expect(applyDomainEvents(baseState, [handStartedEvent, actionEvent])).toEqual(actionTransition.nextState)
  })

  it('settles an uncontested hand from an explicit fact event', () => {
    const state = createSeatFixtureState([
      { seatId: 0, stack: 9_600, totalCommitted: 400 },
      { seatId: 1, stack: 9_700, totalCommitted: 300, hasFolded: true },
    ])

    state.handId = 'hand-uncontested'
    state.handNumber = 1
    state.handStatus = 'in-hand'
    state.street = 'turn'
    state.board = ['As', 'Kd', 'Qc', 'Jh']
    state.actingSeat = null
    state.pendingActionSeatIds = []
    state.raiseRightsSeatIds = []
    state.currentBet = 400

    const nextState = applyDomainEvent(state, {
      type: 'hand-awarded-uncontested',
      winnerSeatId: 0,
      potAmount: 600,
      uncalledBetReturnAmount: 100,
      timestamp: '2026-04-13T11:50:00.000Z',
    })

    expect(nextState.handStatus).toBe('settled')
    expect(nextState.seats[0]?.stack).toBe(10_300)
    expect(nextState.seats[1]?.stack).toBe(9_700)
    expect(nextState.currentBet).toBe(0)
    expect(nextState.pendingActionSeatIds).toEqual([])
    expect(nextState.showdownSummary).toMatchObject({
      handId: 'hand-uncontested',
      handNumber: 1,
      handEvaluations: [],
      potAwards: [
        {
          potIndex: 0,
          amount: 600,
          eligibleSeatIds: [0],
          winnerSeatIds: [0],
          shares: [{ seatId: 0, amount: 600 }],
        },
      ],
      payouts: [{ seatId: 0, amount: 600 }],
      uncalledBetReturn: {
        seatId: 0,
        amount: 100,
      },
    })
  })
})
