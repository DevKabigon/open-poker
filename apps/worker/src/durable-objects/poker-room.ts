import {
  assertRoomStateInvariants,
  dispatchDomainCommand,
  getHandEligibleSeatIds,
  type InternalRoomState,
} from '@openpoker/domain'
import {
  createEmptyPokerRoomRuntimeState,
  derivePokerRoomRuntimeState,
  getNextRuntimeAlarmAt,
  type PokerRoomRuntimeState,
} from './poker-room-timers'
import {
  createEmptyPokerRoomSessionState,
  issueSeatSession,
  resolveSeatSession,
  revokeAllSeatSessions,
  revokeSeatSessions,
  type PokerRoomSeatSession,
  type PokerRoomSessionState,
} from './poker-room-sessions'
import {
  claimSeat,
  leaveSeat,
  setSitOutNextHand,
  sitInSeat,
} from './poker-room-seating'
import {
  markSeatDisconnected,
  restoreSeatConnection,
} from './poker-room-disconnect'
import { resolvePokerRoomAlarm } from './poker-room-alarm'
import {
  buildCommandResponse,
  buildSnapshotResponse,
  createSocketAttachment,
  errorResponse,
  hasHandCompletionEvent,
  isPristineRoomState,
  isTruthyEnvFlag,
  jsonResponse,
  type ClaimSeatResponse,
  type IssueSessionResponse,
  type LeaveSeatResponse,
  type ResumeSeatSessionResponse,
  type SetShowdownRevealPreferenceResponse,
  type SetSitOutNextHandResponse,
  type SitInSeatResponse,
} from './poker-room-transport'
import {
  assertSeatIdInRange,
  createDebugSeatUpdate,
  ensureSeatManagementAllowed,
  parseClaimSeatRequest,
  parseDispatchCommandRequest,
  parseIssueSeatSessionRequest,
  parseSessionTokenRequest,
  parseShowdownRevealPreferenceRequest,
  parseSitOutNextHandRequest,
  parseUpsertSeatRequest,
  resolvePokerRoomHttpRequest,
} from './poker-room-http'
import {
  acceptRoomWebSocket,
  broadcastRoomSnapshots,
  closeSocket,
  getSocketSessionToken,
  getViewerSeatIdForSessionToken,
  getViewerSeatIdForSocket,
  hasOpenSocketForSessionToken,
  resolvePokerRoomSocketMessage,
  sendCommandAck,
  sendCommandRejected,
  sendRoomSnapshotToSocket,
} from './poker-room-socket'
import { assertRoomCatalogEntry, createInitialCatalogRoomState } from '../rooms/catalog'

interface Env {
  OPEN_POKER_MANUAL_NEXT_HAND?: string
}

const ROOM_STATE_STORAGE_KEY = 'room-state'
const ROOM_RUNTIME_STORAGE_KEY = 'room-runtime'
const ROOM_SESSION_STORAGE_KEY = 'room-sessions'

export class PokerRoom {
  private readonly ctx: DurableObjectState
  private readonly scheduleNextHand: boolean
  private roomState: InternalRoomState
  private runtimeState: PokerRoomRuntimeState
  private sessionState: PokerRoomSessionState

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.scheduleNextHand = !isTruthyEnvFlag(env.OPEN_POKER_MANUAL_NEXT_HAND)
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
        this.runtimeState = derivePokerRoomRuntimeState(
          this.roomState,
          new Date().toISOString(),
          storedRuntimeState ?? null,
          { scheduleNextHand: this.scheduleNextHand },
        )
        await this.persistRuntimeState()

        await this.syncAlarmToRuntimeState()
        return
      }

      await this.persistStateBundle()
    })
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const target = resolvePokerRoomHttpRequest(request)

      await this.ensureRoomId(target.roomId)

      switch (target.route.type) {
        case 'health':
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
        case 'snapshot': {
          const viewerSeatId = getViewerSeatIdForSessionToken(
            this.roomState,
            this.sessionState,
            target.route.sessionToken,
          )
          return jsonResponse(buildSnapshotResponse(this.roomState, viewerSeatId, this.runtimeState))
        }
        case 'websocket':
          return await this.handleWebSocketUpgrade(request, target.route.sessionToken)
        case 'dispatch-command':
          return await this.handleDispatchCommand(request)
        case 'resume-session':
          return await this.handleResumeSeatSession(request)
        case 'claim-seat':
          return await this.handleClaimSeat(request, target.route.seatId)
        case 'leave-seat':
          return await this.handleLeaveSeat(request, target.route.seatId)
        case 'sit-out-next-hand':
          return await this.handleSetSitOutNextHand(request, target.route.seatId)
        case 'sit-in-seat':
          return await this.handleSitInSeat(request, target.route.seatId)
        case 'showdown-reveal':
          return await this.handleSetShowdownRevealPreference(request, target.route.seatId)
        case 'debug-upsert-seat':
          return await this.handleUpsertSeat(request, target.route.seatId)
        case 'debug-issue-session':
          return await this.handleIssueSeatSession(request)
        case 'debug-reset':
          return await this.handleResetRoom()
        case 'not-found':
          return new Response('Not Found', { status: 404 })
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown PokerRoom error.'
      return errorResponse(400, reason)
    }
  }

  async alarm(): Promise<void> {
    const now = new Date().toISOString()
    const resolution = resolvePokerRoomAlarm({
      roomState: this.roomState,
      runtimeState: this.runtimeState,
      now,
      scheduleNextHand: this.scheduleNextHand,
    })

    if (resolution.type === 'sync-only') {
      await this.syncAlarmToRuntimeState()
      return
    }

    await this.commitRoomState(resolution.nextState, now, {
      settledHandJustCompleted: resolution.settledHandJustCompleted,
    })
    this.broadcastSnapshots()
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const resolution = resolvePokerRoomSocketMessage({
      roomState: this.roomState,
      sessionState: this.sessionState,
      viewerSeatId: getViewerSeatIdForSocket(ws, this.roomState, this.sessionState),
      message,
      now: new Date().toISOString(),
    })

    if (resolution.type === 'reject') {
      if ('socketSessionToken' in resolution) {
        ws.serializeAttachment(createSocketAttachment(resolution.socketSessionToken ?? null))
      }

      sendCommandRejected(ws, resolution.commandId, resolution.reason)
      return
    }

    if (resolution.type === 'join-room') {
      ws.serializeAttachment(createSocketAttachment(resolution.sessionToken))
      const restored = await this.restoreSeatConnectionForSession(resolution.session, new Date().toISOString())

      if (restored) {
        this.broadcastSnapshots()
      } else {
        sendRoomSnapshotToSocket(ws, this.roomState, this.sessionState, this.runtimeState)
      }
      return
    }

    await this.commitRoomState(resolution.nextState, undefined, {
      settledHandJustCompleted: resolution.settledHandJustCompleted,
    })
    sendCommandAck(ws, resolution.commandId, this.roomState.roomVersion)
    this.broadcastSnapshots()
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.markSocketSessionDisconnectedIfNeeded(ws)
    closeSocket(ws, 1000, 'Connection closed.')
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : 'Unknown WebSocket error.'

    await this.markSocketSessionDisconnectedIfNeeded(ws)
    closeSocket(ws, 1011, reason.slice(0, 123))
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
    const { command, sessionToken } = await parseDispatchCommandRequest(request)
    const viewerSeatId = getViewerSeatIdForSessionToken(this.roomState, this.sessionState, sessionToken)

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

    const result = dispatchDomainCommand(
      this.roomState,
      command,
      {
        deferAutomaticProgression: command.type === 'act' || command.type === 'timeout',
      },
    )
    await this.commitRoomState(result.nextState, undefined, {
      settledHandJustCompleted: hasHandCompletionEvent(result.events),
    })
    this.broadcastSnapshots()

    return jsonResponse(
      buildCommandResponse(
        this.roomState,
        viewerSeatId,
        this.runtimeState,
        result.events,
      ),
    )
  }

  private async handleUpsertSeat(request: Request, seatId: number): Promise<Response> {
    ensureSeatManagementAllowed(this.roomState)
    assertSeatIdInRange(seatId, this.roomState.seats.length)

    const payload = await parseUpsertSeatRequest(request)
    const currentSeat = this.roomState.seats[seatId]!
    const nextSeat = createDebugSeatUpdate(currentSeat, seatId, payload)

    this.roomState.seats[seatId] = nextSeat
    this.sessionState = revokeSeatSessions(this.sessionState, seatId)
    await this.commitRoomState(this.roomState)
    this.broadcastSnapshots()

    return jsonResponse(
      buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState,
      ),
    )
  }

  private async handleClaimSeat(request: Request, seatId: number): Promise<Response> {
    const payload = await parseClaimSeatRequest(request)
    const now = new Date().toISOString()
    const result = claimSeat(
      this.roomState,
      this.sessionState,
      {
        seatId,
        playerId: payload.playerId,
        displayName: payload.displayName,
        buyIn: payload.buyIn,
      },
      now,
    )

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    this.broadcastSnapshots()

    const response: ClaimSeatResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState,
      ),
      seatId: result.session.seatId,
      playerId: result.session.playerId,
      sessionToken: result.session.token,
    }

    return jsonResponse(response)
  }

  private async handleLeaveSeat(request: Request, seatId: number): Promise<Response> {
    const payload = await parseSessionTokenRequest(request, 'Seat leave body must include a non-empty sessionToken.')
    const now = new Date().toISOString()
    const result = leaveSeat(this.roomState, this.sessionState, payload.sessionToken, seatId, now)

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    this.broadcastSnapshots()

    const response: LeaveSeatResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        null,
        this.runtimeState,
      ),
      seatId: result.seatId,
      playerId: result.playerId,
      disposition: result.disposition,
    }

    return jsonResponse(response)
  }

  private async handleSetSitOutNextHand(request: Request, seatId: number): Promise<Response> {
    const payload = await parseSitOutNextHandRequest(request)
    const now = new Date().toISOString()
    const result = setSitOutNextHand(
      this.roomState,
      this.sessionState,
      payload.sessionToken,
      seatId,
      payload.sitOutNextHand,
      now,
    )

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    this.broadcastSnapshots()

    const seat = this.roomState.seats[seatId]!
    const response: SetSitOutNextHandResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState,
      ),
      seatId: result.seatId,
      playerId: result.playerId,
      isSittingOut: seat.isSittingOut,
      isSittingOutNextHand: seat.isSittingOutNextHand,
    }

    return jsonResponse(response)
  }

  private async handleSitInSeat(request: Request, seatId: number): Promise<Response> {
    const payload = await parseSessionTokenRequest(request, 'Sit-in request body must include a non-empty sessionToken.')
    const now = new Date().toISOString()
    const result = sitInSeat(this.roomState, this.sessionState, payload.sessionToken, seatId, now)

    this.sessionState = result.nextSessionState
    await this.commitRoomState(result.nextRoomState, now)
    this.broadcastSnapshots()

    const seat = this.roomState.seats[seatId]!
    const response: SitInSeatResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState,
      ),
      seatId: result.seatId,
      playerId: result.playerId,
      isSittingOut: seat.isSittingOut,
      isSittingOutNextHand: seat.isSittingOutNextHand,
    }

    return jsonResponse(response)
  }

  private async handleSetShowdownRevealPreference(request: Request, seatId: number): Promise<Response> {
    const payload = await parseShowdownRevealPreferenceRequest(request)
    assertSeatIdInRange(seatId, this.roomState.seats.length)

    const sessionToken = payload.sessionToken
    const session = resolveSeatSession(this.roomState, this.sessionState, sessionToken)

    if (session === null) {
      throw new Error('sessionToken is not valid for any occupied seat.')
    }

    if (session.seatId !== seatId) {
      throw new Error('sessionToken does not match the targeted seat.')
    }

    this.roomState.seats[seatId] = {
      ...this.roomState.seats[seatId]!,
      showCardsAtShowdown: payload.showCardsAtShowdown,
    }

    await this.commitRoomState(this.roomState)
    this.broadcastSnapshots()

    const response: SetShowdownRevealPreferenceResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        seatId,
        this.runtimeState,
      ),
      seatId,
      playerId: session.playerId,
      showCardsAtShowdown: payload.showCardsAtShowdown,
    }

    return jsonResponse(response)
  }

  private async handleResumeSeatSession(request: Request): Promise<Response> {
    const payload = await parseSessionTokenRequest(request, 'Session resume body must include a non-empty sessionToken.')
    const sessionToken = payload.sessionToken
    const session = resolveSeatSession(this.roomState, this.sessionState, sessionToken)

    if (session === null) {
      throw new Error('sessionToken is not valid for any occupied seat.')
    }

    const restored = await this.restoreSeatConnectionForSession(session, new Date().toISOString())

    if (restored) {
      this.broadcastSnapshots()
    }

    const response: ResumeSeatSessionResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        session.seatId,
        this.runtimeState,
      ),
      seatId: session.seatId,
      playerId: session.playerId,
      sessionToken: session.token,
      issuedAt: session.issuedAt,
    }

    return jsonResponse(response)
  }

  private async handleIssueSeatSession(request: Request): Promise<Response> {
    const { seatId } = await parseIssueSeatSessionRequest(request)
    assertSeatIdInRange(seatId, this.roomState.seats.length)

    const result = issueSeatSession(this.roomState, this.sessionState, seatId, new Date().toISOString())
    const viewerSeatId = result.session.seatId

    this.sessionState = result.nextState
    await this.persistSessionState()

    const response: IssueSessionResponse = {
      ...buildSnapshotResponse(
        this.roomState,
        viewerSeatId,
        this.runtimeState,
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
        this.runtimeState,
      ),
    )
  }

  private async handleWebSocketUpgrade(request: Request, sessionToken: string | null): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      throw new Error('WebSocket upgrade requests must include Upgrade: websocket.')
    }

    let viewerSeatId = getViewerSeatIdForSessionToken(this.roomState, this.sessionState, sessionToken)
    const session = resolveSeatSession(this.roomState, this.sessionState, sessionToken)

    if (session !== null) {
      const restored = await this.restoreSeatConnectionForSession(session, new Date().toISOString())
      viewerSeatId = session.seatId

      if (restored) {
        this.broadcastSnapshots()
      }
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    acceptRoomWebSocket(this.ctx, server, sessionToken, viewerSeatId)
    sendRoomSnapshotToSocket(server, this.roomState, this.sessionState, this.runtimeState)

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private async markSeatDisconnectedForSession(
    session: PokerRoomSeatSession,
    now: string,
  ): Promise<boolean> {
    const nextState = markSeatDisconnected(this.roomState, session.seatId, now)

    if (nextState === this.roomState) {
      return false
    }

    await this.commitRoomState(nextState, now)
    return true
  }

  private async restoreSeatConnectionForSession(
    session: PokerRoomSeatSession,
    now: string,
  ): Promise<boolean> {
    const nextState = restoreSeatConnection(this.roomState, session.seatId, now)

    if (nextState === this.roomState) {
      return false
    }

    await this.commitRoomState(nextState, now)
    return true
  }

  private async markSocketSessionDisconnectedIfNeeded(ws: WebSocket): Promise<void> {
    const sessionToken = getSocketSessionToken(ws)

    if (
      sessionToken === null ||
      hasOpenSocketForSessionToken(this.ctx.getWebSockets(), sessionToken, ws)
    ) {
      return
    }

    const session = resolveSeatSession(this.roomState, this.sessionState, sessionToken)

    if (session === null) {
      return
    }

    const disconnected = await this.markSeatDisconnectedForSession(session, new Date().toISOString())

    if (disconnected) {
      this.broadcastSnapshots()
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

  private async commitRoomState(
    nextState: InternalRoomState,
    now = new Date().toISOString(),
    options: { settledHandJustCompleted?: boolean } = {},
  ): Promise<void> {
    this.roomState = {
      ...nextState,
      roomVersion: this.roomState.roomVersion + 1,
      updatedAt: now,
    }
    this.runtimeState = derivePokerRoomRuntimeState(
      this.roomState,
      now,
      this.runtimeState,
      {
        scheduleNextHand: this.scheduleNextHand,
        settledHandJustCompleted: options.settledHandJustCompleted,
      },
    )

    assertRoomStateInvariants(this.roomState)
    await this.persistStateBundle()
    await this.syncAlarmToRuntimeState()
  }

  private async syncAlarmToRuntimeState(): Promise<void> {
    const nextAlarmAt = getNextRuntimeAlarmAt(this.runtimeState)

    if (nextAlarmAt === null) {
      await this.ctx.storage.deleteAlarm()
      return
    }

    await this.ctx.storage.setAlarm(Date.parse(nextAlarmAt))
  }

  private broadcastSnapshots(): void {
    broadcastRoomSnapshots(this.ctx.getWebSockets(), this.roomState, this.sessionState, this.runtimeState)
  }
}
