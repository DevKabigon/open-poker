import {
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
import type { RoomSnapshotMessage } from '@openpoker/protocol'

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

const ROOM_STATE_STORAGE_KEY = 'room-state'
const DEFAULT_DEV_STACK = 10_000

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
): RoomSnapshotResponse {
  return {
    ok: true,
    roomId: state.roomId,
    roomVersion: state.roomVersion,
    snapshot: projectRoomSnapshotMessage(state, { viewerSeatId }),
  }
}

function buildCommandResponse(
  state: InternalRoomState,
  viewerSeatId: SeatId | null,
  events: DomainEvent[],
): RoomCommandResponse {
  return {
    ...buildSnapshotResponse(state, viewerSeatId),
    events,
  }
}

export class PokerRoom {
  private readonly ctx: DurableObjectState
  private roomState: InternalRoomState

  constructor(ctx: DurableObjectState, env: Env) {
    void env
    this.ctx = ctx
    this.roomState = createInitialRoomState(ctx.id.toString())

    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<InternalRoomState>(ROOM_STATE_STORAGE_KEY)

      if (stored) {
        this.roomState = stored
        return
      }

      await this.persistRoomState()
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
        })
      }

      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const viewerSeatId = parseOptionalSeatId(url.searchParams.get('viewerSeatId'))
        return jsonResponse(buildSnapshotResponse(this.roomState, viewerSeatId))
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
    // WebSocket timeouts and future automatic scheduling will live here.
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

    await this.persistRoomState()
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

    this.roomState = {
      ...result.nextState,
      roomVersion: this.roomState.roomVersion + 1,
    }

    assertRoomStateInvariants(this.roomState)
    await this.persistRoomState()

    return jsonResponse(buildCommandResponse(this.roomState, viewerSeatId, result.events))
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
    this.roomState = {
      ...this.roomState,
      roomVersion: this.roomState.roomVersion + 1,
    }

    assertRoomStateInvariants(this.roomState)
    await this.persistRoomState()

    return jsonResponse(buildSnapshotResponse(this.roomState, seatId))
  }

  private async handleResetRoom(): Promise<Response> {
    const nextState = createInitialRoomState(this.roomState.roomId)

    this.roomState = {
      ...nextState,
      roomVersion: this.roomState.roomVersion + 1,
    }

    assertRoomStateInvariants(this.roomState)
    await this.persistRoomState()

    return jsonResponse(buildSnapshotResponse(this.roomState, null))
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
}
