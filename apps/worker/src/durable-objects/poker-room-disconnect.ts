import { type InternalRoomState, type PlayerSeatState, type SeatId } from '@openpoker/domain'

function isActiveHand(state: InternalRoomState): boolean {
  return state.handStatus === 'in-hand' || state.handStatus === 'showdown'
}

function updateSeat(
  state: InternalRoomState,
  seatId: SeatId,
  updater: (seat: PlayerSeatState) => PlayerSeatState,
  now: string,
): InternalRoomState {
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.seatId === seatId ? updater(seat) : { ...seat })),
    updatedAt: now,
  }
}

export function markSeatDisconnected(
  state: InternalRoomState,
  seatId: SeatId,
  now: string,
): InternalRoomState {
  const seat = state.seats[seatId]

  if (!seat || seat.playerId === null || seat.isDisconnected) {
    return state
  }

  return updateSeat(
    state,
    seatId,
    (currentSeat) => ({
      ...currentSeat,
      isDisconnected: true,
    }),
    now,
  )
}

export function restoreSeatConnection(
  state: InternalRoomState,
  seatId: SeatId,
  now: string,
): InternalRoomState {
  const seat = state.seats[seatId]

  if (!seat || seat.playerId === null || !seat.isDisconnected) {
    return state
  }

  return updateSeat(
    state,
    seatId,
    (currentSeat) => ({
      ...currentSeat,
      isDisconnected: false,
    }),
    now,
  )
}

export function applyDisconnectGraceExpirations(
  state: InternalRoomState,
  seatIds: SeatId[],
  now: string,
): InternalRoomState {
  if (seatIds.length === 0) {
    return state
  }

  const expiredSeatIds = new Set(seatIds)
  const activeHand = isActiveHand(state)
  let didChange = false
  const nextSeats = state.seats.map((seat) => {
    if (!expiredSeatIds.has(seat.seatId) || seat.playerId === null || !seat.isDisconnected) {
      return { ...seat }
    }

    didChange = true

    if (activeHand && !seat.isSittingOut && !seat.isWaitingForNextHand) {
      return {
        ...seat,
        isSittingOutNextHand: true,
      }
    }

    return {
      ...seat,
      isSittingOut: true,
      isSittingOutNextHand: false,
      isWaitingForNextHand: false,
    }
  })

  if (!didChange) {
    return state
  }

  return {
    ...state,
    seats: nextSeats,
    updatedAt: now,
  }
}
