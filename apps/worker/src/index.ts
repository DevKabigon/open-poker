import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import type { LobbyRoomView, TableHandStatus, TableStreet } from '@openpoker/protocol'
import { PokerRoom } from './durable-objects/poker-room'
import { getRoomCatalog, getRoomCatalogEntry, type RoomCatalogEntry } from './rooms/catalog'

export interface Env {
  POKER_ROOM: DurableObjectNamespace
  OPEN_POKER_MANUAL_NEXT_HAND?: string
}

const app = new Hono<{ Bindings: Env }>()

function getRoomStub(env: Env, roomId: string): DurableObjectStub {
  const durableObjectId = env.POKER_ROOM.idFromName(roomId)
  return env.POKER_ROOM.get(durableObjectId)
}

function getKnownRoomStub(env: Env, roomId: string): DurableObjectStub | null {
  if (!getRoomCatalogEntry(roomId)) {
    return null
  }

  return getRoomStub(env, roomId)
}

function roomNotFoundResponse(roomId: string): Response {
  return Response.json(
    {
      ok: false,
      reason: `Unknown roomId ${roomId}.`,
    },
    { status: 404 },
  )
}

function createRoomUrl(pathname: string, roomId: string, query: Record<string, string | null | undefined> = {}): URL {
  const url = new URL(`https://poker-room${pathname}`)
  url.searchParams.set('roomId', roomId)

  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value.length > 0) {
      url.searchParams.set(key, value)
    }
  }

  return url
}

async function forwardRoomRequest(
  stub: DurableObjectStub,
  request: Request,
  url: URL,
): Promise<Response> {
  return await stub.fetch(
    new Request(url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' ? undefined : await request.text(),
    }),
  )
}

interface RoomHealthResponse {
  ok: true
  roomId: string
  roomVersion: number
  handStatus: TableHandStatus
  street: TableStreet
  occupiedSeatCount: number
  handEligibleSeatCount: number
  actionDeadlineAt: string | null
  actionSeatId: number | null
  nextHandStartAt: string | null
}

function createLobbyRoomView(entry: RoomCatalogEntry, health: RoomHealthResponse | null): LobbyRoomView {
  return {
    roomId: entry.roomId,
    stakeKey: entry.stakeKey,
    tableNumber: entry.tableNumber,
    displayName: entry.displayName,
    smallBlind: entry.smallBlind,
    bigBlind: entry.bigBlind,
    minBuyIn: entry.minBuyIn,
    maxBuyIn: entry.maxBuyIn,
    maxSeats: entry.maxSeats,
    occupiedSeatCount: health?.occupiedSeatCount ?? 0,
    handEligibleSeatCount: health?.handEligibleSeatCount ?? 0,
    roomVersion: health?.roomVersion ?? 0,
    handStatus: health?.handStatus ?? 'waiting',
    street: health?.street ?? 'idle',
    nextHandStartAt: health?.nextHandStartAt ?? null,
  }
}

async function fetchRoomHealth(env: Env, roomId: string): Promise<RoomHealthResponse | null> {
  const response = await getRoomStub(env, roomId).fetch(createRoomUrl('/health', roomId))

  if (!response.ok) {
    return null
  }

  const payload = await response.json() as unknown

  if (typeof payload !== 'object' || payload === null || !('ok' in payload)) {
    return null
  }

  return payload as RoomHealthResponse
}

app.use('*', cors())
app.use('*', prettyJSON())

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: '@openpoker/worker',
  })
})

app.get('/api/lobby/rooms', async (c) => {
  const catalog = getRoomCatalog()
  const healthByRoomId = await Promise.all(
    catalog.map(async (entry) => [entry.roomId, await fetchRoomHealth(c.env, entry.roomId)] as const),
  )
  const healthMap = new Map(healthByRoomId)

  return c.json({
    rooms: catalog.map((entry) => createLobbyRoomView(entry, healthMap.get(entry.roomId) ?? null)),
  })
})

app.get('/api/rooms/:roomId/state', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)
  const sessionToken = c.req.query('sessionToken')

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await stub.fetch(createRoomUrl('/snapshot', roomId, { sessionToken }))
})

app.get('/api/rooms/:roomId/ws', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)
  const sessionToken = c.req.query('sessionToken')

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/ws', roomId, { sessionToken }),
  )
})

app.post('/api/rooms/:roomId/commands', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/commands', roomId),
  )
})

app.post('/api/rooms/:roomId/sessions/resume', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/sessions/resume', roomId),
  )
})

app.post('/api/rooms/:roomId/seats/:seatId/claim', async (c) => {
  const roomId = c.req.param('roomId')
  const seatId = c.req.param('seatId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl(`/seats/${seatId}/claim`, roomId),
  )
})

app.post('/api/rooms/:roomId/seats/:seatId/leave', async (c) => {
  const roomId = c.req.param('roomId')
  const seatId = c.req.param('seatId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl(`/seats/${seatId}/leave`, roomId),
  )
})

app.post('/api/rooms/:roomId/seats/:seatId/showdown-reveal', async (c) => {
  const roomId = c.req.param('roomId')
  const seatId = c.req.param('seatId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl(`/seats/${seatId}/showdown-reveal`, roomId),
  )
})

app.put('/api/rooms/:roomId/dev/seats/:seatId', async (c) => {
  const roomId = c.req.param('roomId')
  const seatId = c.req.param('seatId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl(`/debug/seats/${seatId}`, roomId),
  )
})

app.post('/api/rooms/:roomId/dev/sessions', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/debug/sessions', roomId),
  )
})

app.post('/api/rooms/:roomId/dev/reset', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getKnownRoomStub(c.env, roomId)

  if (!stub) {
    return roomNotFoundResponse(roomId)
  }

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/debug/reset', roomId),
  )
})

export default app
export { PokerRoom }
