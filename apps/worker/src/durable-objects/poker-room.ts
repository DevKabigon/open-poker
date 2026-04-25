import {
  type ActionRequest,
  assertRoomStateInvariants,
  createEmptySeatState,
  dispatchDomainCommand,
  getHandEligibleSeatIds,
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
  getNextRuntimeAlarmAt,
  getTimedOutSeatId,
  shouldAutoStartNextHand,
  type PokerRoomRuntimeState,
} from './poker-room-timers'
import {
  createEmptyPokerRoomSessionState,
  issueSeatSession,
  resolveSeatSession,
  revokeAllSeatSessions,
  revokeSeatSessions,
  type PokerRoomSessionState,
} from './poker-room-sessions'
import {
  claimSeat,
  leaveSeat,
  type LeaveSeatDisposition,
} from './poker-room-seating'
import { canAutoStartHandImmediately, maybeAutoStartHand } from './poker-room-auto-start'
import { assertRoomCatalogEntry, createInitialCatalogRoomState } from '../rooms/catalog'

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
  sessionToken: string | null
}

interface IssueSessionResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
}

interface ClaimSeatResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
}

interface LeaveSeatResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  disposition: LeaveSeatDisposition
}

interface ResumeSeatSessionResponse extends RoomSnapshotResponse {
  seatId: SeatId
  playerId: string
  sessionToken: string
  issuedAt: string
}

const ROOM_STATE_STORAGE_KEY = 'room-state'
const ROOM_RUNTIME_STORAGE_KEY = 'room-runtime'
const ROOM_SESSION_STORAGE_KEY = 'room-sessions'
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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

function parseOptionalSessionToken(value: string | null): string | null {
  if (value === null || value.trim().length === 0) {
    return null
  }

  return value.trim()
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
  nextHandStartAt: string | null,
): RoomSnapshotResponse {
  return {
    ok: true,
    roomId: state.roomId,
    roomVersion: state.roomVersion,
    snapshot: projectRoomSnapshotMessage(state, { viewerSeatId, actionDeadlineAt, nextHandStartAt }),
  }
}

function buildCommandResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  actionDeadlineAt: string | null,
  nextHandStartAt: string | null,
  events: DomainEvent[],
): RoomCommandResponse {
  return {
    ...buildSnapshotResponse(state, viewerSeatId, actionDeadlineAt, nextHandStartAt),
    events,
  }
}

function createSocketAttachment(sessionToken: string | null): SocketAttachment {
  return { sessionToken }
}

function getSocketAttachment(ws: WebSocket): SocketAttachment {
  const attachment = ws.deserializeAttachment()

  if (!isPlainObject(attachment)) {
    return createSocketAttachment(null)
  }

  if (!('sessionToken' in attachment)) {
    return createSocketAttachment(null)
  }

  return createSocketAttachment(isNonEmptyString(attachment.sessionToken) ? attachment.sessionToken.trim() : null)
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
  private sessionState: PokerRoomSessionState

  constructor(ctx: DurableObjectState, env: Env) {
    void env
    this.ctx = ctx
    this.roomState = createInitialCatalogRoomState('cash-nlhe-1-2-table-01')
    this.runtimeState = createEmptyPokerRoomRuntimeState()
    this.sessionState = createEmptyPokerRoomSessionState()

    this.ctx.blockConcurrencyWhile(async () => {
      const [storedRoomState, storedRuntimeState, storedSessionState] = await Promise.all([
        this.ctx.storage.get<InternalRoomState>(ROOM_STATE_STORAGE_KEY),
        this.ctx.storage.get<PokerRoomRuntimeState>(ROOM_RUNTIME_STORAGE_KEY),
        this.ctx.storage.get<PokerRoomSessionState>(ROOM_SESSION_STORAGE_KEY),
      ])

      if (storedRoomState) {
        this.roomState = storedRoomState
      }

      if (storedRuntimeState) {
        this.runtimeState = storedRuntimeState
      }

      if (storedSessionState) {
        this.sessionState = storedSessionState
      }

      if (storedRoomState || storedRuntimeState || storedSessionState) {
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
          occupiedSeatCount: this.roomState.seats.filter((seat) => seat.playerId !== null).length,
          handEligibleSeatCount: getHandEligibleSeatIds(this.roomState.seats).length,
          actionDeadlineAt: this.runtimeState.actionDeadlineAt,
          actionSeatId: this.runtimeState.actionSeatId,
          nextHandStartAt: this.runtimeState.nextHandStartAt,
        })
      }

      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const sessionToken = parseOptionalSessionToken(url.searchParams.get('sessionToken'))
        const viewerSeatId = this.getViewerSeatIdForSessionToken(sessionToken)
        return jsonResponse(
          buildSnapshotResponse(
            this.roomState,
            viewerSeatId,
            this.runtimeState.actionDeadlineAt,
            this.runtimeState.nextHandStartAt,
          ),
        )
      }

      if (request.method === 'GET' && url.pathname === '/ws') {
        const sessionToken = parseOptionalSessionToken(url.searchParams.get('sessionToken'))
        return this.handleWebSocketUpgrade(request, sessionToken)
      }

      if (request.method === 'POST' && url.pathname === '/commands') {
        return await this.handleDispatchCommand(request)
      }

      if (request.method === 'POST' && url.pathname === '/sessions/resume') {
        return await this.handleResumeSeatSession(request)
      }

      const claimSeatMatch = request.method === 'POST'
        ? /^\/seats\/(?<seatId>\d+)\/claim$/.exec(url.pathname)
        : null

      if (claimSeatMatch?.groups?.seatId) {
        return await this.handleClaimSeat(request, Number(claimSeatMatch.groups.seatId))
      }

      const leaveSeatMatch = request.method === 'POST'
        ? /^\/seats\/(?<seatId>\d+)\/leave$/.exec(url.pathname)
        : null

      if (leaveSeatMatch?.groups?.seatId) {
        return await this.handleLeaveSeat(request, Number(leaveSeatMatch.groups.seatId))
      }

      const debugSeatMatch = request.method === 'PUT'
        ? /^\/debug\/seats\/(?<seatId>\d+)$/.exec(url.pathname)
        : null

      if (debugSeatMatch?.groups?.seatId) {
        return await this.handleUpsertSeat(request, Number(debugSeatMatch.groups.seatId))
      }

      if (request.method === 'POST' && url.pathname === '/debug/sessions') {
        return await this.handleIssueSeatSession(request)
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
      if (shouldAutoStartNextHand(this.roomState, this.runtimeState, now)) {
        const autoStarted = maybeAutoStartHand(this.roomState, now)

        if (autoStarted !== null) {
          await this.commitRoomState(autoStarted.nextState, now)
          this.broadcastSnapshots()
          return
        }
      }

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

      const session = resolveSeatSession(this.roomState, this.sessionState, parsed.sessionToken)

      if (session === null) {
        ws.serializeAttachment(createSocketAttachment(null))
        this.sendCommandRejected(ws, DEFAULT_INVALID_COMMAND_ID, 'join-room sessionToken is not valid for any occupied seat.')
        return
      }

      ws.serializeAttachment(createSocketAttachment(parsed.sessionToken))
      this.sendSnapshotToSocket(ws)
      return
    }

    if (parsed.roomId !== this.roomState.roomId) {
      this.sendCommandRejected(ws, parsed.commandId, 'player-action roomId does not match this room.')
      return
    }

    const viewerSeatId = this.getViewerSeatIdForSocket(ws)

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
    const catalogEntry = assertRoomCatalogEntry(roomId)

    if (this.roomState.roomId === roomId) {
      return
    }

    if (!isPristineRoomState(this.roomState)) {
      throw new Error(`Room id mismatch. Expected ${this.roomState.roomId}, received ${roomId}.`)
    }

    this.roomState = createInitialCatalogRoomState(catalogEntry.roomId)
    this.runtimeState = derivePokerRoomRuntimeState(this.roomState, new Date().toISOString())

    await this.persistStateBundle()
  }

  private async handleDispatchCommand(request: Request): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !('command' in payload)) {
      throw new Error('Command request body must include a command object.')
    }

    const command = payload.command as DomainCommand
    const sessionToken =
      'sessionToken' in payload && isNonEmptyString(payload.sessionToken) ? payload.sessionToken.trim() : null
    const viewerSeatId = this.getViewerSeatIdForSessionToken(sessionToken)

    if (
      (command.type === 'act' || command.type === 'timeout') &&
      sessionToken !== null &&
      viewerSeatId === null
    ) {
      throw new Error('Provided sessionToken is not valid for any occupied seat.')
    }

    if (
      (command.type === 'act' || command.type === 'timeout') &&
      viewerSeatId !== null &&
      command.seatId !== viewerSeatId
    ) {
      throw new Error('Provided sessionToken does not match the targeted seat.')
    }

    const result = dispatchDomainCommand(this.roomState, command)
    await this.commitRoomState(result.nextState)
    this.broadcastSnapshots()

    return jsonResponse(
      buildCommandResponse(
        this.roomState,
        viewerSeatId,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
        result.events,
      ),
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
    this.sessionState = revokeSeatSessions(this.sessionState, seatId)
    await this.commitRoomState(this.roomState)
    if (nextSeat.playerId !== null) {
      await this.maybeAutoStartWaitingRoomState()
    }
    this.broadcastSnapshots()

    return jsonResponse(
      buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
    )
  }

  private async handleClaimSeat(request: Request, seatId: number): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload)) {
      throw new Error('Seat claim body must be an object.')
    }

    if (!isNonEmptyString(payload.playerId)) {
      throw new Error('Seat claim body must include a non-empty playerId.')
    }

    if (!isNonNegativeInteger(payload.buyIn)) {
      throw new Error('Seat claim body must include a non-negative integer buyIn.')
    }

    const now = new Date().toISOString()
    const result = claimSeat(
      this.roomState,
      this.sessionState,
      {
        seatId,
        playerId: payload.playerId.trim(),
        displayName: isNonEmptyString(payload.displayName) ? payload.displayName.trim() : undefined,
        buyIn: payload.buyIn,
      },
      now,
    )

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    await this.maybeAutoStartWaitingRoomState(now)
    this.broadcastSnapshots()

    const response: ClaimSeatResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
      seatId: result.session.seatId,
      playerId: result.session.playerId,
      sessionToken: result.session.token,
    }

    return jsonResponse(response)
  }

  private async handleLeaveSeat(request: Request, seatId: number): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !isNonEmptyString(payload.sessionToken)) {
      throw new Error('Seat leave body must include a non-empty sessionToken.')
    }

    const now = new Date().toISOString()
    const result = leaveSeat(this.roomState, this.sessionState, payload.sessionToken.trim(), seatId, now)

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    this.broadcastSnapshots()

    const response: LeaveSeatResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        null,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
      seatId: result.seatId,
      playerId: result.playerId,
      disposition: result.disposition,
    }

    return jsonResponse(response)
  }

  private async handleResumeSeatSession(request: Request): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !isNonEmptyString(payload.sessionToken)) {
      throw new Error('Session resume body must include a non-empty sessionToken.')
    }

    const sessionToken = payload.sessionToken.trim()
    const session = resolveSeatSession(this.roomState, this.sessionState, sessionToken)

    if (session === null) {
      throw new Error('sessionToken is not valid for any occupied seat.')
    }

    const response: ResumeSeatSessionResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        session.seatId,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
      seatId: session.seatId,
      playerId: session.playerId,
      sessionToken: session.token,
      issuedAt: session.issuedAt,
    }

    return jsonResponse(response)
  }

  private async handleIssueSeatSession(request: Request): Promise<Response> {
    const payload = await request.json() as unknown

    if (!isPlainObject(payload) || !isNonNegativeInteger(payload.seatId)) {
      throw new Error('Seat session body must include a non-negative integer seatId.')
    }

    const seatId = payload.seatId

    if (seatId >= this.roomState.seats.length) {
      throw new Error(`seatId must be between 0 and ${this.roomState.seats.length - 1}.`)
    }

    const result = issueSeatSession(this.roomState, this.sessionState, seatId, new Date().toISOString())
    const viewerSeatId = result.session.seatId

    this.sessionState = result.nextState
    await this.persistSessionState()

    const response: IssueSessionResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        viewerSeatId,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
      seatId: result.session.seatId,
      playerId: result.session.playerId,
      sessionToken: result.session.token,
    }

    return jsonResponse(response)
  }

  private async handleResetRoom(): Promise<Response> {
    const catalogEntry = assertRoomCatalogEntry(this.roomState.roomId)
    const nextState = createInitialCatalogRoomState(catalogEntry.roomId)
    this.sessionState = revokeAllSeatSessions()
    await this.commitRoomState(nextState)
    this.broadcastSnapshots()

    return jsonResponse(
      buildSnapshotResponse(
        this.roomState,
        null,
        this.runtimeState.actionDeadlineAt,
        this.runtimeState.nextHandStartAt,
      ),
    )
  }

  private handleWebSocketUpgrade(request: Request, sessionToken: string | null): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new Error('WebSocket upgrade requests must include Upgrade: websocket.')
    }

    const viewerSeatId = this.getViewerSeatIdForSessionToken(sessionToken)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    server.serializeAttachment(createSocketAttachment(sessionToken))
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

  private async persistRoomState(): Promise<void> {
    await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, this.roomState)
  }

  private async persistRuntimeState(): Promise<void> {
    await this.ctx.storage.put(ROOM_RUNTIME_STORAGE_KEY, this.runtimeState)
  }

  private async persistSessionState(): Promise<void> {
    await this.ctx.storage.put(ROOM_SESSION_STORAGE_KEY, this.sessionState)
  }

  private async persistStateBundle(): Promise<void> {
    await Promise.all([
      this.persistRoomState(),
      this.persistRuntimeState(),
      this.persistSessionState(),
    ])
  }

  private async commitRoomState(nextState: InternalRoomState, now = new Date().toISOString()): Promise<void> {
    this.roomState = {
      ...nextState,
      roomVersion: this.roomState.roomVersion + 1,
      updatedAt: now,
    }
    this.runtimeState = derivePokerRoomRuntimeState(this.roomState, now)

    assertRoomStateInvariants(this.roomState)
    await this.persistStateBundle()
    await this.syncAlarmToRuntimeState()
  }

  private async maybeAutoStartWaitingRoomState(now = new Date().toISOString()): Promise<void> {
    if (!canAutoStartHandImmediately(this.roomState)) {
      return
    }

    const autoStarted = maybeAutoStartHand(this.roomState, now)

    if (autoStarted === null) {
      return
    }

    await this.commitRoomState(autoStarted.nextState, now)
  }

  private async syncAlarmToRuntimeState(): Promise<void> {
    const nextAlarmAt = getNextRuntimeAlarmAt(this.runtimeState)

    if (nextAlarmAt === null) {
      await this.ctx.storage.deleteAlarm()
      return
    }

    await this.ctx.storage.setAlarm(Date.parse(nextAlarmAt))
  }

  private sendSnapshotToSocket(ws: WebSocket): void {
    const viewerSeatId = this.getViewerSeatIdForSocket(ws)
    const message = projectRoomSnapshotMessage(this.roomState, {
      viewerSeatId,
      actionDeadlineAt: this.runtimeState.actionDeadlineAt,
      nextHandStartAt: this.runtimeState.nextHandStartAt,
    })
    this.sendSocketMessage(ws, message)
  }

  private getViewerSeatIdForSessionToken(sessionToken: string | null): SeatId | null {
    return resolveSeatSession(this.roomState, this.sessionState, sessionToken)?.seatId ?? null
  }

  private getViewerSeatIdForSocket(ws: WebSocket): SeatId | null {
    const { sessionToken } = getSocketAttachment(ws)
    return this.getViewerSeatIdForSessionToken(sessionToken)
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
