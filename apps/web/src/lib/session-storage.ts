export interface StoredRoomSession {
  roomId: string
  playerId?: string
  sessionToken: string
  savedAt: string
}

const ROOM_SESSION_STORAGE_KEY = 'openpoker:room-session'
export const ROOM_SESSION_CLEARED_EVENT = 'openpoker:room-session-cleared'

export function readStoredRoomSession(storage = getBrowserStorage()): StoredRoomSession | null {
  if (!storage) {
    return null
  }

  const rawValue = storage.getItem(ROOM_SESSION_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown

    return isStoredRoomSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredRoomSession(
  session: Pick<StoredRoomSession, 'roomId' | 'sessionToken'> & {
    playerId?: string | null
  },
  storage = getBrowserStorage(),
): StoredRoomSession | null {
  if (!storage) {
    return null
  }

  const roomId = session.roomId.trim()
  const playerId = session.playerId?.trim()
  const sessionToken = session.sessionToken.trim()

  if (roomId.length === 0 || sessionToken.length === 0) {
    return null
  }

  const storedSession: StoredRoomSession = {
    roomId,
    ...(playerId && playerId.length > 0 ? { playerId } : {}),
    sessionToken,
    savedAt: new Date().toISOString(),
  }

  storage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(storedSession))

  return storedSession
}

export function clearStoredRoomSession(storage = getBrowserStorage()): void {
  storage?.removeItem(ROOM_SESSION_STORAGE_KEY)

  if (storage !== null && storage === getBrowserStorage()) {
    dispatchRoomSessionCleared()
  }
}

export function subscribeRoomSessionCleared(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(ROOM_SESSION_CLEARED_EVENT, listener)

  return () => window.removeEventListener(ROOM_SESSION_CLEARED_EVENT, listener)
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function dispatchRoomSessionCleared(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(ROOM_SESSION_CLEARED_EVENT))
}

function isStoredRoomSession(value: unknown): value is StoredRoomSession {
  return (
    typeof value === 'object'
    && value !== null
    && 'roomId' in value
    && typeof value.roomId === 'string'
    && value.roomId.length > 0
    && 'sessionToken' in value
    && typeof value.sessionToken === 'string'
    && value.sessionToken.length > 0
    && 'savedAt' in value
    && typeof value.savedAt === 'string'
    && value.savedAt.length > 0
    && (
      !('playerId' in value)
      || (typeof value.playerId === 'string' && value.playerId.length > 0)
    )
  )
}
