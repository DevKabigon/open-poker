import { describe, expect, it } from 'vitest'
import {
  clearStoredRoomSession,
  readStoredRoomSession,
  writeStoredRoomSession,
} from './session-storage'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('room session storage', () => {
  it('round-trips a resumable room session', () => {
    const storage = new MemoryStorage()

    const saved = writeStoredRoomSession(
      { roomId: 'cash-nlhe-1-2-table-01', sessionToken: 'session-123' },
      storage,
    )
    const restored = readStoredRoomSession(storage)

    expect(restored).toEqual(saved)
    expect(restored?.roomId).toBe('cash-nlhe-1-2-table-01')
    expect(restored?.sessionToken).toBe('session-123')
    expect(restored?.savedAt).toEqual(expect.any(String))
  })

  it('ignores malformed or incomplete stored sessions', () => {
    const storage = new MemoryStorage()

    storage.setItem('openpoker:room-session', '{"roomId":"cash-nlhe-1-2-table-01"}')
    expect(readStoredRoomSession(storage)).toBeNull()

    storage.setItem('openpoker:room-session', 'not-json')
    expect(readStoredRoomSession(storage)).toBeNull()
  })

  it('does not persist blank room or session identifiers', () => {
    const storage = new MemoryStorage()

    const saved = writeStoredRoomSession({ roomId: ' ', sessionToken: 'session-123' }, storage)

    expect(saved).toBeNull()
    expect(readStoredRoomSession(storage)).toBeNull()
  })

  it('clears a stored room session', () => {
    const storage = new MemoryStorage()

    writeStoredRoomSession(
      { roomId: 'cash-nlhe-1-2-table-01', sessionToken: 'session-123' },
      storage,
    )
    clearStoredRoomSession(storage)

    expect(readStoredRoomSession(storage)).toBeNull()
  })
})
