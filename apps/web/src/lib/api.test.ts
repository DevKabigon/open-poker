import { afterEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  type MockSessionResult = {
    data: {
      session: {
        access_token: string
      } | null
    }
    error: Error | null
  }

  const getSession = vi.fn<() => Promise<MockSessionResult>>(async () => ({
    data: { session: null },
    error: null,
  }))
  const createClient = vi.fn(() => ({
    auth: { getSession },
  }))

  return {
    createClient,
    getSession,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}))

import { OpenPokerApiError, fetchLobbyRooms, getApiBaseUrl } from './api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  supabaseMocks.createClient.mockClear()
  supabaseMocks.getSession.mockReset()
  supabaseMocks.getSession.mockResolvedValue({
    data: { session: null },
    error: null,
  })
})

describe('web API client', () => {
  it('sends relative API helpers to the configured Worker base URL', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ rooms: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    await fetchLobbyRooms()

    const [input] = fetchMock.mock.calls[0] as Parameters<typeof fetch>
    expect(input).toBeInstanceOf(URL)
    expect(String(input)).toBe(`${getApiBaseUrl()}/api/lobby/rooms`)
  })

  it('adds the Supabase bearer token when a session is available', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    supabaseMocks.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'test-access-token',
        },
      },
      error: null,
    })

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ rooms: [] }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    await fetchLobbyRooms()

    const [, init] = fetchMock.mock.calls[0] as Parameters<typeof fetch>
    const headers = new Headers(init?.headers)

    expect(headers.get('authorization')).toBe('Bearer test-access-token')
  })

  it('throws typed API errors with server-provided reasons', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ ok: false, reason: 'Unknown roomId.' }), {
        headers: { 'content-type': 'application/json' },
        status: 404,
      })
    })

    globalThis.fetch = fetchMock as unknown as typeof fetch

    const request = fetchLobbyRooms()

    await expect(request).rejects.toBeInstanceOf(OpenPokerApiError)
    await expect(request).rejects.toMatchObject({
      name: 'OpenPokerApiError',
      status: 404,
      reason: 'Unknown roomId.',
    })
  })
})
