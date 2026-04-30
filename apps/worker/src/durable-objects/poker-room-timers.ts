import { type InternalRoomState, type SeatId } from '@openpoker/domain'
import {
  canScheduleNextHand,
  createNextHandStartAt,
  getNextHandDelayMs,
} from './poker-room-between-hands'

export interface PokerRoomRuntimeState {
  actionDeadlineAt: string | null
  actionSeatId: SeatId | null
  actionSequence: number | null
  streetAdvanceAt: string | null
  streetAdvanceFromHandNumber: number | null
  streetAdvanceFromActionSequence: number | null
  streetAdvanceDelayMs: number | null
  nextHandStartAt: string | null
  nextHandFromHandNumber: number | null
  nextHandDelayMs: number | null
  settledHandClearAt: string | null
  settledHandClearFromHandNumber: number | null
  settledHandClearDelayMs: number | null
}

export const DEFAULT_STREET_ADVANCE_DELAY_MS = 800

export interface DerivePokerRoomRuntimeStateOptions {
  scheduleNextHand?: boolean
  settledHandJustCompleted?: boolean
}

export function createEmptyPokerRoomRuntimeState(): PokerRoomRuntimeState {
  return {
    actionDeadlineAt: null,
    actionSeatId: null,
    actionSequence: null,
    streetAdvanceAt: null,
    streetAdvanceFromHandNumber: null,
    streetAdvanceFromActionSequence: null,
    streetAdvanceDelayMs: null,
    nextHandStartAt: null,
    nextHandFromHandNumber: null,
    nextHandDelayMs: null,
    settledHandClearAt: null,
    settledHandClearFromHandNumber: null,
    settledHandClearDelayMs: null,
  }
}

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp)

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${timestamp}`)
  }

  return parsed
}

function isActionTurnActive(state: InternalRoomState): boolean {
  return (
    state.handStatus === 'in-hand' &&
    state.actingSeat !== null &&
    state.pendingActionSeatIds.includes(state.actingSeat)
  )
}

function canScheduleStreetAdvance(state: InternalRoomState): boolean {
  return (
    state.handStatus === 'in-hand' &&
    state.street !== 'idle' &&
    state.street !== 'showdown' &&
    state.actingSeat === null &&
    state.pendingActionSeatIds.length === 0 &&
    state.raiseRightsSeatIds.length === 0
  )
}

function canScheduleSettledHandClear(state: InternalRoomState): boolean {
  return state.handStatus === 'settled' && !canScheduleNextHand(state)
}

export function derivePokerRoomRuntimeState(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null = null,
  options: DerivePokerRoomRuntimeStateOptions = {},
): PokerRoomRuntimeState {
  const runtimeState = createEmptyPokerRoomRuntimeState()
  const shouldScheduleNextHand = options.scheduleNextHand ?? true

  if (isActionTurnActive(state)) {
    if (previousRuntimeState && isRuntimeDeadlineCurrent(state, previousRuntimeState)) {
      runtimeState.actionDeadlineAt = previousRuntimeState.actionDeadlineAt
      runtimeState.actionSeatId = previousRuntimeState.actionSeatId
      runtimeState.actionSequence = previousRuntimeState.actionSequence
    } else {
      runtimeState.actionDeadlineAt = new Date(parseTimestamp(now) + state.config.actionTimeoutMs).toISOString()
      runtimeState.actionSeatId = state.actingSeat
      runtimeState.actionSequence = state.actionSequence
    }
  }

  if (canScheduleStreetAdvance(state)) {
    if (previousRuntimeState && isRuntimeStreetAdvanceCurrent(state, previousRuntimeState)) {
      runtimeState.streetAdvanceAt = previousRuntimeState.streetAdvanceAt
      runtimeState.streetAdvanceFromHandNumber = previousRuntimeState.streetAdvanceFromHandNumber
      runtimeState.streetAdvanceFromActionSequence = previousRuntimeState.streetAdvanceFromActionSequence
      runtimeState.streetAdvanceDelayMs =
        previousRuntimeState.streetAdvanceDelayMs ?? DEFAULT_STREET_ADVANCE_DELAY_MS
    } else {
      runtimeState.streetAdvanceDelayMs = DEFAULT_STREET_ADVANCE_DELAY_MS
      runtimeState.streetAdvanceAt = new Date(parseTimestamp(now) + runtimeState.streetAdvanceDelayMs).toISOString()
      runtimeState.streetAdvanceFromHandNumber = state.handNumber
      runtimeState.streetAdvanceFromActionSequence = state.actionSequence
    }
  }

  if (shouldScheduleNextHand && canScheduleNextHand(state)) {
    if (previousRuntimeState && isRuntimeNextHandStartCurrent(state, previousRuntimeState)) {
      runtimeState.nextHandStartAt = previousRuntimeState.nextHandStartAt
      runtimeState.nextHandFromHandNumber = previousRuntimeState.nextHandFromHandNumber
      runtimeState.nextHandDelayMs = previousRuntimeState.nextHandDelayMs
        ?? getNextHandDelayMs(state, { settledHandJustCompleted: options.settledHandJustCompleted })
    } else {
      runtimeState.nextHandDelayMs = getNextHandDelayMs(
        state,
        { settledHandJustCompleted: options.settledHandJustCompleted },
      )
      runtimeState.nextHandStartAt = createNextHandStartAt(now, runtimeState.nextHandDelayMs)
      runtimeState.nextHandFromHandNumber = state.handNumber
    }
  }

  if (canScheduleSettledHandClear(state)) {
    if (previousRuntimeState && isRuntimeSettledHandClearCurrent(state, previousRuntimeState)) {
      runtimeState.settledHandClearAt = previousRuntimeState.settledHandClearAt
      runtimeState.settledHandClearFromHandNumber = previousRuntimeState.settledHandClearFromHandNumber
      runtimeState.settledHandClearDelayMs =
        previousRuntimeState.settledHandClearDelayMs
        ?? getNextHandDelayMs(state, { settledHandJustCompleted: true })
    } else {
      runtimeState.settledHandClearDelayMs = getNextHandDelayMs(
        state,
        { settledHandJustCompleted: true },
      )
      runtimeState.settledHandClearAt = createNextHandStartAt(now, runtimeState.settledHandClearDelayMs)
      runtimeState.settledHandClearFromHandNumber = state.handNumber
    }

    runtimeState.nextHandStartAt = runtimeState.settledHandClearAt
    runtimeState.nextHandFromHandNumber = runtimeState.settledHandClearFromHandNumber
    runtimeState.nextHandDelayMs = runtimeState.settledHandClearDelayMs
  }

  return runtimeState
}

export function isRuntimeStreetAdvanceCurrent(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
): boolean {
  return (
    canScheduleStreetAdvance(state) &&
    runtimeState.streetAdvanceAt != null &&
    runtimeState.streetAdvanceFromHandNumber != null &&
    runtimeState.streetAdvanceFromActionSequence != null &&
    runtimeState.streetAdvanceFromHandNumber === state.handNumber &&
    runtimeState.streetAdvanceFromActionSequence === state.actionSequence
  )
}

export function isRuntimeDeadlineCurrent(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
): boolean {
  return (
    isActionTurnActive(state) &&
    runtimeState.actionDeadlineAt !== null &&
    runtimeState.actionSeatId !== null &&
    runtimeState.actionSequence !== null &&
    runtimeState.actionSeatId === state.actingSeat &&
    runtimeState.actionSequence === state.actionSequence
  )
}

export function isRuntimeNextHandStartCurrent(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
): boolean {
  return (
    canScheduleNextHand(state) &&
    runtimeState.nextHandStartAt !== null &&
    runtimeState.nextHandFromHandNumber !== null &&
    runtimeState.nextHandFromHandNumber === state.handNumber
  )
}

export function isRuntimeSettledHandClearCurrent(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
): boolean {
  return (
    canScheduleSettledHandClear(state) &&
    runtimeState.settledHandClearAt !== null &&
    runtimeState.settledHandClearFromHandNumber !== null &&
    runtimeState.settledHandClearFromHandNumber === state.handNumber
  )
}

export function getTimedOutSeatId(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
  now: string,
): SeatId | null {
  if (!isRuntimeDeadlineCurrent(state, runtimeState)) {
    return null
  }

  return parseTimestamp(now) >= parseTimestamp(runtimeState.actionDeadlineAt!) ? runtimeState.actionSeatId : null
}

export function shouldAdvanceStreet(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
  now: string,
): boolean {
  if (!isRuntimeStreetAdvanceCurrent(state, runtimeState)) {
    return false
  }

  return parseTimestamp(now) >= parseTimestamp(runtimeState.streetAdvanceAt!)
}

export function shouldAutoStartNextHand(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
  now: string,
): boolean {
  if (!isRuntimeNextHandStartCurrent(state, runtimeState)) {
    return false
  }

  return parseTimestamp(now) >= parseTimestamp(runtimeState.nextHandStartAt!)
}

export function shouldClearSettledHand(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
  now: string,
): boolean {
  if (!isRuntimeSettledHandClearCurrent(state, runtimeState)) {
    return false
  }

  return parseTimestamp(now) >= parseTimestamp(runtimeState.settledHandClearAt!)
}

export function getNextRuntimeAlarmAt(runtimeState: PokerRoomRuntimeState): string | null {
  const alarmTimestamps = [
    runtimeState.actionDeadlineAt,
    runtimeState.streetAdvanceAt,
    runtimeState.nextHandStartAt,
    runtimeState.settledHandClearAt,
  ].filter((timestamp): timestamp is string => timestamp != null)

  if (alarmTimestamps.length === 0) {
    return null
  }

  return alarmTimestamps.reduce((earliest, timestamp) =>
    parseTimestamp(timestamp) < parseTimestamp(earliest) ? timestamp : earliest,
  )
}
