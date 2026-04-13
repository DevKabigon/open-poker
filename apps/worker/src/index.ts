import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { PokerRoom } from './durable-objects/poker-room'

export interface Env {
  POKER_ROOM: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

function getRoomStub(env: Env, roomId: string): DurableObjectStub {
  const durableObjectId = env.POKER_ROOM.idFromName(roomId)
  return env.POKER_ROOM.get(durableObjectId)
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

app.use('*', cors())
app.use('*', prettyJSON())

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: '@openpoker/worker',
  })
})

app.get('/api/lobby/rooms', (c) => {
  return c.json({
    rooms: [],
  })
})

app.get('/api/rooms/:roomId/state', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getRoomStub(c.env, roomId)
  const viewerSeatId = c.req.query('viewerSeatId')

  return await stub.fetch(createRoomUrl('/snapshot', roomId, { viewerSeatId }))
})

app.get('/api/rooms/:roomId/ws', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getRoomStub(c.env, roomId)
  const viewerSeatId = c.req.query('viewerSeatId')

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/ws', roomId, { viewerSeatId }),
  )
})

app.post('/api/rooms/:roomId/commands', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getRoomStub(c.env, roomId)

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/commands', roomId),
  )
})

app.put('/api/rooms/:roomId/dev/seats/:seatId', async (c) => {
  const roomId = c.req.param('roomId')
  const seatId = c.req.param('seatId')
  const stub = getRoomStub(c.env, roomId)

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl(`/debug/seats/${seatId}`, roomId),
  )
})

app.post('/api/rooms/:roomId/dev/reset', async (c) => {
  const roomId = c.req.param('roomId')
  const stub = getRoomStub(c.env, roomId)

  return await forwardRoomRequest(
    stub,
    c.req.raw,
    createRoomUrl('/debug/reset', roomId),
  )
})

export default app
export { PokerRoom }
