import { getHandEligibleSeatIds, getNextSeatIdClockwise, isEligibleToStartHand } from './positions'
import { type PlayerSeatState, type SeatId } from './state'

export interface BlindSeatAssignments {
  dealerSeat: SeatId
  smallBlindSeat: SeatId
  bigBlindSeat: SeatId
  isHeadsUp: boolean
}

export function getNextDealerSeat(
  seats: PlayerSeatState[],
  previousDealerSeat: SeatId | null,
): SeatId | null {
  const eligibleSeatIds = getHandEligibleSeatIds(seats)

  if (eligibleSeatIds.length === 0) {
    return null
  }

  if (previousDealerSeat === null) {
    return eligibleSeatIds[0]
  }

  return getNextSeatIdClockwise(seats, previousDealerSeat, isEligibleToStartHand)
}

export function getBlindSeatAssignments(
  seats: PlayerSeatState[],
  dealerSeat: SeatId,
): BlindSeatAssignments | null {
  const eligibleSeatIds = getHandEligibleSeatIds(seats)

  if (eligibleSeatIds.length < 2 || !eligibleSeatIds.includes(dealerSeat)) {
    return null
  }

  if (eligibleSeatIds.length === 2) {
    const bigBlindSeat = getNextSeatIdClockwise(seats, dealerSeat, isEligibleToStartHand)

    if (bigBlindSeat === null) {
      return null
    }

    return {
      dealerSeat,
      smallBlindSeat: dealerSeat,
      bigBlindSeat,
      isHeadsUp: true,
    }
  }

  const smallBlindSeat = getNextSeatIdClockwise(seats, dealerSeat, isEligibleToStartHand)

  if (smallBlindSeat === null) {
    return null
  }

  const bigBlindSeat = getNextSeatIdClockwise(seats, smallBlindSeat, isEligibleToStartHand)

  if (bigBlindSeat === null) {
    return null
  }

  return {
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    isHeadsUp: false,
  }
}

export function getBlindSeatAssignmentsForNextHand(
  seats: PlayerSeatState[],
  previousDealerSeat: SeatId | null,
): BlindSeatAssignments | null {
  const dealerSeat = getNextDealerSeat(seats, previousDealerSeat)

  if (dealerSeat === null) {
    return null
  }

  return getBlindSeatAssignments(seats, dealerSeat)
}
