import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenPokerApiError, fetchLobbyRooms, getApiBaseUrl } from './api'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
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
