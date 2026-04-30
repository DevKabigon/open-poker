import {
  dispatchDomainCommand,
  type InternalRoomState,
  type SeatId,
} from '@openpoker/domain'
import type {
  CommandAckMessage,
  CommandRejectedMessage,
  ServerToClientMessage,
} from '@openpoker/protocol'
import {
  resolveSeatSession,
  type PokerRoomSeatSession,
  type PokerRoomSessionState,
} from './poker-room-sessions'
import type { PokerRoomRuntimeState } from './poker-room-timers'
import {
  DEFAULT_INVALID_COMMAND_ID,
  buildRoomSnapshotMessage,
  createSocketAttachment,
  createSocketTags,
  getSocketAttachment,
  hasHandCompletionEvent,
  isClientToServerMessage,
  toActionRequest,
} from './poker-room-transport'

export type PokerRoomSocketMessageResolution =
  | {
      type: 'reject'
      commandId: string
      reason: string
      socketSessionToken?: string | null
    }
  | {
      type: 'join-room'
      session: PokerRoomSeatSession
      sessionToken: string
    }
  | {
      type: 'player-action'
      commandId: string
      nextState: InternalRoomState
      settledHandJustCompleted: boolean
    }

export interface ResolvePokerRoomSocketMessageInput {
  roomState: InternalRoomState
  sessionState: PokerRoomSessionState
  viewerSeatId: SeatId | null
  message: string | ArrayBuffer
  now: string
}

export function resolvePokerRoomSocketMessage({
  roomState,
  sessionState,
  viewerSeatId,
  message,
  now,
}: ResolvePokerRoomSocketMessageInput): PokerRoomSocketMessageResolution {
  if (typeof message !== 'string') {
    return {
      type: 'reject',
      commandId: DEFAULT_INVALID_COMMAND_ID,
      reason: 'Binary WebSocket messages are not supported.',
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(message)
  } catch {
    return {
      type: 'reject',
      commandId: DEFAULT_INVALID_COMMAND_ID,
      reason: 'WebSocket message must be valid JSON.',
    }
  }

  if (!isClientToServerMessage(parsed)) {
    return {
      type: 'reject',
      commandId: DEFAULT_INVALID_COMMAND_ID,
      reason: 'WebSocket message does not match the client protocol.',
    }
  }

  if (parsed.type === 'join-room') {
    if (parsed.roomId !== roomState.roomId) {
      return {
        type: 'reject',
        commandId: DEFAULT_INVALID_COMMAND_ID,
        reason: 'join-room roomId does not match this room.',
      }
    }

    const session = resolveSeatSession(roomState, sessionState, parsed.sessionToken)

    if (session === null) {
      return {
        type: 'reject',
        commandId: DEFAULT_INVALID_COMMAND_ID,
        reason: 'join-room sessionToken is not valid for any occupied seat.',
        socketSessionToken: null,
      }
    }

    return {
      type: 'join-room',
      session,
      sessionToken: parsed.sessionToken,
    }
  }

  if (parsed.roomId !== roomState.roomId) {
    return {
      type: 'reject',
      commandId: parsed.commandId,
      reason: 'player-action roomId does not match this room.',
    }
  }

  if (viewerSeatId === null) {
    return {
      type: 'reject',
      commandId: parsed.commandId,
      reason: 'This socket is not associated with a seated player.',
    }
  }

  try {
    const result = dispatchDomainCommand(
      roomState,
      {
        type: 'act',
        seatId: viewerSeatId,
        action: toActionRequest(parsed),
        timestamp: now,
      },
      {
        deferAutomaticProgression: true,
      },
    )

    return {
      type: 'player-action',
      commandId: parsed.commandId,
      nextState: result.nextState,
      settledHandJustCompleted: hasHandCompletionEvent(result.events),
    }
  } catch (error) {
    return {
      type: 'reject',
      commandId: parsed.commandId,
      reason: error instanceof Error ? error.message : 'Unknown player-action failure.',
    }
  }
}

export function getViewerSeatIdForSessionToken(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  sessionToken: string | null,
): SeatId | null {
  return resolveSeatSession(roomState, sessionState, sessionToken)?.seatId ?? null
}

export function getViewerSeatIdForSocket(
  ws: WebSocket,
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
): SeatId | null {
  return getViewerSeatIdForSessionToken(roomState, sessionState, getSocketSessionToken(ws))
}

export function getSocketSessionToken(ws: WebSocket): string | null {
  return getSocketAttachment(ws).sessionToken
}

export function hasOpenSocketForSessionToken(
  sockets: Iterable<WebSocket>,
  sessionToken: string,
  excludedSocket: WebSocket,
): boolean {
  for (const socket of sockets) {
    if (socket === excludedSocket) {
      continue
    }

    if (getSocketAttachment(socket).sessionToken === sessionToken) {
      return true
    }
  }

  return false
}

export function acceptRoomWebSocket(
  ctx: DurableObjectState,
  server: WebSocket,
  sessionToken: string | null,
  viewerSeatId: SeatId | null,
): void {
  server.serializeAttachment(createSocketAttachment(sessionToken))
  ctx.acceptWebSocket(server, createSocketTags(viewerSeatId))
}

export function sendRoomSnapshotToSocket(
  ws: WebSocket,
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  runtimeState: PokerRoomRuntimeState,
): void {
  const viewerSeatId = getViewerSeatIdForSocket(ws, roomState, sessionState)
  sendSocketMessage(ws, buildRoomSnapshotMessage(roomState, viewerSeatId, runtimeState))
}

export function broadcastRoomSnapshots(
  sockets: Iterable<WebSocket>,
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  runtimeState: PokerRoomRuntimeState,
): void {
  for (const ws of sockets) {
    sendRoomSnapshotToSocket(ws, roomState, sessionState, runtimeState)
  }
}

export function sendCommandAck(ws: WebSocket, commandId: string, roomVersion: number): void {
  const message: CommandAckMessage = {
    type: 'command-ack',
    commandId,
    roomVersion,
  }

  sendSocketMessage(ws, message)
}

export function sendCommandRejected(ws: WebSocket, commandId: string, reason: string): void {
  const message: CommandRejectedMessage = {
    type: 'command-rejected',
    commandId,
    reason,
  }

  sendSocketMessage(ws, message)
}

export function closeSocket(ws: WebSocket, status: number, reason: string): void {
  try {
    ws.close(status, reason)
  } catch {
    // Ignore close errors during stale or abnormal socket cleanup.
  }
}

function sendSocketMessage(ws: WebSocket, message: ServerToClientMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    closeSocket(ws, 1011, 'Socket send failed.')
  }
}
