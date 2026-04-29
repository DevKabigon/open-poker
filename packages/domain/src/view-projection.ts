import type {
  PrivatePlayerView,
  PublicShowdownHandEvaluationView,
  PublicShowdownSummaryView,
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
    !isHandTerminal(state)
  ) {
    return false
  }

  if (state.handStatus === 'showdown' && state.street === 'showdown' && state.showdownSummary === null) {
    return !seat.hasFolded
  }

  if (isSettledShowdown(state)) {
    if (isShowdownWinner(state, seat.seatId)) {
      return true
    }

    return isSeatEvaluatedAtShowdown(state, seat.seatId) && seat.showCardsAtShowdown === true
  }

  return seat.showCardsAtShowdown === true
}

function isHandTerminal(state: InternalRoomState): boolean {
  return state.handStatus === 'showdown' || state.handStatus === 'settled'
}

function isSettledShowdown(state: InternalRoomState): boolean {
  return (state.showdownSummary?.handEvaluations.length ?? 0) > 0
}

function isShowdownWinner(state: InternalRoomState, seatId: SeatId): boolean {
  return state.showdownSummary?.potAwards.some((award) => award.winnerSeatIds.includes(seatId)) ?? false
}

function isSeatEvaluatedAtShowdown(state: InternalRoomState, seatId: SeatId): boolean {
  return state.showdownSummary?.handEvaluations.some((evaluation) => evaluation.seatId === seatId) ?? false
}

function isShowdownEvaluationPublic(
  state: InternalRoomState,
  evaluation: NonNullable<InternalRoomState['showdownSummary']>['handEvaluations'][number],
): boolean {
  if (isShowdownWinner(state, evaluation.seatId)) {
    return true
  }

  const seat = getSeatById(state.seats, evaluation.seatId)

  if (!seat || seat.holeCards === null) {
    return false
  }

  if (shouldRevealHoleCards(state, seat)) {
    return true
  }

  const hiddenHoleCards = new Set(seat.holeCards)

  return evaluation.bestCards.every((card) => !hiddenHoleCards.has(card))
}

function projectShowdownHandEvaluation(
  state: InternalRoomState,
  evaluation: NonNullable<InternalRoomState['showdownSummary']>['handEvaluations'][number],
): PublicShowdownHandEvaluationView {
  const isRevealed = isShowdownEvaluationPublic(state, evaluation)

  return {
    seatId: evaluation.seatId,
    category: isRevealed ? evaluation.category : null,
    bestCards: isRevealed ? [...evaluation.bestCards] : null,
    isRevealed,
  }
}

function projectShowdownSummary(state: InternalRoomState): PublicShowdownSummaryView | null {
  if (state.showdownSummary === null) {
    return null
  }

  return {
    handId: state.showdownSummary.handId,
    handNumber: state.showdownSummary.handNumber,
    handEvaluations: state.showdownSummary.handEvaluations.map((evaluation) =>
      projectShowdownHandEvaluation(state, evaluation),
    ),
    potAwards: state.showdownSummary.potAwards.map((award) => ({
      potIndex: award.potIndex,
      amount: award.amount,
      eligibleSeatIds: [...award.eligibleSeatIds],
      winnerSeatIds: [...award.winnerSeatIds],
      shares: award.shares.map((share) => ({ ...share })),
    })),
    payouts: state.showdownSummary.payouts.map((payout) => ({ ...payout })),
    uncalledBetReturn:
      state.showdownSummary.uncalledBetReturn === null
        ? null
        : { ...state.showdownSummary.uncalledBetReturn },
  }
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
    showdownSummary: projectShowdownSummary(state),
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
