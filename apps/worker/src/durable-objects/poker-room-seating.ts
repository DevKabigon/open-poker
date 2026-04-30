import {
  createEmptySeatState,
  getHandEligibleSeatIds,
  type InternalRoomState,
  type PlayerSeatState,
  type SeatId,
} from '@openpoker/domain'
import {
  issueSeatSession,
  resolveSeatSession,
  revokeSeatSessions,
  type PokerRoomSeatSession,
  type PokerRoomSessionState,
} from './poker-room-sessions'

export interface ClaimSeatRequest {
  seatId: SeatId
  playerId: string
  displayName?: string | null
  buyIn: number
}

export interface ClaimSeatResult {
  nextRoomState: InternalRoomState
  nextSessionState: PokerRoomSessionState
  session: PokerRoomSeatSession
}

export type LeaveSeatDisposition = 'cleared'

export interface LeaveSeatResult {
  nextRoomState: InternalRoomState
  nextSessionState: PokerRoomSessionState
  seatId: SeatId
  playerId: string
  disposition: LeaveSeatDisposition
}

export interface SetSitOutNextHandResult {
  nextRoomState: InternalRoomState
  nextSessionState: PokerRoomSessionState
  seatId: SeatId
  playerId: string
}

export interface SitInSeatResult {
  nextRoomState: InternalRoomState
  nextSessionState: PokerRoomSessionState
  seatId: SeatId
  playerId: string
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function normalizePlayerId(playerId: string): string {
  const normalized = playerId.trim()

  if (normalized.length === 0) {
    throw new Error('playerId must be a non-empty string.')
  }

  return normalized
}

function normalizeDisplayName(displayName: string | null | undefined, playerId: string): string {
  if (displayName === undefined || displayName === null) {
    return playerId
  }

  const normalized = displayName.trim()

  if (normalized.length === 0) {
    throw new Error('displayName must be omitted, null, or a non-empty string.')
  }

  return normalized
}

function assertSeatIdInRange(state: InternalRoomState, seatId: SeatId): void {
  if (!isNonNegativeInteger(seatId) || seatId >= state.seats.length) {
    throw new Error(`seatId must be between 0 and ${state.seats.length - 1}.`)
  }
}

function assertBuyInInRange(state: InternalRoomState, buyIn: number): void {
  if (!isNonNegativeInteger(buyIn)) {
    throw new Error('buyIn must be a non-negative integer.')
  }

  if (buyIn < state.config.minBuyIn || buyIn > state.config.maxBuyIn) {
    throw new Error(
      `buyIn must be between ${state.config.minBuyIn} and ${state.config.maxBuyIn} for this table.`,
    )
  }
}

function isActiveHand(state: InternalRoomState): boolean {
  return state.handStatus === 'in-hand' || state.handStatus === 'showdown'
}

function wouldSitOutCancelWaitingRoomStart(
  state: InternalRoomState,
  seat: PlayerSeatState,
  sitOutNextHand: boolean,
): boolean {
  if (!sitOutNextHand || state.handStatus !== 'waiting' || seat.isSittingOut || seat.stack <= 0) {
    return false
  }

  const eligibleSeatIds = getHandEligibleSeatIds(state.seats)

  return (
    eligibleSeatIds.includes(seat.seatId) &&
    eligibleSeatIds.length >= state.config.autoStartMinPlayers &&
    eligibleSeatIds.length - 1 < state.config.autoStartMinPlayers
  )
}

function createNextRoomState(
  state: InternalRoomState,
  seatId: SeatId,
  nextSeat: InternalRoomState['seats'][number],
  now: string,
): InternalRoomState {
  const nextSeats = state.seats.map((seat) => (seat.seatId === seatId ? nextSeat : { ...seat }))

  return {
    ...state,
    seats: nextSeats,
    updatedAt: now,
  }
}

function findOccupiedSeatIdByPlayerId(state: InternalRoomState, playerId: string): SeatId | null {
  return state.seats.find((seat) => seat.playerId === playerId)?.seatId ?? null
}

function resolveSeatSessionForSeat(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  sessionToken: string,
  seatId: SeatId,
): PokerRoomSeatSession {
  assertSeatIdInRange(roomState, seatId)

  const session = resolveSeatSession(roomState, sessionState, sessionToken)

  if (session === null) {
    throw new Error('sessionToken is not valid for any occupied seat.')
  }

  if (session.seatId !== seatId) {
    throw new Error('sessionToken does not match the targeted seat.')
  }

  return session
}

export function claimSeat(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  request: ClaimSeatRequest,
  now: string,
  token?: string,
): ClaimSeatResult {
  assertSeatIdInRange(roomState, request.seatId)
  assertBuyInInRange(roomState, request.buyIn)

  const playerId = normalizePlayerId(request.playerId)
  const displayName = normalizeDisplayName(request.displayName, playerId)
  const targetSeat = roomState.seats[request.seatId]!

  if (targetSeat.playerId !== null) {
    throw new Error(`Seat ${request.seatId} is already occupied.`)
  }

  const existingSeatId = findOccupiedSeatIdByPlayerId(roomState, playerId)

  if (existingSeatId !== null) {
    throw new Error(`Player ${playerId} is already seated at seat ${existingSeatId}.`)
  }

  const nextSeat = {
    ...createEmptySeatState(request.seatId),
    seatId: request.seatId,
    playerId,
    displayName,
    stack: request.buyIn,
    isSittingOut: false,
    isSittingOutNextHand: false,
    isDisconnected: false,
    isWaitingForNextHand: isActiveHand(roomState),
  }

  const nextRoomState = createNextRoomState(roomState, request.seatId, nextSeat, now)
  const issued = issueSeatSession(nextRoomState, sessionState, request.seatId, now, token)

  return {
    nextRoomState,
    nextSessionState: issued.nextState,
    session: issued.session,
  }
}

export function leaveSeat(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  sessionToken: string,
  seatId: SeatId,
  now: string,
): LeaveSeatResult {
  const session = resolveSeatSessionForSeat(roomState, sessionState, sessionToken, seatId)
  const seat = roomState.seats[seatId]!

  if (!seat.isSittingOut) {
    throw new Error('Seat must be sitting out before it can be left.')
  }

  const nextSessionState = revokeSeatSessions(sessionState, seatId)

  return {
    nextRoomState: createNextRoomState(roomState, seatId, createEmptySeatState(seatId), now),
    nextSessionState,
    seatId,
    playerId: session.playerId,
    disposition: 'cleared',
  }
}

export function setSitOutNextHand(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  sessionToken: string,
  seatId: SeatId,
  sitOutNextHand: boolean,
  now: string,
): SetSitOutNextHandResult {
  const session = resolveSeatSessionForSeat(roomState, sessionState, sessionToken, seatId)
  const seat = roomState.seats[seatId]!

  if (wouldSitOutCancelWaitingRoomStart(roomState, seat, sitOutNextHand)) {
    throw new Error('Cannot sit out next hand while this seat is needed for the queued hand to start.')
  }

  const shouldDeferUntilNextHand = isActiveHand(roomState) && !seat.isSittingOut && !seat.isWaitingForNextHand
  const nextSeat = shouldDeferUntilNextHand
    ? {
        ...seat,
        isSittingOutNextHand: sitOutNextHand,
        isDisconnected: false,
      }
    : {
        ...seat,
        isSittingOut: sitOutNextHand,
        isSittingOutNextHand: false,
        isDisconnected: false,
        isWaitingForNextHand: sitOutNextHand ? false : seat.isWaitingForNextHand,
      }

  return {
    nextRoomState: createNextRoomState(roomState, seatId, nextSeat, now),
    nextSessionState: sessionState,
    seatId,
    playerId: session.playerId,
  }
}

export function sitInSeat(
  roomState: InternalRoomState,
  sessionState: PokerRoomSessionState,
  sessionToken: string,
  seatId: SeatId,
  now: string,
): SitInSeatResult {
  const session = resolveSeatSessionForSeat(roomState, sessionState, sessionToken, seatId)
  const seat = roomState.seats[seatId]!

  if (seat.stack <= 0) {
    throw new Error('Seat needs chips before it can sit in.')
  }

  const nextSeat = {
    ...seat,
    isSittingOut: false,
    isSittingOutNextHand: false,
    isDisconnected: false,
    isWaitingForNextHand: isActiveHand(roomState),
  }

  return {
    nextRoomState: createNextRoomState(roomState, seatId, nextSeat, now),
    nextSessionState: sessionState,
    seatId,
    playerId: session.playerId,
  }
}
