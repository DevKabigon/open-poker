import {
  type ActionRequest,
  projectRoomSnapshotMessage,
  type DomainEvent,
  type InternalRoomState,
  type SeatId,
} from '@openpoker/domain'
import type {
  ClientToServerMessage,
  RoomSnapshotMessage,
} from '@openpoker/protocol'
import type { LeaveSeatDisposition } from './poker-room-seating'
import type { PokerRoomRuntimeState } from './poker-room-timers'

export interface UpsertSeatRequest {
  playerId: string | null
  displayName?: string | null
  stack?: number
  isSittingOut?: boolean
  isSittingOutNextHand?: boolean
  isDisconnected?: boolean
}

export interface RoomSnapshotResponse {
  ok: true
  roomId: string
  roomVersion: number
  snapshot: RoomSnapshotMessage
}

export interface RoomCommandResponse extends RoomSnapshotResponse {
  events: DomainEvent[]
}

export interface SocketAttachment {
  sessionToken: string | null
}

export interface IssueSessionResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
}

export interface ClaimSeatResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
}

export interface LeaveSeatResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  disposition: LeaveSeatDisposition
}

export interface SetSitOutNextHandResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  isSittingOut: boolean
  isSittingOutNextHand: boolean
}

export interface SitInSeatResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  isSittingOut: boolean
  isSittingOutNextHand: boolean
}

export interface SetShowdownRevealPreferenceResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  showCardsAtShowdown: boolean
}

export interface ResumeSeatSessionResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
  issuedAt: string
}

export const DEFAULT_INVALID_COMMAND_ID = '__invalid__'

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return Response.json(payload, init)
}

export function errorResponse(status: number, reason: string): Response {
  return jsonResponse(
    {
      ok: false,
      reason,
    },
    { status },
  )
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isClientToServerMessage(value: unknown): value is ClientToServerMessage {
  if (!isPlainObject(value) || typeof value.type !== 'string') {
    return false
  }

  if (value.type === 'join-room') {
    return (
      typeof value.roomId === 'string' &&
      value.roomId.trim().length > 0 &&
      typeof value.sessionToken === 'string' &&
      value.sessionToken.trim().length > 0
    )
  }

  if (value.type === 'player-action') {
    if (
      typeof value.commandId !== 'string' ||
      value.commandId.trim().length === 0 ||
      typeof value.roomId !== 'string' ||
      value.roomId.trim().length === 0 ||
      typeof value.action !== 'string'
    ) {
      return false
    }

    if (
      value.action !== 'fold' &&
      value.action !== 'check' &&
      value.action !== 'call' &&
      value.action !== 'bet' &&
      value.action !== 'raise' &&
      value.action !== 'all-in'
    ) {
      return false
    }

    if ((value.action === 'bet' || value.action === 'raise') && !isNonNegativeInteger(value.amount)) {
      return false
    }

    return true
  }

  return false
}

export function parseOptionalSessionToken(value: string | null): string | null {
  if (value === null || value.trim().length === 0) {
    return null
  }

  return value.trim()
}

export function isPristineRoomState(state: InternalRoomState): boolean {
  return (
    state.handId === null &&
    state.handNumber === 0 &&
    state.handStatus === 'waiting' &&
    state.street === 'idle' &&
    state.roomVersion === 0 &&
    state.seats.every((seat) => seat.playerId === null)
  )
}

export function buildRoomSnapshotMessage(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  runtimeState: PokerRoomRuntimeState,
): RoomSnapshotMessage {
  return projectRoomSnapshotMessage(state, {
    viewerSeatId,
    actionDeadlineAt: runtimeState.actionDeadlineAt,
    nextHandStartAt: runtimeState.nextHandStartAt,
    nextHandDelayMs: runtimeState.nextHandDelayMs,
    disconnectGraceExpirations: runtimeState.disconnectGraceExpirations,
  })
}

export function buildSnapshotResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  runtimeState: PokerRoomRuntimeState,
): RoomSnapshotResponse {
  return {
    ok: true,
    roomId: state.roomId,
    roomVersion: state.roomVersion,
    snapshot: buildRoomSnapshotMessage(state, viewerSeatId, runtimeState),
  }
}

export function buildCommandResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  runtimeState: PokerRoomRuntimeState,
  events: DomainEvent[],
): RoomCommandResponse {
  return {
    ...buildSnapshotResponse(state, viewerSeatId, runtimeState),
    events,
  }
}

export function createSocketAttachment(sessionToken: string | null): SocketAttachment {
  return { sessionToken }
}

export function getSocketAttachment(ws: WebSocket): SocketAttachment {
  const attachment = ws.deserializeAttachment()

  if (!isPlainObject(attachment)) {
    return createSocketAttachment(null)
  }

  if (!('sessionToken' in attachment)) {
    return createSocketAttachment(null)
  }

  return createSocketAttachment(isNonEmptyString(attachment.sessionToken) ? attachment.sessionToken.trim() : null)
}

export function createSocketTags(viewerSeatId: SeatId | null): string[] {
  return viewerSeatId === null ? ['connections', 'viewer:anonymous'] : ['connections', `viewer:${viewerSeatId}`]
}

export function hasHandCompletionEvent(events: DomainEvent[]): boolean {
  return events.some((event) => event.type === 'hand-awarded-uncontested' || event.type === 'showdown-settled')
}

export function toActionRequest(message: Extract<ClientToServerMessage, { type: 'player-action' }>): ActionRequest {
  switch (message.action) {
    case 'fold':
    case 'check':
    case 'call':
    case 'all-in':
      return { type: message.action }
    case 'bet':
    case 'raise':
      if (!isNonNegativeInteger(message.amount) || message.amount <= 0) {
        throw new Error(`${message.action} messages require a positive integer amount.`)
      }

      return { type: message.action, amount: message.amount }
  }
}
