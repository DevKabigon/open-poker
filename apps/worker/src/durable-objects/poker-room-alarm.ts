import {
  dispatchDomainCommand,
  type DispatchDomainCommandResult,
  type InternalRoomState,
  type SeatId,
} from '@openpoker/domain'
import { maybeAutoStartHand } from './poker-room-auto-start'
import { clearSettledHandForWaiting } from './poker-room-between-hands'
import { applyDisconnectGraceExpirations } from './poker-room-disconnect'
import {
  getExpiredDisconnectedSeatIds,
  getTimedOutSeatId,
  shouldAdvanceStreet,
  shouldAutoStartNextHand,
  shouldClearSettledHand,
  type PokerRoomRuntimeState,
} from './poker-room-timers'
import { hasHandCompletionEvent } from './poker-room-transport'

export type PokerRoomAlarmResolution =
  | {
      type: 'commit-and-broadcast'
      nextState: InternalRoomState
      settledHandJustCompleted?: boolean
    }
  | {
      type: 'sync-only'
    }

export interface ResolvePokerRoomAlarmInput {
  roomState: InternalRoomState
  runtimeState: PokerRoomRuntimeState
  now: string
  scheduleNextHand: boolean
}

function resolveDispatchResult(result: DispatchDomainCommandResult): PokerRoomAlarmResolution {
  return {
    type: 'commit-and-broadcast',
    nextState: result.nextState,
    settledHandJustCompleted: hasHandCompletionEvent(result.events),
  }
}

function resolveSeatTimeout(state: InternalRoomState, seatId: SeatId, now: string): PokerRoomAlarmResolution {
  return resolveDispatchResult(dispatchDomainCommand(
    state,
    {
      type: 'timeout',
      seatId,
      timestamp: now,
    },
    {
      deferAutomaticProgression: true,
    },
  ))
}

function getExpiredActingSeatId(
  state: InternalRoomState,
  expiredSeatIds: Set<SeatId>,
): SeatId | null {
  if (
    state.handStatus === 'in-hand' &&
    state.actingSeat !== null &&
    expiredSeatIds.has(state.actingSeat)
  ) {
    return state.actingSeat
  }

  return null
}

export function resolvePokerRoomAlarm({
  roomState,
  runtimeState,
  now,
  scheduleNextHand,
}: ResolvePokerRoomAlarmInput): PokerRoomAlarmResolution {
  const timedOutSeatId = getTimedOutSeatId(roomState, runtimeState, now)

  if (timedOutSeatId !== null) {
    return resolveSeatTimeout(roomState, timedOutSeatId, now)
  }

  if (shouldAdvanceStreet(roomState, runtimeState, now)) {
    return resolveDispatchResult(dispatchDomainCommand(roomState, {
      type: 'advance-street',
      timestamp: now,
    }))
  }

  const expiredDisconnectedSeatIds = getExpiredDisconnectedSeatIds(roomState, runtimeState, now)

  if (expiredDisconnectedSeatIds.length > 0) {
    const expiredSeatIds = new Set(expiredDisconnectedSeatIds)
    const disconnectExpiredState = applyDisconnectGraceExpirations(
      roomState,
      expiredDisconnectedSeatIds,
      now,
    )
    const expiredActingSeatId = getExpiredActingSeatId(disconnectExpiredState, expiredSeatIds)

    if (expiredActingSeatId !== null) {
      return resolveSeatTimeout(disconnectExpiredState, expiredActingSeatId, now)
    }

    return {
      type: 'commit-and-broadcast',
      nextState: disconnectExpiredState,
    }
  }

  if (scheduleNextHand && shouldAutoStartNextHand(roomState, runtimeState, now)) {
    const autoStarted = maybeAutoStartHand(roomState, now)

    if (autoStarted !== null) {
      return {
        type: 'commit-and-broadcast',
        nextState: autoStarted.nextState,
      }
    }
  }

  if (shouldClearSettledHand(roomState, runtimeState, now)) {
    return {
      type: 'commit-and-broadcast',
      nextState: clearSettledHandForWaiting(roomState, now),
    }
  }

  return { type: 'sync-only' }
}
