import {
  type ActionRequest,
  assertRoomStateInvariants,
  createEmptySeatState,
  createInitialRoomState,
  dispatchDomainCommand,
  projectRoomSnapshotMessage,
  type DomainCommand,
  type DomainEvent,
  type InternalRoomState,
  type SeatId,
} from '@openpoker/domain'
import type {
  ClientToServerMessage,
  CommandAckMessage,
  CommandRejectedMessage,
  RoomSnapshotMessage,
  ServerToClientMessage,
} from '@openpoker/protocol'
import {
  createEmptyPokerRoomRuntimeState,
  derivePokerRoomRuntimeState,
  getTimedOutSeatId,
  type PokerRoomRuntimeState,
} from './poker-room-timers'

interface Env {}

interface UpsertSeatRequest {
  playerId: string | null
  displayName?: string | null
  stack?: number
  isSittingOut?: boolean
  isDisconnected?: boolean
}

interface RoomSnapshotResponse {
  ok: true
  roomId: string
  roomVersion: number
  snapshot: RoomSnapshotMessage
}

interface RoomCommandResponse extends RoomSnapshotResponse {
  events: DomainEvent[]
}

interface SocketAttachment {
  viewerSeatId: SeatId | null
}

const ROOM_STATE_STORAGE_KEY = 'room-state'
const ROOM_RUNTIME_STORAGE_KEY = 'room-runtime'
const DEFAULT_DEV_STACK = 10_000
const DEFAULT_INVALID_COMMAND_ID = '__invalid__'

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return Response.json(payload, init)
}

function errorResponse(status: number, reason: string): Response {
  return jsonResponse(
    {
      ok: false,
      reason,
    },
    { status },
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isClientToServerMessage(value: unknown): value is ClientToServerMessage {
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

function parseOptionalSeatId(value: string | null): SeatId | null {
  if (value === null || value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('viewerSeatId must be a non-negative integer when provided.')
  }

  return parsed
}

function isPristineRoomState(state: InternalRoomState): boolean {
  return (
    state.handId === null &&
    state.handNumber === 0 &&
    state.handStatus === 'waiting' &&
    state.street === 'idle' &&
    state.roomVersion === 0 &&
    state.seats.every((seat) => seat.playerId === null)
  )
}

function buildSnapshotResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  actionDeadlineAt: string | null,
): RoomSnapshotResponse {
  return {
    ok: true,
    roomId: state.roomId,
    roomVersion: state.roomVersion,
    snapshot: projectRoomSnapshotMessage(state, { viewerSeatId, actionDeadlineAt }),
  }
}

function buildCommandResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  actionDeadlineAt: string | null,
  events: DomainEvent[],
): RoomCommandResponse {
  return {
    ...buildSnapshotResponse(state, viewerSeatId, actionDeadlineAt),
    events,
  }
}

function createSocketAttachment(viewerSeatId: SeatId | null): SocketAttachment {
  return { viewerSeatId }
}

function getSocketAttachment(ws: WebSocket): SocketAttachment {
  const attachment = ws.deserializeAttachment()

  if (!isPlainObject(attachment)) {
    return createSocketAttachment(null)
  }

  if (!('viewerSeatId' in attachment)) {
    return createSocketAttachment(null)
  }

  return createSocketAttachment(
    attachment.viewerSeatId === null ? null : isNonNegativeInteger(attachment.viewerSeatId) ? attachment.viewerSeatId : null,
  )
}

function createSocketTags(viewerSeatId: SeatId | null): string[] {
  return viewerSeatId === null ? ['connections', 'viewer:anonymous'] : ['connections', `viewer:${viewerSeatId}`]
}

function toActionRequest(message: Extract<ClientToServerMessage, { type: 'player-action' }>): ActionRequest {
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

export class PokerRoom {
  private readonly ctx: DurableObjectState
  private roomState: InternalRoomState
  private runtimeState: PokerRoomRuntimeState

  constructor(ctx: DurableObjectState, env: Env) {
    void env
    this.ctx = ctx
    this.roomState = createInitialRoomState(ctx.id.toString())
    this.runtimeState = createEmptyPokerRoomRuntimeState()

    this.ctx.blockConcurrencyWhile(async () => {
      const [storedRoomState, storedRuntimeState] = await Promise.all([
        this.ctx.storage.get<InternalRoomState>(ROOM_STATE_STORAGE_KEY),
        this.ctx.storage.get<PokerRoomRuntimeState>(ROOM_RUNTIME_STORAGE_KEY),
      ])

      if (storedRoomState) {
        this.roomState = storedRoomState
      }

      if (storedRuntimeState) {
        this.runtimeState = storedRuntimeState
      }

      if (storedRoomState || storedRuntimeState) {
        if (!storedRuntimeState) {
          this.runtimeState = derivePokerRoomRuntimeState(this.roomState, new Date().toISOString())
          await this.persistRuntimeState()
        }

        await this.syncAlarmToRuntimeState()
        return
      }

      await this.persistStateBundle()
    })
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const roomId = url.searchParams.get('roomId')

      if (!roomId || roomId.trim().length === 0) {
        return errorResponse(400, 'roomId query parameter is required.')
      }

      await this.ensureRoomId(roomId.trim())

      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({
          ok: true,
          roomId: this.roomState.roomId,
          roomVersion: this.roomState.roomVersion,
          handStatus: this.roomState.handStatus,
          street: this.roomState.street,
          actionDeadlineAt: this.runtimeState.actionDeadlineAt,
          actionSeatId: this.runtimeState.actionSeatId,
        })
      }

      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const viewerSeatId = parseOptionalSeatId(url.searchParams.get('viewerSeatId'))
        return jsonResponse(buildSnapshotResponse(this.roomState, viewerSeatId, this.runtimeState.actionDeadlineAt))
      }

      if (request.method === 'GET' && url.pathname === '/ws') {
        const viewerSeatId = parseOptionalSeatId(url.searchParams.get('viewerSeatId'))
        return this.handleWebSocketUpgrade(request, viewerSeatId)
      }

      if (request.method === 'POST' && url.pathname === '/commands') {
        return await this.handleDispatchCommand(request)
      }

      const debugSeatMatch = request.method === 'PUT'
        ? /^\/debug\/seats\/(?<seatId>\d+)$/.exec(url.pathname)
        : null

      if (debugSeatMatch?.groups?.seatId) {
        return await this.handleUpsertSeat(request, Number(debugSeatMatch.groups.seatId))
      }

      if (request.method === 'POST' && url.pathname === '/debug/reset') {
        return await this.handleResetRoom()
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown PokerRoom error.'
      return errorResponse(400, reason)
    }
  }

  async alarm(): Promise<void> {
    const now = new Date().toISOString()
    const timedOutSeatId = getTimedOutSeatId(this.roomState, this.runtimeState, now)

    if (timedOutSeatId === null) {
      await this.syncAlarmToRuntimeState()
      return
    }

    const result = dispatchDomainCommand(this.roomState, {
      type: 'timeout',
      seatId: timedOutSeatId,
      timestamp: now,
    })

    await this.commitRoomState(result.nextState, now)
    this.broadcastSnapshots()
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.sendCommandRejected(ws, DEFAULT_INVALID_COMMAND_ID, 'Binary WebSocket messages are not supported.')
      return
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(message)
    } catch {
      this.sendCommandRejected(ws, DEFAULT_INVALID_COMMAND_ID, 'WebSocket message must be valid JSON.')
      return
    }

    if (!isClientToServerMessage(parsed)) {
      this.sendCommandRejected(ws, DEFAULT_INVALID_COMMAND_ID, 'WebSocket message does not match the client protocol.')
      return
    }

    if (parsed.type === 'join-room') {
      if (parsed.roomId !== this.roomState.roomId) {
        this.sendCommandRejected(ws, DEFAULT_INVALID_COMMAND_ID, 'join-room roomId does not match this room.')
        return
      }

      this.sendSnapshotToSocket(ws)
      return
    }

    if (parsed.roomId !== this.roomState.roomId) {
      this.sendCommandRejected(ws, parsed.commandId, 'player-action roomId does not match this room.')
      return
    }

    const { viewerSeatId } = getSocketAttachment(ws)

    if (viewerSeatId === null) {
      this.sendCommandRejected(ws, parsed.commandId, 'This socket is not associated with a seated player.')
      return
    }

    try {
      const result = dispatchDomainCommand(this.roomState, {
        type: 'act',
        seatId: viewerSeatId,
        action: toActionRequest(parsed),
        timestamp: new Date().toISOString(),
      })

      await this.commitRoomState(result.nextState)
      this.sendCommandAck(ws, parsed.commandId)
      this.broadcastSnapshots()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown player-action failure.'
      this.sendCommandRejected(ws, parsed.commandId, reason)
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'Connection closed.')
    } catch {
      // Ignore close-on-closed socket errors.
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : 'Unknown WebSocket error.'

    try {
      ws.close(1011, reason.slice(0, 123))
    } catch {
      // Ignore close errors during abnormal termination.
    }
  }

  private async ensureRoomId(roomId: string): Promise<void> {
    if (this.roomState.roomId === roomId) {
      return
    }

    if (!isPristineRoomState(this.roomState)) {
      throw new Error(`Room id mismatch. Expected ${this.roomState.roomId}, received ${roomId}.`)
    }

    this.roomState = {
      ...this.roomState,
      roomId,
    }

    await this.persistStateBundle()
  }

  private async handleDispatchCommand(request: Request): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !('command' in payload)) {
      throw new Error('Command request body must include a command object.')
    }

    const viewerSeatId =
      'viewerSeatId' in payload
        ? (payload.viewerSeatId === null || payload.viewerSeatId === undefined
            ? null
            : this.requireSeatId(payload.viewerSeatId, 'viewerSeatId'))
        : null
    const command = payload.command as DomainCommand
    const result = dispatchDomainCommand(this.roomState, command)
    await this.commitRoomState(result.nextState)
    this.broadcastSnapshots()

    return jsonResponse(
      buildCommandResponse(this.roomState, viewerSeatId, this.runtimeState.actionDeadlineAt, result.events),
    )
  }

  private async handleUpsertSeat(request: Request, seatId: number): Promise<Response> {
    this.ensureSeatManagementAllowed()

    if (!Number.isInteger(seatId) || seatId < 0 || seatId >= this.roomState.seats.length) {
      throw new Error(`seatId must be between 0 and ${this.roomState.seats.length - 1}.`)
    }

    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !('playerId' in payload)) {
      throw new Error('Seat update body must include playerId.')
    }

    const currentSeat = this.roomState.seats[seatId]!
    const nextSeat =
      payload.playerId === null
        ? createEmptySeatState(seatId)
        : this.createUpdatedSeat(currentSeat, seatId, payload as unknown as UpsertSeatRequest)

    this.roomState.seats[seatId] = nextSeat
    await this.commitRoomState(this.roomState)
    this.broadcastSnapshots()

    return jsonResponse(buildSnapshotResponse(this.roomState, seatId, this.runtimeState.actionDeadlineAt))
  }

  private async handleResetRoom(): Promise<Response> {
    const nextState = createInitialRoomState(this.roomState.roomId)
    await this.commitRoomState(nextState)
    this.broadcastSnapshots()

    return jsonResponse(buildSnapshotResponse(this.roomState, null, this.runtimeState.actionDeadlineAt))
  }

  private handleWebSocketUpgrade(request: Request, viewerSeatId: SeatId | null): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new Error('WebSocket upgrade requests must include Upgrade: websocket.')
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    server.serializeAttachment(createSocketAttachment(viewerSeatId))
    this.ctx.acceptWebSocket(server, createSocketTags(viewerSeatId))
    this.sendSnapshotToSocket(server)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private createUpdatedSeat(
    currentSeat: InternalRoomState['seats'][number],
    seatId: SeatId,
    payload: UpsertSeatRequest,
  ): InternalRoomState['seats'][number] {
    if (typeof payload.playerId !== 'string' || payload.playerId.trim().length === 0) {
      throw new Error('playerId must be null or a non-empty string.')
    }

    if (
      payload.displayName !== undefined &&
      payload.displayName !== null &&
      (typeof payload.displayName !== 'string' || payload.displayName.trim().length === 0)
    ) {
      throw new Error('displayName must be null, omitted, or a non-empty string.')
    }

    if (payload.stack !== undefined && !isNonNegativeInteger(payload.stack)) {
      throw new Error('stack must be a non-negative integer when provided.')
    }

    if (payload.isSittingOut !== undefined && typeof payload.isSittingOut !== 'boolean') {
      throw new Error('isSittingOut must be a boolean when provided.')
    }

    if (payload.isDisconnected !== undefined && typeof payload.isDisconnected !== 'boolean') {
      throw new Error('isDisconnected must be a boolean when provided.')
    }

    return {
      ...createEmptySeatState(seatId),
      seatId,
      playerId: payload.playerId.trim(),
      displayName:
        payload.displayName === undefined
          ? currentSeat.displayName ?? payload.playerId.trim()
          : payload.displayName,
      stack: payload.stack ?? (currentSeat.playerId === null ? DEFAULT_DEV_STACK : currentSeat.stack),
      isSittingOut: payload.isSittingOut ?? currentSeat.isSittingOut,
      isDisconnected: payload.isDisconnected ?? currentSeat.isDisconnected,
    }
  }

  private ensureSeatManagementAllowed(): void {
    if (this.roomState.handStatus === 'in-hand' || this.roomState.handStatus === 'showdown') {
      throw new Error('Seat updates are disabled while a hand is actively running.')
    }
  }

  private requireSeatId(value: unknown, fieldName: string): SeatId {
    if (!isNonNegativeInteger(value)) {
      throw new Error(`${fieldName} must be a non-negative integer.`)
    }

    return value
  }

  private async persistRoomState(): Promise<void> {
    await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, this.roomState)
  }

  private async persistRuntimeState(): Promise<void> {
    await this.ctx.storage.put(ROOM_RUNTIME_STORAGE_KEY, this.runtimeState)
  }

  private async persistStateBundle(): Promise<void> {
    await Promise.all([
      this.persistRoomState(),
      this.persistRuntimeState(),
    ])
  }

  private async commitRoomState(nextState: InternalRoomState, now = new Date().toISOString()): Promise<void> {
    this.roomState = {
      ...nextState,
      roomVersion: this.roomState.roomVersion + 1,
    }
    this.runtimeState = derivePokerRoomRuntimeState(this.roomState, now)

    assertRoomStateInvariants(this.roomState)
    await this.persistStateBundle()
    await this.syncAlarmToRuntimeState()
  }

  private async syncAlarmToRuntimeState(): Promise<void> {
    if (this.runtimeState.actionDeadlineAt === null) {
      await this.ctx.storage.deleteAlarm()
      return
    }

    await this.ctx.storage.setAlarm(Date.parse(this.runtimeState.actionDeadlineAt))
  }

  private sendSnapshotToSocket(ws: WebSocket): void {
    const { viewerSeatId } = getSocketAttachment(ws)
    const message = projectRoomSnapshotMessage(this.roomState, {
      viewerSeatId,
      actionDeadlineAt: this.runtimeState.actionDeadlineAt,
    })
    this.sendSocketMessage(ws, message)
  }

  private sendCommandAck(ws: WebSocket, commandId: string): void {
    const message: CommandAckMessage = {
      type: 'command-ack',
      commandId,
      roomVersion: this.roomState.roomVersion,
    }

    this.sendSocketMessage(ws, message)
  }

  private sendCommandRejected(ws: WebSocket, commandId: string, reason: string): void {
    const message: CommandRejectedMessage = {
      type: 'command-rejected',
      commandId,
      reason,
    }

    this.sendSocketMessage(ws, message)
  }

  private broadcastSnapshots(): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.sendSnapshotToSocket(ws)
    }
  }

  private sendSocketMessage(ws: WebSocket, message: ServerToClientMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      try {
        ws.close(1011, 'Socket send failed.')
      } catch {
        // Ignore close errors for stale sockets.
      }
    }
  }
}
