import { type InternalRoomState, type SeatId } from '@openpoker/domain'
import { canScheduleNextHand, createNextHandStartAt } from './poker-room-between-hands'

export interface PokerRoomRuntimeState {
  actionDeadlineAt: string | null
  actionSeatId: SeatId | null
  actionSequence: number | null
  nextHandStartAt: string | null
  nextHandFromHandNumber: number | null
}

export function createEmptyPokerRoomRuntimeState(): PokerRoomRuntimeState {
  return {
    actionDeadlineAt: null,
    actionSeatId: null,
    actionSequence: null,
    nextHandStartAt: null,
    nextHandFromHandNumber: null,
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

export function derivePokerRoomRuntimeState(
  state: InternalRoomState,
  now: string,
): PokerRoomRuntimeState {
  const runtimeState = createEmptyPokerRoomRuntimeState()

  if (isActionTurnActive(state)) {
    runtimeState.actionDeadlineAt = new Date(parseTimestamp(now) + state.config.actionTimeoutMs).toISOString()
    runtimeState.actionSeatId = state.actingSeat
    runtimeState.actionSequence = state.actionSequence
  }

  if (canScheduleNextHand(state)) {
    runtimeState.nextHandStartAt = createNextHandStartAt(now)
    runtimeState.nextHandFromHandNumber = state.handNumber
  }

  return runtimeState
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

export function getNextRuntimeAlarmAt(runtimeState: PokerRoomRuntimeState): string | null {
  if (runtimeState.actionDeadlineAt !== null && runtimeState.nextHandStartAt !== null) {
    return parseTimestamp(runtimeState.actionDeadlineAt) <= parseTimestamp(runtimeState.nextHandStartAt)
      ? runtimeState.actionDeadlineAt
      : runtimeState.nextHandStartAt
  }

  return runtimeState.actionDeadlineAt ?? runtimeState.nextHandStartAt
}
