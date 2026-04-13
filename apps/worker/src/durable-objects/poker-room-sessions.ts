import { type InternalRoomState, type SeatId } from '@openpoker/domain'

export interface PokerRoomSeatSession {
  token: string
  seatId: SeatId
  playerId: string
  issuedAt: string
}

export interface PokerRoomSessionState {
  sessions: PokerRoomSeatSession[]
}

export interface IssueSeatSessionResult {
  nextState: PokerRoomSessionState
  session: PokerRoomSeatSession
}

export function createEmptyPokerRoomSessionState(): PokerRoomSessionState {
  return {
    sessions: [],
  }
}

function getOccupiedPlayerId(state: InternalRoomState, seatId: SeatId): string {
  const seat = state.seats[seatId]

  if (!seat || seat.playerId === null) {
    throw new Error(`Cannot issue a session for empty seat ${seatId}.`)
  }

  return seat.playerId
}

export function revokeSeatSessions(
  sessionState: PokerRoomSessionState,
  seatId: SeatId,
): PokerRoomSessionState {
  return {
    sessions: sessionState.sessions
      .filter((session) => session.seatId !== seatId)
      .map((session) => ({ ...session })),
  }
}

export function revokeAllSeatSessions(): PokerRoomSessionState {
  return createEmptyPokerRoomSessionState()
}

export function issueSeatSession(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  seatId: SeatId,
  now: string,
  token: string = crypto.randomUUID(),
): IssueSeatSessionResult {
  if (token.trim().length === 0) {
    throw new Error('Seat session token must be a non-empty string.')
  }

  const playerId = getOccupiedPlayerId(roomState, seatId)
  const nextState = revokeSeatSessions(sessionState, seatId)
  const session: PokerRoomSeatSession = {
    token,
    seatId,
    playerId,
    issuedAt: now,
  }

  nextState.sessions.push(session)

  return {
    nextState,
    session,
  }
}

export function resolveSeatSession(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  token: string | null | undefined,
): PokerRoomSeatSession | null {
  if (!token || token.trim().length === 0) {
    return null
  }

  const session = sessionState.sessions.find((entry) => entry.token === token)

  if (!session) {
    return null
  }

  const seat = roomState.seats[session.seatId]

  if (!seat || seat.playerId === null) {
    return null
  }

  if (seat.playerId !== session.playerId) {
    return null
  }

  return { ...session }
}
