import type {
  ApiErrorResponse,
  ClaimSeatRequest,
  ClaimSeatResponse,
  LeaveSeatRequest,
  LeaveSeatResponse,
  LobbyRoomsResponse,
  ResumeSeatSessionRequest,
  ResumeSeatSessionResponse,
  RoomCommandRequest,
  RoomCommandResponse,
  RoomSnapshotResponse,
  SetShowdownRevealPreferenceRequest,
  SetShowdownRevealPreferenceResponse,
} from '@openpoker/protocol'

const DEFAULT_API_BASE_URL = 'http://localhost:8787'

export class OpenPokerApiError extends Error {
  readonly status: number
  readonly reason: string
  readonly payload: unknown

  constructor(status: number, reason: string, payload: unknown) {
    super(reason)
    this.name = 'OpenPokerApiError'
    this.status = status
    this.reason = reason
    this.payload = payload
  }
}

export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : DEFAULT_API_BASE_URL

  return baseUrl.replace(/\/+$/, '')
}

export function createRoomWebSocket(roomId: string, sessionToken?: string): WebSocket {
  const url = buildApiUrl(`/api/rooms/${encodeURIComponent(roomId)}/ws`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'

  if (sessionToken && sessionToken.length > 0) {
    url.searchParams.set('sessionToken', sessionToken)
  }

  return new WebSocket(url)
}

export async function fetchLobbyRooms(): Promise<LobbyRoomsResponse> {
  return await requestJson<LobbyRoomsResponse>('/api/lobby/rooms')
}

export async function fetchRoomState(roomId: string, sessionToken?: string): Promise<RoomSnapshotResponse> {
  const url = buildRoomPath(roomId, '/state')

  if (sessionToken && sessionToken.length > 0) {
    url.searchParams.set('sessionToken', sessionToken)
  }

  return await requestJson<RoomSnapshotResponse>(url)
}

export async function claimSeat(
  roomId: string,
  seatId: number,
  request: ClaimSeatRequest,
): Promise<ClaimSeatResponse> {
  return await requestJson<ClaimSeatResponse>(
    buildRoomPath(roomId, `/seats/${seatId}/claim`),
    createJsonPostInit(request),
  )
}

export async function resumeSeatSession(
  roomId: string,
  request: ResumeSeatSessionRequest,
): Promise<ResumeSeatSessionResponse> {
  return await requestJson<ResumeSeatSessionResponse>(
    buildRoomPath(roomId, '/sessions/resume'),
    createJsonPostInit(request),
  )
}

export async function leaveSeat(
  roomId: string,
  seatId: number,
  request: LeaveSeatRequest,
): Promise<LeaveSeatResponse> {
  return await requestJson<LeaveSeatResponse>(
    buildRoomPath(roomId, `/seats/${seatId}/leave`),
    createJsonPostInit(request),
  )
}

export async function setShowdownRevealPreference(
  roomId: string,
  seatId: number,
  request: SetShowdownRevealPreferenceRequest,
): Promise<SetShowdownRevealPreferenceResponse> {
  return await requestJson<SetShowdownRevealPreferenceResponse>(
    buildRoomPath(roomId, `/seats/${seatId}/showdown-reveal`),
    createJsonPostInit(request),
  )
}

export async function resetRoom(roomId: string): Promise<RoomSnapshotResponse> {
  return await requestJson<RoomSnapshotResponse>(
    buildRoomPath(roomId, '/dev/reset'),
    createJsonPostInit({}),
  )
}

export async function dispatchRoomCommand(
  roomId: string,
  request: RoomCommandRequest,
): Promise<RoomCommandResponse> {
  return await requestJson<RoomCommandResponse>(
    buildRoomPath(roomId, '/commands'),
    createJsonPostInit(request),
  )
}

function buildRoomPath(roomId: string, suffix: string): URL {
  return buildApiUrl(`/api/rooms/${encodeURIComponent(roomId)}${suffix}`)
}

function buildApiUrl(path: string): URL {
  const normalizedPath = path.replace(/^\/+/, '')

  return new URL(normalizedPath, `${getApiBaseUrl()}/`)
}

function createJsonPostInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
  }
}

async function requestJson<T>(pathOrUrl: string | URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const input = typeof pathOrUrl === 'string' ? buildApiUrl(pathOrUrl) : pathOrUrl

  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  return await parseJsonResponse<T>(response)
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as unknown

  if (!response.ok) {
    const reason = isApiErrorResponse(payload)
      ? payload.reason
      : `OpenPoker request failed with status ${response.status}.`

    throw new OpenPokerApiError(response.status, reason, payload)
  }

  return payload as T
}

function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  return (
    typeof payload === 'object'
    && payload !== null
    && 'ok' in payload
    && payload.ok === false
    && 'reason' in payload
    && typeof payload.reason === 'string'
  )
}
