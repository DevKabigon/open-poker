import { type InternalRoomState, type SeatId } from '@openpoker/domain'

export interface PokerRoomRuntimeState {
  actionDeadlineAt: string | null
  actionSeatId: SeatId | null
  actionSequence: number | null
}

export function createEmptyPokerRoomRuntimeState(): PokerRoomRuntimeState {
  return {
    actionDeadlineAt: null,
    actionSeatId: null,
    actionSequence: null,
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
  if (!isActionTurnActive(state)) {
    return createEmptyPokerRoomRuntimeState()
  }

  const deadlineAt = new Date(parseTimestamp(now) + state.config.actionTimeoutMs).toISOString()

  return {
    actionDeadlineAt: deadlineAt,
    actionSeatId: state.actingSeat,
    actionSequence: state.actionSequence,
  }
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
