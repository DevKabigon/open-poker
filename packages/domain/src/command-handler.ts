import { validateActionRequest, type ActionRequest, type ValidatedAction } from './action-validation'
import { assertValidDomainCommand, type DomainCommand } from './commands'
import {
  type ActionAppliedEvent,
  type DomainEvent,
  type HandAwardedUncontestedEvent,
  type HandStartedEvent,
  type ShowdownSettledEvent,
  type StreetAdvancedEvent,
} from './events'
import { drawCardsForStreetTransition } from './dealing'
import { startNextHand } from './hand-bootstrap'
import { applyValidatedActionToBettingRound } from './betting-round'
import { applyDomainEvent, applyDomainEvents } from './reducer'
import { settleShowdown } from './showdown-settlement'
import { calculateSidePotsFromSeats } from './side-pot'
import { advanceToNextStreet } from './street-transition'
import { type InternalRoomState, type SeatId } from './state'

export interface DispatchDomainCommandResult {
  events: DomainEvent[]
  nextState: InternalRoomState
}

export interface DecideDomainEventsOptions {
  deferAutomaticProgression?: boolean
}

export interface DispatchDomainCommandOptions extends DecideDomainEventsOptions {}

function createTimestamp(timestamp?: string): string {
  return timestamp ?? new Date().toISOString()
}

function createHandStartedEvent(
  result: ReturnType<typeof startNextHand>,
  timestamp: string,
): HandStartedEvent {
  return {
    type: 'hand-started',
    handId: result.nextState.handId!,
    handNumber: result.nextState.handNumber,
    blindAssignments: result.blindAssignments,
    blindPostings: result.blindPostings,
    holeCardAssignments: result.holeCardAssignments,
    remainingDeck: [...result.nextState.deck],
    currentBet: result.nextState.currentBet,
    lastFullRaiseSize: result.nextState.lastFullRaiseSize,
    pendingActionSeatIds: [...result.nextState.pendingActionSeatIds],
    raiseRightsSeatIds: [...result.nextState.raiseRightsSeatIds],
    actingSeat: result.nextState.actingSeat,
    resolution: result.resolution,
    timestamp,
  }
}

function createActionAppliedEvent(
  seatId: SeatId,
  source: 'player' | 'timeout',
  action: ValidatedAction,
  transition: ReturnType<typeof applyValidatedActionToBettingRound>,
  timestamp: string,
): ActionAppliedEvent {
  return {
    type: 'action-applied',
    seatId,
    source,
    action,
    currentBet: transition.nextState.currentBet,
    lastFullRaiseSize: transition.nextState.lastFullRaiseSize,
    pendingActionSeatIds: [...transition.nextState.pendingActionSeatIds],
    raiseRightsSeatIds: [...transition.nextState.raiseRightsSeatIds],
    actingSeat: transition.nextState.actingSeat,
    resolution: transition.resolution,
    winningSeatId: transition.winningSeatId,
    timestamp,
  }
}

function createUncontestedAwardEvent(
  state: InternalRoomState,
  winnerSeatId: SeatId,
  timestamp: string,
): HandAwardedUncontestedEvent {
  const potCalculation = calculateSidePotsFromSeats(state.seats)
  const uncalledBetReturnAmount = potCalculation.uncalledBetReturn?.amount ?? 0

  if (potCalculation.uncalledBetReturn !== null && potCalculation.uncalledBetReturn.seatId !== winnerSeatId) {
    throw new Error('Uncalled bet return must belong to the uncontested winner.')
  }

  return {
    type: 'hand-awarded-uncontested',
    winnerSeatId,
    potAmount: potCalculation.totalPot,
    uncalledBetReturnAmount,
    timestamp,
  }
}

function createStreetAdvancedEvent(
  transition: ReturnType<typeof advanceToNextStreet>,
  cards: ReturnType<typeof drawCardsForStreetTransition>,
  timestamp: string,
): StreetAdvancedEvent {
  return {
    type: 'street-advanced',
    fromStreet: transition.fromStreet,
    toStreet: transition.toStreet,
    burnCard: cards.burnCard,
    boardCards: [...cards.boardCards],
    pendingActionSeatIds: [...transition.nextState.pendingActionSeatIds],
    raiseRightsSeatIds: [...transition.nextState.raiseRightsSeatIds],
    actingSeat: transition.nextState.actingSeat,
    requiresAction: transition.requiresAction,
    isTerminal: transition.isTerminal,
    timestamp,
  }
}

function createShowdownSettledEvent(
  settlement: ReturnType<typeof settleShowdown>,
  timestamp: string,
): ShowdownSettledEvent {
  return {
    type: 'showdown-settled',
    handEvaluations: settlement.handEvaluations.map((evaluation) => ({
      seatId: evaluation.seatId,
      category: evaluation.evaluatedHand.category,
      bestCards: [...evaluation.evaluatedHand.cards],
    })),
    potAwards: settlement.potAwards,
    payouts: settlement.payouts,
    uncalledBetReturn: settlement.uncalledBetReturn,
    timestamp,
  }
}

function mustValidateAction(
  state: InternalRoomState,
  seatId: SeatId,
  action: ActionRequest,
): ValidatedAction {
  const result = validateActionRequest(state, seatId, action)

  if (!result.ok) {
    throw new Error(result.reason)
  }

  return result.value
}

function resolveTimeoutAction(state: InternalRoomState, seatId: SeatId): ValidatedAction {
  const checkResult = validateActionRequest(state, seatId, { type: 'check' })

  if (checkResult.ok) {
    return checkResult.value
  }

  return mustValidateAction(state, seatId, { type: 'fold' })
}

function appendEvent(
  events: DomainEvent[],
  currentState: InternalRoomState,
  event: DomainEvent,
): InternalRoomState {
  events.push(event)
  return applyDomainEvent(currentState, event)
}

function appendAutomaticProgression(
  events: DomainEvent[],
  startingState: InternalRoomState,
  timestamp: string,
): InternalRoomState {
  let currentState = startingState

  while (true) {
    if (currentState.handStatus === 'showdown' && currentState.street === 'showdown') {
      const settlement = settleShowdown(currentState, { now: timestamp })
      currentState = appendEvent(events, currentState, createShowdownSettledEvent(settlement, timestamp))
      return currentState
    }

    if (currentState.handStatus !== 'in-hand') {
      return currentState
    }

    const draw = drawCardsForStreetTransition(currentState.deck, currentState.street)
    const transition = advanceToNextStreet(
      currentState,
      {
        burnCard: draw.burnCard,
        boardCards: draw.boardCards,
      },
      { now: timestamp },
    )

    currentState = appendEvent(events, currentState, createStreetAdvancedEvent(transition, draw, timestamp))

    if (transition.requiresAction) {
      return currentState
    }
  }
}

export function decideDomainEvents(
  state: InternalRoomState,
  command: DomainCommand,
  options: DecideDomainEventsOptions = {},
): DomainEvent[] {
  assertValidDomainCommand(command)

  const timestamp = createTimestamp(command.timestamp)
  const events: DomainEvent[] = []
  let currentState = state

  switch (command.type) {
    case 'start-hand': {
      const started = startNextHand(currentState, {
        seed: command.seed,
        handId: command.handId,
        now: timestamp,
      })

      currentState = appendEvent(events, currentState, createHandStartedEvent(started, timestamp))

      if (started.resolution === 'all-in-runout') {
        currentState = appendAutomaticProgression(events, currentState, timestamp)
      }
      break
    }

    case 'act': {
      const action = mustValidateAction(currentState, command.seatId, command.action)
      const transition = applyValidatedActionToBettingRound(currentState, command.seatId, action, { now: timestamp })

      currentState = appendEvent(
        events,
        currentState,
        createActionAppliedEvent(command.seatId, 'player', action, transition, timestamp),
      )

      if (transition.resolution === 'hand-complete') {
        currentState = appendEvent(
          events,
          currentState,
          createUncontestedAwardEvent(currentState, transition.winningSeatId!, timestamp),
        )
        break
      }

      if (
        !options.deferAutomaticProgression &&
        (transition.resolution === 'round-complete' || transition.resolution === 'all-in-runout')
      ) {
        currentState = appendAutomaticProgression(events, currentState, timestamp)
      }
      break
    }

    case 'timeout': {
      const action = resolveTimeoutAction(currentState, command.seatId)
      const transition = applyValidatedActionToBettingRound(currentState, command.seatId, action, { now: timestamp })

      currentState = appendEvent(
        events,
        currentState,
        createActionAppliedEvent(command.seatId, 'timeout', action, transition, timestamp),
      )

      if (transition.resolution === 'hand-complete') {
        currentState = appendEvent(
          events,
          currentState,
          createUncontestedAwardEvent(currentState, transition.winningSeatId!, timestamp),
        )
        break
      }

      if (
        !options.deferAutomaticProgression &&
        (transition.resolution === 'round-complete' || transition.resolution === 'all-in-runout')
      ) {
        currentState = appendAutomaticProgression(events, currentState, timestamp)
      }
      break
    }

    case 'advance-street': {
      currentState = appendAutomaticProgression(events, currentState, timestamp)
      break
    }

    case 'settle-showdown': {
      if (currentState.handStatus !== 'showdown' || currentState.street !== 'showdown') {
        throw new Error('settle-showdown command requires the table to already be at showdown.')
      }

      const settlement = settleShowdown(currentState, { now: timestamp })
      currentState = appendEvent(events, currentState, createShowdownSettledEvent(settlement, timestamp))
      break
    }
  }

  return events
}

export function dispatchDomainCommand(
  state: InternalRoomState,
  command: DomainCommand,
  options: DispatchDomainCommandOptions = {},
): DispatchDomainCommandResult {
  const events = decideDomainEvents(state, command, options)

  return {
    events,
    nextState: applyDomainEvents(state, events),
  }
}
