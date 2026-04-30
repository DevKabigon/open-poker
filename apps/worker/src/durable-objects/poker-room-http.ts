import {
  createEmptySeatState,
  type DomainCommand,
  type InternalRoomState,
  type SeatId,
} from '@openpoker/domain'
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isPlainObject,
  parseOptionalSessionToken,
  type UpsertSeatRequest,
} from './poker-room-transport'

const DEFAULT_DEV_STACK = 10_000

export interface DispatchCommandRequestBody {
  command: DomainCommand
  sessionToken: string | null
}

export interface ClaimSeatRequestBody {
  playerId: string
  displayName?: string
  buyIn: number
}

export interface SessionTokenRequestBody {
  sessionToken: string
}

export interface SitOutNextHandRequestBody extends SessionTokenRequestBody {
  sitOutNextHand: boolean
}

export interface ShowdownRevealPreferenceRequestBody extends SessionTokenRequestBody {
  showCardsAtShowdown: boolean
}

export interface IssueSeatSessionRequestBody {
  seatId: SeatId
}

export type PokerRoomHttpRoute =
  | { type: 'health' }
  | { type: 'snapshot'; sessionToken: string | null }
  | { type: 'websocket'; sessionToken: string | null }
  | { type: 'dispatch-command' }
  | { type: 'resume-session' }
  | { type: 'claim-seat'; seatId: SeatId }
  | { type: 'leave-seat'; seatId: SeatId }
  | { type: 'sit-out-next-hand'; seatId: SeatId }
  | { type: 'sit-in-seat'; seatId: SeatId }
  | { type: 'showdown-reveal'; seatId: SeatId }
  | { type: 'debug-upsert-seat'; seatId: SeatId }
  | { type: 'debug-issue-session' }
  | { type: 'debug-reset' }
  | { type: 'not-found' }

export interface PokerRoomHttpRequestTarget {
  roomId: string
  route: PokerRoomHttpRoute
}

function matchSeatRoute(pathname: string, suffix: string): SeatId | null {
  const match = new RegExp(`^/seats/(?<seatId>\\d+)/${suffix}$`).exec(pathname)

  return match?.groups?.seatId ? Number(match.groups.seatId) : null
}

function matchDebugSeatRoute(pathname: string): SeatId | null {
  const match = /^\/debug\/seats\/(?<seatId>\d+)$/.exec(pathname)

  return match?.groups?.seatId ? Number(match.groups.seatId) : null
}

export function resolvePokerRoomHttpRequest(request: Request): PokerRoomHttpRequestTarget {
  const url = new URL(request.url)
  const roomId = url.searchParams.get('roomId')

  if (!roomId || roomId.trim().length === 0) {
    throw new Error('roomId query parameter is required.')
  }

  const method = request.method
  const pathname = url.pathname

  if (method === 'GET' && pathname === '/health') {
    return { roomId: roomId.trim(), route: { type: 'health' } }
  }

  if (method === 'GET' && pathname === '/snapshot') {
    return {
      roomId: roomId.trim(),
      route: {
        type: 'snapshot',
        sessionToken: parseOptionalSessionToken(url.searchParams.get('sessionToken')),
      },
    }
  }

  if (method === 'GET' && pathname === '/ws') {
    return {
      roomId: roomId.trim(),
      route: {
        type: 'websocket',
        sessionToken: parseOptionalSessionToken(url.searchParams.get('sessionToken')),
      },
    }
  }

  if (method === 'POST' && pathname === '/commands') {
    return { roomId: roomId.trim(), route: { type: 'dispatch-command' } }
  }

  if (method === 'POST' && pathname === '/sessions/resume') {
    return { roomId: roomId.trim(), route: { type: 'resume-session' } }
  }

  if (method === 'POST') {
    const claimSeatId = matchSeatRoute(pathname, 'claim')

    if (claimSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'claim-seat', seatId: claimSeatId } }
    }

    const leaveSeatId = matchSeatRoute(pathname, 'leave')

    if (leaveSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'leave-seat', seatId: leaveSeatId } }
    }

    const sitOutNextHandSeatId = matchSeatRoute(pathname, 'sit-out-next-hand')

    if (sitOutNextHandSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'sit-out-next-hand', seatId: sitOutNextHandSeatId } }
    }

    const sitInSeatId = matchSeatRoute(pathname, 'sit-in')

    if (sitInSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'sit-in-seat', seatId: sitInSeatId } }
    }

    const showdownRevealSeatId = matchSeatRoute(pathname, 'showdown-reveal')

    if (showdownRevealSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'showdown-reveal', seatId: showdownRevealSeatId } }
    }

    if (pathname === '/debug/sessions') {
      return { roomId: roomId.trim(), route: { type: 'debug-issue-session' } }
    }

    if (pathname === '/debug/reset') {
      return { roomId: roomId.trim(), route: { type: 'debug-reset' } }
    }
  }

  if (method === 'PUT') {
    const debugSeatId = matchDebugSeatRoute(pathname)

    if (debugSeatId !== null) {
      return { roomId: roomId.trim(), route: { type: 'debug-upsert-seat', seatId: debugSeatId } }
    }
  }

  return { roomId: roomId.trim(), route: { type: 'not-found' } }
}

async function readJsonObject(request: Request, reason: string): Promise<Record<string, unknown>> {
  const payload = await request.json() as unknown

  if (!isPlainObject(payload)) {
    throw new Error(reason)
  }

  return payload
}

function readSessionToken(payload: Record<string, unknown>, reason: string): string {
  if (!isNonEmptyString(payload.sessionToken)) {
    throw new Error(reason)
  }

  return payload.sessionToken.trim()
}

export function assertSeatIdInRange(seatId: number, seatCount: number): asserts seatId is SeatId {
  if (!Number.isInteger(seatId) || seatId < 0 || seatId >= seatCount) {
    throw new Error(`seatId must be between 0 and ${seatCount - 1}.`)
  }
}

export function ensureSeatManagementAllowed(state: InternalRoomState): void {
  if (state.handStatus === 'in-hand' || state.handStatus === 'showdown') {
    throw new Error('Seat updates are disabled while a hand is actively running.')
  }
}

export async function parseDispatchCommandRequest(request: Request): Promise<DispatchCommandRequestBody> {
  const payload = await readJsonObject(request, 'Command request body must include a command object.')

  if (!('command' in payload)) {
    throw new Error('Command request body must include a command object.')
  }

  return {
    command: payload.command as DomainCommand,
    sessionToken:
      'sessionToken' in payload && isNonEmptyString(payload.sessionToken)
        ? payload.sessionToken.trim()
        : null,
  }
}

export async function parseUpsertSeatRequest(request: Request): Promise<UpsertSeatRequest> {
  const payload = await readJsonObject(request, 'Seat update body must include playerId.')

  if (!('playerId' in payload)) {
    throw new Error('Seat update body must include playerId.')
  }

  return payload as unknown as UpsertSeatRequest
}

export async function parseClaimSeatRequest(request: Request): Promise<ClaimSeatRequestBody> {
  const payload = await readJsonObject(request, 'Seat claim body must be an object.')

  if (!isNonEmptyString(payload.playerId)) {
    throw new Error('Seat claim body must include a non-empty playerId.')
  }

  if (!isNonNegativeInteger(payload.buyIn)) {
    throw new Error('Seat claim body must include a non-negative integer buyIn.')
  }

  return {
    playerId: payload.playerId.trim(),
    displayName: isNonEmptyString(payload.displayName) ? payload.displayName.trim() : undefined,
    buyIn: payload.buyIn,
  }
}

export async function parseSessionTokenRequest(
  request: Request,
  reason: string,
): Promise<SessionTokenRequestBody> {
  const payload = await readJsonObject(request, reason)

  return {
    sessionToken: readSessionToken(payload, reason),
  }
}

export async function parseSitOutNextHandRequest(request: Request): Promise<SitOutNextHandRequestBody> {
  const reason = 'Sit-out request body must include sessionToken and sitOutNextHand.'
  const payload = await readJsonObject(request, reason)

  if (typeof payload.sitOutNextHand !== 'boolean') {
    throw new Error(reason)
  }

  return {
    sessionToken: readSessionToken(payload, reason),
    sitOutNextHand: payload.sitOutNextHand,
  }
}

export async function parseShowdownRevealPreferenceRequest(
  request: Request,
): Promise<ShowdownRevealPreferenceRequestBody> {
  const reason = 'Showdown reveal body must include sessionToken and showCardsAtShowdown.'
  const payload = await readJsonObject(request, reason)

  if (typeof payload.showCardsAtShowdown !== 'boolean') {
    throw new Error(reason)
  }

  return {
    sessionToken: readSessionToken(payload, reason),
    showCardsAtShowdown: payload.showCardsAtShowdown,
  }
}

export async function parseIssueSeatSessionRequest(request: Request): Promise<IssueSeatSessionRequestBody> {
  const payload = await readJsonObject(request, 'Seat session body must include a non-negative integer seatId.')

  if (!isNonNegativeInteger(payload.seatId)) {
    throw new Error('Seat session body must include a non-negative integer seatId.')
  }

  return {
    seatId: payload.seatId,
  }
}

export function createDebugSeatUpdate(
  currentSeat: InternalRoomState['seats'][number],
  seatId: SeatId,
  payload: UpsertSeatRequest,
): InternalRoomState['seats'][number] {
  if (payload.playerId === null) {
    return createEmptySeatState(seatId)
  }

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

  if (payload.isSittingOutNextHand !== undefined && typeof payload.isSittingOutNextHand !== 'boolean') {
    throw new Error('isSittingOutNextHand must be a boolean when provided.')
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
    isSittingOutNextHand: payload.isSittingOutNextHand ?? currentSeat.isSittingOutNextHand,
    isDisconnected: payload.isDisconnected ?? currentSeat.isDisconnected,
  }
}
