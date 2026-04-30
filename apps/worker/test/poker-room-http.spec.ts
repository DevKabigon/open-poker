import { describe, expect, it } from 'vitest'
import { OPEN_POKER_AUTH_USER_ID_HEADER } from '../src/auth/supabase-auth'
import { resolveClaimSeatPlayerId } from '../src/durable-objects/poker-room-http'

describe('poker room HTTP helpers', () => {
  it('uses the request body player id for anonymous seat claims', () => {
    const request = new Request('https://poker-room/seats/0/claim?roomId=room-1', {
      method: 'POST',
    })

    expect(resolveClaimSeatPlayerId(request, {
      playerId: 'anonymous-player',
      buyIn: 10_000,
    })).toBe('anonymous-player')
  })

  it('uses the forwarded Supabase user id for authenticated seat claims', () => {
    const request = new Request('https://poker-room/seats/0/claim?roomId=room-1', {
      method: 'POST',
      headers: {
        [OPEN_POKER_AUTH_USER_ID_HEADER]: 'supabase-user-123',
      },
    })

    expect(resolveClaimSeatPlayerId(request, {
      playerId: 'client-controlled-player',
      buyIn: 10_000,
    })).toBe('supabase-user-123')
  })
})
