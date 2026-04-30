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
  pausedActionRemainingMs: number | null
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
  disconnectGraceExpirations: DisconnectedSeatGraceTimer[]
  disconnectGraceHoldovers: DisconnectedSeatGraceTimer[]
  disconnectGraceExpiredSeatIds: SeatId[]
}

export const DEFAULT_STREET_ADVANCE_DELAY_MS = 800
export const DEFAULT_DISCONNECT_GRACE_MS = 60_000

export interface DisconnectedSeatGraceTimer {
  seatId: SeatId
  playerId: string
  expiresAt: string
}

export interface DerivePokerRoomRuntimeStateOptions {
  scheduleNextHand?: boolean
  settledHandJustCompleted?: boolean
}

export function createEmptyPokerRoomRuntimeState(): PokerRoomRuntimeState {
  return {
    actionDeadlineAt: null,
    actionSeatId: null,
    actionSequence: null,
    pausedActionRemainingMs: null,
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
    disconnectGraceExpirations: [],
    disconnectGraceHoldovers: [],
    disconnectGraceExpiredSeatIds: [],
  }
}

function parseTimestamp(timestamp: string): number {
  const parsed = Date.parse(timestamp)

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${timestamp}`)
  }

  return parsed
}

function isActionTurnPending(state: InternalRoomState): boolean {
  return (
    state.handStatus === 'in-hand' &&
    state.actingSeat !== null &&
    state.pendingActionSeatIds.includes(state.actingSeat)
  )
}

function getActingSeat(state: InternalRoomState): InternalRoomState['seats'][number] | null {
  return state.actingSeat === null ? null : state.seats[state.actingSeat] ?? null
}

function isActionTimerSuspendedForDisconnectGrace(
  state: InternalRoomState,
  disconnectGraceExpiredSeatIds: SeatId[],
): boolean {
  const actingSeat = getActingSeat(state)

  return (
    isActionTurnPending(state) &&
    actingSeat?.isDisconnected === true &&
    !disconnectGraceExpiredSeatIds.includes(actingSeat.seatId)
  )
}

function isDisconnectedExpiredActionTurn(
  state: InternalRoomState,
  disconnectGraceExpiredSeatIds: SeatId[],
): boolean {
  return (
    isActionTurnPending(state) &&
    state.actingSeat !== null &&
    disconnectGraceExpiredSeatIds.includes(state.actingSeat)
  )
}

function canScheduleActionDeadline(
  state: InternalRoomState,
  disconnectGraceExpiredSeatIds: SeatId[],
): boolean {
  return isActionTurnPending(state) && !isActionTimerSuspendedForDisconnectGrace(
    state,
    disconnectGraceExpiredSeatIds,
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

function getPreviousDisconnectGraceExpiration(
  seatId: SeatId,
  playerId: string,
  previousRuntimeState: PokerRoomRuntimeState | null,
): DisconnectedSeatGraceTimer | null {
  const timers = [
    ...(previousRuntimeState?.disconnectGraceExpirations ?? []),
    ...(previousRuntimeState?.disconnectGraceHoldovers ?? []),
  ]

  return timers.find((timer) =>
    timer.seatId === seatId && timer.playerId === playerId,
  ) ?? null
}

function deriveDisconnectGraceExpirations(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null,
  disconnectGraceExpiredSeatIds: SeatId[],
): DisconnectedSeatGraceTimer[] {
  return state.seats.flatMap((seat) => {
    if (
      seat.playerId === null ||
      !seat.isDisconnected ||
      seat.isSittingOut ||
      disconnectGraceExpiredSeatIds.includes(seat.seatId)
    ) {
      return []
    }

    const previousTimer = getPreviousDisconnectGraceExpiration(
      seat.seatId,
      seat.playerId,
      previousRuntimeState,
    )

    return [{
      seatId: seat.seatId,
      playerId: seat.playerId,
      expiresAt: previousTimer?.expiresAt
        ?? new Date(parseTimestamp(now) + DEFAULT_DISCONNECT_GRACE_MS).toISOString(),
    }]
  })
}

function canKeepDisconnectGraceHoldover(state: InternalRoomState, timer: DisconnectedSeatGraceTimer): boolean {
  const seat = state.seats[timer.seatId]

  return (
    state.handStatus === 'in-hand' &&
    seat !== undefined &&
    seat.playerId === timer.playerId &&
    !seat.isSittingOut &&
    !seat.isSittingOutNextHand &&
    !seat.hasFolded &&
    !seat.isAllIn
  )
}

function deriveDisconnectGraceHoldovers(
  state: InternalRoomState,
  disconnectGraceExpirations: DisconnectedSeatGraceTimer[],
  previousRuntimeState: PokerRoomRuntimeState | null,
): DisconnectedSeatGraceTimer[] {
  const timersByKey = new Map<string, DisconnectedSeatGraceTimer>()

  for (const timer of [
    ...(previousRuntimeState?.disconnectGraceHoldovers ?? []),
    ...(previousRuntimeState?.disconnectGraceExpirations ?? []),
    ...disconnectGraceExpirations,
  ]) {
    if (canKeepDisconnectGraceHoldover(state, timer)) {
      timersByKey.set(`${timer.seatId}:${timer.playerId}`, timer)
    }
  }

  return [...timersByKey.values()]
}

function canKeepDisconnectGraceExpiredSeat(state: InternalRoomState, seatId: SeatId): boolean {
  const seat = state.seats[seatId]

  return (
    state.handStatus === 'in-hand' &&
    seat !== undefined &&
    seat.playerId !== null &&
    seat.isSittingOutNextHand &&
    !seat.hasFolded &&
    !seat.isAllIn
  )
}

function deriveDisconnectGraceExpiredSeatIds(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null,
): SeatId[] {
  const nowMs = parseTimestamp(now)
  const previousExpiredSeatIds = previousRuntimeState?.disconnectGraceExpiredSeatIds ?? []
  const newlyExpiredSeatIds = (previousRuntimeState?.disconnectGraceExpirations ?? [])
    .filter((timer) => {
      const seat = state.seats[timer.seatId]

      return (
        seat !== undefined &&
        seat.playerId === timer.playerId &&
        nowMs >= parseTimestamp(timer.expiresAt)
      )
    })
    .map((timer) => timer.seatId)
  const expiredSeatIds = new Set([...previousExpiredSeatIds, ...newlyExpiredSeatIds])

  return [...expiredSeatIds].filter((seatId) => canKeepDisconnectGraceExpiredSeat(state, seatId))
}

function isRuntimeActionTurnCurrent(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
): boolean {
  return (
    isActionTurnPending(state) &&
    runtimeState.actionSeatId !== null &&
    runtimeState.actionSequence !== null &&
    runtimeState.actionSeatId === state.actingSeat &&
    runtimeState.actionSequence === state.actionSequence
  )
}

function getPausedActionRemainingMs(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null,
): number {
  if (!previousRuntimeState || !isRuntimeActionTurnCurrent(state, previousRuntimeState)) {
    return state.config.actionTimeoutMs
  }

  if (typeof previousRuntimeState.pausedActionRemainingMs === 'number') {
    return previousRuntimeState.pausedActionRemainingMs
  }

  if (previousRuntimeState.actionDeadlineAt !== null) {
    return Math.max(parseTimestamp(previousRuntimeState.actionDeadlineAt) - parseTimestamp(now), 0)
  }

  return state.config.actionTimeoutMs
}

function getResumedActionDeadlineAt(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null,
): string {
  const remainingMs =
    previousRuntimeState && isRuntimeActionTurnCurrent(state, previousRuntimeState)
      ? previousRuntimeState.pausedActionRemainingMs
      : null

  return new Date(parseTimestamp(now) + (remainingMs ?? state.config.actionTimeoutMs)).toISOString()
}

export function derivePokerRoomRuntimeState(
  state: InternalRoomState,
  now: string,
  previousRuntimeState: PokerRoomRuntimeState | null = null,
  options: DerivePokerRoomRuntimeStateOptions = {},
): PokerRoomRuntimeState {
  const runtimeState = createEmptyPokerRoomRuntimeState()
  const shouldScheduleNextHand = options.scheduleNextHand ?? true
  runtimeState.disconnectGraceExpiredSeatIds = deriveDisconnectGraceExpiredSeatIds(
    state,
    now,
    previousRuntimeState,
  )
  runtimeState.disconnectGraceExpirations = deriveDisconnectGraceExpirations(
    state,
    now,
    previousRuntimeState,
    runtimeState.disconnectGraceExpiredSeatIds,
  )
  runtimeState.disconnectGraceHoldovers = deriveDisconnectGraceHoldovers(
    state,
    runtimeState.disconnectGraceExpirations,
    previousRuntimeState,
  )

  if (isActionTimerSuspendedForDisconnectGrace(state, runtimeState.disconnectGraceExpiredSeatIds)) {
    const pausedActionRemainingMs = getPausedActionRemainingMs(state, now, previousRuntimeState)

    runtimeState.actionSeatId = state.actingSeat
    runtimeState.actionSequence = state.actionSequence

    if (pausedActionRemainingMs <= 0) {
      runtimeState.actionDeadlineAt = now
    } else {
      runtimeState.pausedActionRemainingMs = pausedActionRemainingMs
    }
  }

  if (
    runtimeState.actionDeadlineAt === null &&
    canScheduleActionDeadline(state, runtimeState.disconnectGraceExpiredSeatIds)
  ) {
    if (isDisconnectedExpiredActionTurn(state, runtimeState.disconnectGraceExpiredSeatIds)) {
      runtimeState.actionDeadlineAt = now
      runtimeState.actionSeatId = state.actingSeat
      runtimeState.actionSequence = state.actionSequence
    } else if (previousRuntimeState && isRuntimeDeadlineCurrent(state, previousRuntimeState)) {
      runtimeState.actionDeadlineAt = previousRuntimeState.actionDeadlineAt
      runtimeState.actionSeatId = previousRuntimeState.actionSeatId
      runtimeState.actionSequence = previousRuntimeState.actionSequence
    } else {
      runtimeState.actionDeadlineAt = getResumedActionDeadlineAt(state, now, previousRuntimeState)
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
    runtimeState.actionDeadlineAt !== null &&
    isRuntimeActionTurnCurrent(state, runtimeState)
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

export function getExpiredDisconnectedSeatIds(
  state: InternalRoomState,
  runtimeState: PokerRoomRuntimeState,
  now: string,
): SeatId[] {
  const nowMs = parseTimestamp(now)

  return (runtimeState.disconnectGraceExpirations ?? [])
    .filter((timer) => {
      const seat = state.seats[timer.seatId]

      return (
        seat !== undefined &&
        seat.playerId === timer.playerId &&
        seat.isDisconnected &&
        nowMs >= parseTimestamp(timer.expiresAt)
      )
    })
    .map((timer) => timer.seatId)
}

export function getNextRuntimeAlarmAt(runtimeState: PokerRoomRuntimeState): string | null {
  const alarmTimestamps = [
    runtimeState.actionDeadlineAt,
    runtimeState.streetAdvanceAt,
    runtimeState.nextHandStartAt,
    runtimeState.settledHandClearAt,
    ...(runtimeState.disconnectGraceExpirations ?? []).map((timer) => timer.expiresAt),
  ].filter((timestamp): timestamp is string => timestamp != null)

  if (alarmTimestamps.length === 0) {
    return null
  }

  return alarmTimestamps.reduce((earliest, timestamp) =>
    parseTimestamp(timestamp) < parseTimestamp(earliest) ? timestamp : earliest,
  )
}
