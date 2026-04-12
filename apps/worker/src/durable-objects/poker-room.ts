import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'

interface Env {}

export class PokerRoom {
  private roomState: InternalRoomState

  constructor(ctx: DurableObjectState, env: Env) {
    void env
    this.roomState = createInitialRoomState(ctx.id.toString())
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        roomId: this.roomState.roomId,
        roomVersion: this.roomState.roomVersion,
      })
    }

    return new Response('Not Found', { status: 404 })
  }

  async alarm(): Promise<void> {
    // Placeholder for action timeout and hand scheduling logic.
  }
}
