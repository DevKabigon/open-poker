import { type BlindSeatAssignments } from './blind-order'
import { getClockwiseSeatIdsAfter, getClockwiseSeatIdsFrom, getNextSeatIdClockwise, isActionableSeat } from './positions'
import { type PlayerSeatState, type SeatId } from './state'

export function getPreflopActingOrder(
  seats: PlayerSeatState[],
  blindAssignments: BlindSeatAssignments,
): SeatId[] {
  if (blindAssignments.isHeadsUp) {
    return getClockwiseSeatIdsFrom(seats, blindAssignments.dealerSeat, isActionableSeat)
  }

  return getClockwiseSeatIdsAfter(seats, blindAssignments.bigBlindSeat, isActionableSeat)
}

export function getPreflopFirstToActSeat(
  seats: PlayerSeatState[],
  blindAssignments: BlindSeatAssignments,
): SeatId | null {
  return getPreflopActingOrder(seats, blindAssignments)[0] ?? null
}

export function getPostflopActingOrder(
  seats: PlayerSeatState[],
  dealerSeat: SeatId,
): SeatId[] {
  return getClockwiseSeatIdsAfter(seats, dealerSeat, isActionableSeat)
}

export function getPostflopFirstToActSeat(
  seats: PlayerSeatState[],
  dealerSeat: SeatId,
): SeatId | null {
  return getNextSeatIdClockwise(seats, dealerSeat, isActionableSeat)
}
