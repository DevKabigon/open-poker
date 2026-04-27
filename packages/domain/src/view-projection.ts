import type {
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  RoomSnapshotMessage,
} from '@openpoker/protocol'
import { canSeatActNow, getAllowedActionTypes, getSeatActionContext } from './action-validation'
import { getSeatById } from './positions'
import { calculateSidePotsFromSeats } from './side-pot'
import { type InternalRoomState, type PlayerSeatState, type SeatId } from './state'

export interface PrivatePlayerProjectionOptions {
  actionDeadlineAt?: string | null
}

export interface TableSnapshotProjectionOptions extends PrivatePlayerProjectionOptions {
  viewerSeatId?: SeatId | null
  nextHandStartAt?: string | null
}

function shouldRevealHoleCards(state: InternalRoomState, seat: PlayerSeatState): boolean {
  if (
    seat.playerId === null ||
    seat.holeCards === null ||
    seat.hasFolded ||
    seat.showCardsAtShowdown !== true
  ) {
    return false
  }

  return state.street === 'showdown' || state.handStatus === 'showdown' || state.handStatus === 'settled'
}

export function projectPublicSeatView(
  state: InternalRoomState,
  seat: PlayerSeatState,
): PublicSeatView {
  return {
    seatId: seat.seatId,
    playerId: seat.playerId,
    displayName: seat.displayName,
    isOccupied: seat.playerId !== null,
    stack: seat.stack,
    committed: seat.committed,
    totalCommitted: seat.totalCommitted,
    hasFolded: seat.hasFolded,
    isAllIn: seat.isAllIn,
    isSittingOut: seat.isSittingOut,
    isDisconnected: seat.isDisconnected,
    actedThisStreet: seat.actedThisStreet,
    revealedHoleCards: shouldRevealHoleCards(state, seat) ? [...seat.holeCards!] : null,
  }
}

export function projectPublicTableView(
  state: InternalRoomState,
  options: Pick<TableSnapshotProjectionOptions, 'nextHandStartAt'> = {},
): PublicTableView {
  const potCalculation = calculateSidePotsFromSeats(state.seats)

  return {
    roomId: state.roomId,
    roomVersion: state.roomVersion,
    handId: state.handId,
    handNumber: state.handNumber,
    handStatus: state.handStatus,
    street: state.street,
    actionTimeoutMs: state.config.actionTimeoutMs,
    nextHandStartAt: options.nextHandStartAt ?? null,
    dealerSeat: state.dealerSeat,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    actingSeat: state.actingSeat,
    board: [...state.board],
    currentBet: state.currentBet,
    mainPot: potCalculation.mainPot,
    sidePots: potCalculation.sidePots.map((pot) => ({
      amount: pot.amount,
      eligibleSeatIds: [...pot.eligibleSeatIds],
    })),
    totalPot: potCalculation.totalPot,
    uncalledBetReturn: potCalculation.uncalledBetReturn
      ? {
          seatId: potCalculation.uncalledBetReturn.seatId,
          amount: potCalculation.uncalledBetReturn.amount,
        }
      : null,
    seats: state.seats.map((seat) => projectPublicSeatView(state, seat)),
  }
}

export function projectPrivatePlayerView(
  state: InternalRoomState,
  seatId: SeatId,
  options: PrivatePlayerProjectionOptions = {},
): PrivatePlayerView | null {
  const seat = getSeatById(state.seats, seatId)

  if (!seat || seat.playerId === null) {
    return null
  }

  const canAct = canSeatActNow(state, seatId)
  const actionContext = getSeatActionContext(state, seatId)
  const allowedActions = canAct ? getAllowedActionTypes(state, seatId) : []
  const hasBetOrRaiseTarget =
    canAct &&
    allowedActions.some((actionType) => actionType === 'bet' || actionType === 'raise' || actionType === 'all-in')

  return {
    seatId,
    playerId: seat.playerId,
    holeCards: seat.holeCards === null ? null : [...seat.holeCards],
    showCardsAtShowdown: seat.showCardsAtShowdown === true,
    canAct,
    allowedActions,
    callAmount: canAct ? (actionContext?.requiredCallAmount ?? 0) : 0,
    minBetOrRaiseTo: hasBetOrRaiseTarget
      ? (state.currentBet === 0 ? (actionContext?.minOpenBetTo ?? null) : (actionContext?.minRaiseTo ?? null))
      : null,
    maxBetOrRaiseTo: hasBetOrRaiseTarget ? (actionContext?.maxCommitted ?? null) : null,
    actionDeadlineAt: canAct ? (options.actionDeadlineAt ?? null) : null,
  }
}

export function projectRoomSnapshotMessage(
  state: InternalRoomState,
  options: TableSnapshotProjectionOptions = {},
): RoomSnapshotMessage {
  const privateView =
    options.viewerSeatId === undefined || options.viewerSeatId === null
      ? null
      : projectPrivatePlayerView(state, options.viewerSeatId, options)

  return {
    type: 'room-snapshot',
    roomVersion: state.roomVersion,
    table: projectPublicTableView(state, options),
    privateView,
  }
}
