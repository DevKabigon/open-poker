import { describe, expect, it } from 'vitest'
import {
  OPEN_POKER_AUTH_ROLE_HEADER,
  OPEN_POKER_AUTH_SESSION_ID_HEADER,
  OPEN_POKER_AUTH_USER_ID_HEADER,
  SupabaseAuthError,
  createForwardedRoomRequestHeaders,
  readBearerToken,
  readForwardedAuthUserId,
  resolveSupabaseAuthContext,
} from '../src/auth/supabase-auth'

describe('Supabase auth helpers', () => {
  it('treats missing authorization as anonymous', () => {
    expect(readBearerToken(new Headers())).toBeNull()
    expect(readBearerToken(new Headers({ authorization: '' }))).toBeNull()
  })

  it('requires bearer authorization when a credential is provided', () => {
    expect(() => readBearerToken(new Headers({ authorization: 'Basic abc' }))).toThrow(SupabaseAuthError)
    expect(() => readBearerToken(new Headers({ authorization: 'Bearer' }))).toThrow(SupabaseAuthError)
    expect(readBearerToken(new Headers({ authorization: 'Bearer access-token' }))).toBe('access-token')
  })

  it('does not require Supabase env for anonymous requests', async () => {
    await expect(resolveSupabaseAuthContext(new Request('https://worker.test'), {})).resolves.toBeNull()
  })

  it('verifies bearer tokens and maps trusted Supabase claims', async () => {
    const request = new Request('https://worker.test/api/lobby/rooms', {
      headers: {
        authorization: 'Bearer signed-access-token',
      },
    })

    const context = await resolveSupabaseAuthContext(
      request,
      {
        SUPABASE_URL: 'https://project-ref.supabase.co/',
      },
      async (token, options) => {
        expect(token).toBe('signed-access-token')
        expect(options.supabaseUrl).toBe('https://project-ref.supabase.co')

        return {
          sub: 'user-123',
          role: 'authenticated',
          session_id: 'session-123',
        }
      },
    )

    expect(context).toMatchObject({
      userId: 'user-123',
      role: 'authenticated',
      sessionId: 'session-123',
    })
  })

  it('fails authenticated requests when the Worker lacks Supabase configuration', async () => {
    const request = new Request('https://worker.test/api/lobby/rooms', {
      headers: {
        authorization: 'Bearer signed-access-token',
      },
    })

    await expect(resolveSupabaseAuthContext(request, {})).rejects.toMatchObject({
      name: 'SupabaseAuthError',
      status: 500,
    })
  })

  it('strips external credentials and forwards only trusted internal auth headers', () => {
    const headers = createForwardedRoomRequestHeaders(
      new Headers({
        authorization: 'Bearer external-token',
        'content-type': 'application/json',
        [OPEN_POKER_AUTH_USER_ID_HEADER]: 'spoofed-user',
        [OPEN_POKER_AUTH_ROLE_HEADER]: 'spoofed-role',
        [OPEN_POKER_AUTH_SESSION_ID_HEADER]: 'spoofed-session',
      }),
      {
        userId: 'trusted-user',
        role: 'authenticated',
        sessionId: 'trusted-session',
        claims: {},
      },
    )

    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get(OPEN_POKER_AUTH_USER_ID_HEADER)).toBe('trusted-user')
    expect(headers.get(OPEN_POKER_AUTH_ROLE_HEADER)).toBe('authenticated')
    expect(headers.get(OPEN_POKER_AUTH_SESSION_ID_HEADER)).toBe('trusted-session')
  })

  it('reads the trusted forwarded auth user id', () => {
    expect(readForwardedAuthUserId(new Headers())).toBeNull()
    expect(readForwardedAuthUserId(new Headers({ [OPEN_POKER_AUTH_USER_ID_HEADER]: ' user-123 ' }))).toBe('user-123')
  })
})
