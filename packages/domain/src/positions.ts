import { type PlayerSeatState, type SeatId } from './state'

export type SeatPredicate = (seat: PlayerSeatState) => boolean

export function sortSeatIdsAscending(seatIds: SeatId[]): SeatId[] {
  return [...seatIds].sort((left, right) => left - right)
}

export function getSeatById(seats: PlayerSeatState[], seatId: SeatId): PlayerSeatState | undefined {
  return seats.find((seat) => seat.seatId === seatId)
}

export function isOccupiedSeat(seat: PlayerSeatState): boolean {
  return seat.playerId !== null
}

export function isEligibleToStartHand(seat: PlayerSeatState): boolean {
  return isOccupiedSeat(seat) && !seat.isSittingOut && seat.stack > 0
}

export function isActionableSeat(seat: PlayerSeatState): boolean {
  return isEligibleToStartHand(seat) && !seat.isWaitingForNextHand && !seat.hasFolded && !seat.isAllIn
}

export function getSeatIdsByPredicate(seats: PlayerSeatState[], predicate: SeatPredicate): SeatId[] {
  return sortSeatIdsAscending(seats.filter(predicate).map((seat) => seat.seatId))
}

export function getOccupiedSeatIds(seats: PlayerSeatState[]): SeatId[] {
  return getSeatIdsByPredicate(seats, isOccupiedSeat)
}

export function getHandEligibleSeatIds(seats: PlayerSeatState[]): SeatId[] {
  return getSeatIdsByPredicate(seats, isEligibleToStartHand)
}

export function getActionableSeatIds(seats: PlayerSeatState[]): SeatId[] {
  return getSeatIdsByPredicate(seats, isActionableSeat)
}

function rotateSeatIds(seatIds: SeatId[], startIndex: number): SeatId[] {
  if (seatIds.length === 0) {
    return []
  }

  return [...seatIds.slice(startIndex), ...seatIds.slice(0, startIndex)]
}

export function getClockwiseSeatIdsFrom(
  seats: PlayerSeatState[],
  startSeatId: SeatId,
  predicate: SeatPredicate,
): SeatId[] {
  const seatIds = getSeatIdsByPredicate(seats, predicate)

  if (seatIds.length === 0) {
    return []
  }

  const exactIndex = seatIds.indexOf(startSeatId)

  if (exactIndex >= 0) {
    return rotateSeatIds(seatIds, exactIndex)
  }

  const nextIndex = seatIds.findIndex((seatId) => seatId > startSeatId)

  return rotateSeatIds(seatIds, nextIndex >= 0 ? nextIndex : 0)
}

export function getClockwiseSeatIdsAfter(
  seats: PlayerSeatState[],
  afterSeatId: SeatId,
  predicate: SeatPredicate,
): SeatId[] {
  const seatIds = getSeatIdsByPredicate(seats, predicate)

  if (seatIds.length === 0) {
    return []
  }

  const nextIndex = seatIds.findIndex((seatId) => seatId > afterSeatId)

  return rotateSeatIds(seatIds, nextIndex >= 0 ? nextIndex : 0)
}

export function getNextSeatIdClockwise(
  seats: PlayerSeatState[],
  afterSeatId: SeatId,
  predicate: SeatPredicate,
): SeatId | null {
  const orderedSeatIds = getClockwiseSeatIdsAfter(seats, afterSeatId, predicate)
  return orderedSeatIds[0] ?? null
}
