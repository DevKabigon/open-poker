import { type ValidatedAction } from './action-validation'
import { type CardCode } from './cards'
import { getClockwiseSeatIdsAfter, getSeatById, isActionableSeat } from './positions'
import { type InternalRoomState, type PlayerSeatState, type SeatId } from './state'

export type BettingRoundResolution =
  | 'needs-action'
  | 'round-complete'
  | 'hand-complete'
  | 'all-in-runout'

export interface ApplyValidatedActionOptions {
  now?: string
}

export interface BettingRoundTransition {
  nextState: InternalRoomState
  resolution: BettingRoundResolution
  winningSeatId: SeatId | null
}

function cloneSeat(seat: PlayerSeatState): PlayerSeatState {
  return {
    ...seat,
    holeCards: seat.holeCards === null ? null : [...seat.holeCards] as [CardCode, CardCode],
  }
}

function cloneState(state: InternalRoomState): InternalRoomState {
  return {
    ...state,
    pendingActionSeatIds: [...state.pendingActionSeatIds],
    raiseRightsSeatIds: [...state.raiseRightsSeatIds],
    board: [...state.board],
    burnCards: [...state.burnCards],
    deck: [...state.deck],
    sidePots: state.sidePots.map((pot) => ({
      amount: pot.amount,
      eligibleSeatIds: [...pot.eligibleSeatIds],
    })),
    seats: state.seats.map(cloneSeat),
  }
}

function isContestingSeat(seat: PlayerSeatState): boolean {
  return seat.playerId !== null && !seat.isSittingOut && !seat.isWaitingForNextHand && !seat.hasFolded
}

function getContestingSeatIds(seats: PlayerSeatState[]): SeatId[] {
  return seats.filter(isContestingSeat).map((seat) => seat.seatId)
}

function getActionableContestingSeatIds(seats: PlayerSeatState[]): SeatId[] {
  return seats.filter((seat) => isContestingSeat(seat) && isActionableSeat(seat)).map((seat) => seat.seatId)
}

function getRemainingPendingSeats(nextState: InternalRoomState, actorSeatId: SeatId): SeatId[] {
  return nextState.pendingActionSeatIds.filter((seatId) => {
    if (seatId === actorSeatId) {
      return false
    }

    const seat = getSeatById(nextState.seats, seatId)
    return seat !== undefined && isActionableSeat(seat)
  })
}

function getRemainingRaiseRights(nextState: InternalRoomState, actorSeatId: SeatId): SeatId[] {
  return nextState.raiseRightsSeatIds.filter((seatId) => {
    if (seatId === actorSeatId) {
      return false
    }

    const seat = getSeatById(nextState.seats, seatId)
    return seat !== undefined && isActionableSeat(seat) && nextState.pendingActionSeatIds.includes(seatId)
  })
}

function getClockwiseActionableSeatsAfter(nextState: InternalRoomState, actorSeatId: SeatId): SeatId[] {
  return getClockwiseSeatIdsAfter(nextState.seats, actorSeatId, isActionableSeat).filter(
    (seatId) => seatId !== actorSeatId,
  )
}

function getPendingSeatsAfterShortWagerIncrease(nextState: InternalRoomState, actorSeatId: SeatId): SeatId[] {
  return getClockwiseActionableSeatsAfter(nextState, actorSeatId).filter((seatId) => {
    const seat = getSeatById(nextState.seats, seatId)
    return seat !== undefined && seat.committed < nextState.currentBet
  })
}

function applySeatAction(nextState: InternalRoomState, actorSeatId: SeatId, action: ValidatedAction): void {
  const seat = getSeatById(nextState.seats, actorSeatId)

  if (!seat) {
    throw new Error(`Cannot apply action for missing seat ${actorSeatId}.`)
  }

  if (action.addedChips > 0) {
    seat.stack -= action.addedChips
    seat.committed = action.targetCommitted
    seat.totalCommitted += action.addedChips
  }

  if (action.resolvedType === 'fold') {
    seat.hasFolded = true
  }

  if (action.isAllIn || seat.stack === 0) {
    seat.isAllIn = true
  }

  seat.actedThisStreet = true
}

function applyBettingMetadata(nextState: InternalRoomState, previousCurrentBet: number, action: ValidatedAction): void {
  if (action.resolvedType !== 'bet' && action.resolvedType !== 'raise') {
    return
  }

  nextState.currentBet = action.targetCommitted

  if (action.isFullRaise) {
    nextState.lastFullRaiseSize = action.targetCommitted - previousCurrentBet
  }
}

function getResolution(nextState: InternalRoomState): BettingRoundTransition['resolution'] {
  const contestingSeatIds = getContestingSeatIds(nextState.seats)

  if (contestingSeatIds.length <= 1) {
    return 'hand-complete'
  }

  if (nextState.pendingActionSeatIds.length > 0) {
    return 'needs-action'
  }

  if (getActionableContestingSeatIds(nextState.seats).length === 0) {
    return 'all-in-runout'
  }

  return 'round-complete'
}

export function applyValidatedActionToBettingRound(
  state: InternalRoomState,
  actorSeatId: SeatId,
  action: ValidatedAction,
  options: ApplyValidatedActionOptions = {},
): BettingRoundTransition {
  if (state.actingSeat !== actorSeatId) {
    throw new Error('Validated betting actions must be applied by the current acting seat.')
  }

  const nextState = cloneState(state)
  const previousCurrentBet = state.currentBet
  const previousRaiseRights = [...state.raiseRightsSeatIds]

  applySeatAction(nextState, actorSeatId, action)
  applyBettingMetadata(nextState, previousCurrentBet, action)

  if (action.resolvedType === 'bet' || action.resolvedType === 'raise') {
    if (action.isFullRaise) {
      nextState.pendingActionSeatIds = getClockwiseActionableSeatsAfter(nextState, actorSeatId)
      nextState.raiseRightsSeatIds = [...nextState.pendingActionSeatIds]
    } else {
      nextState.pendingActionSeatIds = getPendingSeatsAfterShortWagerIncrease(nextState, actorSeatId)
      nextState.raiseRightsSeatIds = nextState.pendingActionSeatIds.filter((seatId) =>
        previousRaiseRights.includes(seatId),
      )
    }
  } else {
    nextState.pendingActionSeatIds = getRemainingPendingSeats(nextState, actorSeatId)
    nextState.raiseRightsSeatIds = getRemainingRaiseRights(nextState, actorSeatId)
  }

  const resolution = getResolution(nextState)
  const contestingSeatIds = getContestingSeatIds(nextState.seats)

  if (resolution === 'needs-action') {
    nextState.actingSeat = nextState.pendingActionSeatIds[0] ?? null
  } else {
    nextState.actingSeat = null
    nextState.pendingActionSeatIds = []
    nextState.raiseRightsSeatIds = []
  }

  nextState.actionSequence += 1
  if (options.now) {
    nextState.updatedAt = options.now
  }

  return {
    nextState,
    resolution,
    winningSeatId: resolution === 'hand-complete' ? (contestingSeatIds[0] ?? null) : null,
  }
}
