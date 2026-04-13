import { describe, expect, it } from 'vitest'
import {
  applyDomainEvents,
  dispatchDomainCommand,
  type ActionRequest,
  type DomainCommand,
  type DomainEvent,
  type HandAwardedUncontestedEvent,
  type InternalRoomState,
  type ShowdownSettledEvent,
} from '../src'
import { createSeatFixtureState } from './seat-fixtures'

function getTotalChips(state: InternalRoomState): number {
  return state.seats.reduce((sum, seat) => sum + seat.stack + seat.committed, 0)
}

function createTimestampFactory(): () => string {
  let second = 0

  return () => {
    const value = `2026-04-13T14:00:${String(second).padStart(2, '0')}.000Z`
    second += 1
    return value
  }
}

function getSingleEventOfType<TEvent extends DomainEvent['type']>(
  events: DomainEvent[],
  type: TEvent,
): Extract<DomainEvent, { type: TEvent }> {
  const matching = events.filter(
    (event): event is Extract<DomainEvent, { type: TEvent }> => event.type === type,
  )

  expect(matching).toHaveLength(1)
  return matching[0]!
}

function createScenarioRunner(sourceState: InternalRoomState) {
  const initialState = structuredClone(sourceState) as InternalRoomState
  let currentState = structuredClone(sourceState) as InternalRoomState
  const events: DomainEvent[] = []
  const nextTimestamp = createTimestampFactory()

  function dispatch(command: Omit<DomainCommand, 'timestamp'> & { timestamp?: string }): InternalRoomState {
    const enrichedCommand = {
      ...command,
      timestamp: command.timestamp ?? nextTimestamp(),
    } as DomainCommand

    const result = dispatchDomainCommand(currentState, enrichedCommand)
    events.push(...result.events)
    currentState = result.nextState
    return currentState
  }

  function actCurrent(action: ActionRequest): InternalRoomState {
    if (currentState.actingSeat === null) {
      throw new Error('Expected an acting seat before dispatching an action.')
    }

    return dispatch({
      type: 'act',
      seatId: currentState.actingSeat,
      action,
    })
  }

  function actCheckOrCall(): InternalRoomState {
    if (currentState.actingSeat === null) {
      throw new Error('Expected an acting seat before dispatching an action.')
    }

    const seat = currentState.seats[currentState.actingSeat]!
    const action: ActionRequest =
      currentState.currentBet > seat.committed ? { type: 'call' } : { type: 'check' }

    return actCurrent(action)
  }

  function foldCurrent(): InternalRoomState {
    return actCurrent({ type: 'fold' })
  }

  function shoveCurrent(): InternalRoomState {
    return actCurrent({ type: 'all-in' })
  }

  function expectReplayToMatchFinalState(): void {
    const replayedState = applyDomainEvents(initialState, events)
    expect(replayedState).toEqual(currentState)
  }

  return {
    initialState,
    events,
    dispatch,
    actCurrent,
    actCheckOrCall,
    foldCurrent,
    shoveCurrent,
    expectReplayToMatchFinalState,
    get state(): InternalRoomState {
      return currentState
    },
  }
}

describe('full hand scenario replay', () => {
  it('replays a preflop walk where everyone folds to the big blind', () => {
    const runner = createScenarioRunner(
      createSeatFixtureState([
        { seatId: 0, stack: 10_000 },
        { seatId: 2, stack: 10_000 },
        { seatId: 4, stack: 10_000 },
      ]),
    )
    const initialTotalChips = getTotalChips(runner.initialState)

    runner.dispatch({
      type: 'start-hand',
      seed: 'scenario-preflop-walk',
    })

    const bigBlindSeat = runner.state.bigBlindSeat

    expect(bigBlindSeat).not.toBeNull()

    runner.foldCurrent()
    runner.foldCurrent()

    const awardEvent = getSingleEventOfType(runner.events, 'hand-awarded-uncontested') as HandAwardedUncontestedEvent

    expect(runner.events.map((event) => event.type)).toEqual([
      'hand-started',
      'action-applied',
      'action-applied',
      'hand-awarded-uncontested',
    ])
    expect(awardEvent).toMatchObject({
      winnerSeatId: bigBlindSeat,
      potAmount: 100,
      uncalledBetReturnAmount: 50,
    })
    expect(runner.state.handStatus).toBe('settled')
    expect(runner.state.board).toEqual([])
    expect(runner.state.seats[bigBlindSeat!]?.stack).toBe(10_050)
    expect(getTotalChips(runner.state)).toBe(initialTotalChips)
    runner.expectReplayToMatchFinalState()
  })

  it('replays a heads-up hand from blinds through a full checkdown showdown', () => {
    const runner = createScenarioRunner(
      createSeatFixtureState([
        { seatId: 0, stack: 10_000 },
        { seatId: 3, stack: 10_000 },
      ]),
    )
    const initialTotalChips = getTotalChips(runner.initialState)

    runner.dispatch({
      type: 'start-hand',
      seed: 'scenario-heads-up-checkdown',
    })

    let safety = 0

    while (runner.state.handStatus !== 'settled') {
      runner.actCheckOrCall()
      safety += 1

      if (safety > 12) {
        throw new Error('Expected the checkdown scenario to settle within 12 player actions.')
      }
    }

    const showdownEvent = getSingleEventOfType(runner.events, 'showdown-settled') as ShowdownSettledEvent

    expect(runner.events.map((event) => event.type)).toEqual([
      'hand-started',
      'action-applied',
      'action-applied',
      'street-advanced',
      'action-applied',
      'action-applied',
      'street-advanced',
      'action-applied',
      'action-applied',
      'street-advanced',
      'action-applied',
      'action-applied',
      'street-advanced',
      'showdown-settled',
    ])
    expect(runner.state.handStatus).toBe('settled')
    expect(runner.state.street).toBe('showdown')
    expect(runner.state.board).toHaveLength(5)
    expect(showdownEvent.uncalledBetReturn).toBeNull()
    expect(showdownEvent.potAwards.reduce((sum, award) => sum + award.amount, 0)).toBe(200)
    expect(showdownEvent.payouts.reduce((sum, payout) => sum + payout.amount, 0)).toBe(200)
    expect(getTotalChips(runner.state)).toBe(initialTotalChips)
    runner.expectReplayToMatchFinalState()
  })

  it('replays a three-way preflop all-in hand with a side pot and uncalled return', () => {
    const runner = createScenarioRunner(
      createSeatFixtureState([
        { seatId: 0, stack: 1_000 },
        { seatId: 2, stack: 250 },
        { seatId: 4, stack: 600 },
      ]),
    )
    const initialTotalChips = getTotalChips(runner.initialState)

    runner.dispatch({
      type: 'start-hand',
      seed: 'scenario-three-way-all-in',
    })

    expect(runner.state.dealerSeat).toBe(0)
    expect(runner.state.smallBlindSeat).toBe(2)
    expect(runner.state.bigBlindSeat).toBe(4)

    runner.shoveCurrent()
    runner.shoveCurrent()
    runner.shoveCurrent()

    const showdownEvent = getSingleEventOfType(runner.events, 'showdown-settled') as ShowdownSettledEvent

    expect(runner.events.map((event) => event.type)).toEqual([
      'hand-started',
      'action-applied',
      'action-applied',
      'action-applied',
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'street-advanced',
      'showdown-settled',
    ])
    expect(runner.state.handStatus).toBe('settled')
    expect(runner.state.street).toBe('showdown')
    expect(runner.state.board).toHaveLength(5)
    expect(showdownEvent.potAwards.map((award) => award.amount)).toEqual([750, 700])
    expect(showdownEvent.uncalledBetReturn).toEqual({
      seatId: 0,
      amount: 400,
    })
    expect(showdownEvent.potAwards.reduce((sum, award) => sum + award.amount, 0)).toBe(1_450)
    expect(showdownEvent.payouts.reduce((sum, payout) => sum + payout.amount, 0)).toBe(1_450)
    expect(getTotalChips(runner.state)).toBe(initialTotalChips)
    runner.expectReplayToMatchFinalState()
  })
})
