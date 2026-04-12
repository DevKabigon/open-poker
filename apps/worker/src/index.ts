import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { createEmptyPublicTableView, type PublicTableView } from '@openpoker/protocol'
import { PokerRoom } from './durable-objects/poker-room'

export interface Env {
  POKER_ROOM: DurableObjectNamespace
}

const app = new Hono<{ Bindings: Env }>()

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

app.get('/api/rooms/:roomId/state', (c) => {
  const roomId = c.req.param('roomId')
  const table: PublicTableView = createEmptyPublicTableView(roomId)

  return c.json({
    roomId,
    table,
  })
})

export default app
export { PokerRoom }
