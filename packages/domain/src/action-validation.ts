import { getSeatById, isActionableSeat } from './positions'
import { type InternalRoomState, type PlayerActionType, type SeatId } from './state'

export type AllowedActionType = Exclude<PlayerActionType, 'timeout'>

export type ActionRequest =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'all-in' }

export interface SeatActionContext {
  seatId: SeatId
  committed: number
  stack: number
  maxCommitted: number
  currentBet: number
  outstandingCallAmount: number
  requiredCallAmount: number
  minOpenBetTo: number
  minRaiseTo: number | null
  canCheck: boolean
  isFacingBet: boolean
}

export interface ValidatedAction {
  requestedType: AllowedActionType
  resolvedType: 'fold' | 'check' | 'call' | 'bet' | 'raise'
  targetCommitted: number
  addedChips: number
  isAllIn: boolean
  isFullRaise: boolean
}

export type ActionValidationResult =
  | { ok: true; value: ValidatedAction }
  | { ok: false; reason: string }

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

export function canSeatActNow(state: InternalRoomState, seatId: SeatId): boolean {
  if (state.handStatus === 'waiting') {
    return false
  }

  if (state.actingSeat !== seatId) {
    return false
  }

  if (!state.pendingActionSeatIds.includes(seatId)) {
    return false
  }

  const seat = getSeatById(state.seats, seatId)

  if (!seat) {
    return false
  }

  return isActionableSeat(seat)
}

export function getSeatActionContext(state: InternalRoomState, seatId: SeatId): SeatActionContext | null {
  const seat = getSeatById(state.seats, seatId)

  if (!seat || seat.playerId === null) {
    return null
  }

  const outstandingCallAmount = Math.max(0, state.currentBet - seat.committed)
  const maxCommitted = seat.committed + seat.stack

  return {
    seatId,
    committed: seat.committed,
    stack: seat.stack,
    maxCommitted,
    currentBet: state.currentBet,
    outstandingCallAmount,
    requiredCallAmount: Math.min(outstandingCallAmount, seat.stack),
    minOpenBetTo: state.config.bigBlind,
    minRaiseTo: outstandingCallAmount > 0 ? state.currentBet + state.lastFullRaiseSize : null,
    canCheck: outstandingCallAmount === 0,
    isFacingBet: outstandingCallAmount > 0,
  }
}

export function getAllowedActionTypes(state: InternalRoomState, seatId: SeatId): AllowedActionType[] {
  if (!canSeatActNow(state, seatId)) {
    return []
  }

  const context = getSeatActionContext(state, seatId)

  if (!context || context.stack <= 0) {
    return []
  }

  const allowed: AllowedActionType[] = ['fold', 'all-in']

  if (context.canCheck) {
    allowed.push('check')

    if (context.maxCommitted >= context.minOpenBetTo) {
      allowed.push('bet')
    }

    if (context.currentBet > 0 && context.minRaiseTo !== null && context.maxCommitted >= context.minRaiseTo) {
      allowed.push('raise')
    }

    return allowed
  }

  if (context.requiredCallAmount > 0) {
    allowed.push('call')
  }

  if (context.minRaiseTo !== null && context.maxCommitted >= context.minRaiseTo) {
    allowed.push('raise')
  }

  return allowed
}

function invalid(reason: string): ActionValidationResult {
  return { ok: false, reason }
}

function validateCommonActionPreconditions(state: InternalRoomState, seatId: SeatId): SeatActionContext | ActionValidationResult {
  if (!canSeatActNow(state, seatId)) {
    return invalid('Seat cannot act in the current state.')
  }

  const context = getSeatActionContext(state, seatId)

  if (!context) {
    return invalid('Seat does not exist or is not occupied.')
  }

  if (context.stack <= 0) {
    return invalid('Seat has no chips left to act with.')
  }

  return context
}

export function validateActionRequest(
  state: InternalRoomState,
  seatId: SeatId,
  action: ActionRequest,
): ActionValidationResult {
  const common = validateCommonActionPreconditions(state, seatId)

  if ('ok' in common) {
    return common
  }

  const context = common

  switch (action.type) {
    case 'fold':
      return {
        ok: true,
        value: {
          requestedType: 'fold',
          resolvedType: 'fold',
          targetCommitted: context.committed,
          addedChips: 0,
          isAllIn: false,
          isFullRaise: false,
        },
      }

    case 'check':
      if (!context.canCheck) {
        return invalid('Check is only legal when there is no outstanding bet to call.')
      }

      return {
        ok: true,
        value: {
          requestedType: 'check',
          resolvedType: 'check',
          targetCommitted: context.committed,
          addedChips: 0,
          isAllIn: false,
          isFullRaise: false,
        },
      }

    case 'call': {
      if (!context.isFacingBet) {
        return invalid('Call is only legal when facing a bet.')
      }

      const targetCommitted = Math.min(context.currentBet, context.maxCommitted)

      return {
        ok: true,
        value: {
          requestedType: 'call',
          resolvedType: 'call',
          targetCommitted,
          addedChips: targetCommitted - context.committed,
          isAllIn: targetCommitted === context.maxCommitted,
          isFullRaise: false,
        },
      }
    }

    case 'bet': {
      if (!isPositiveInteger(action.amount)) {
        return invalid('Bet amount must be a positive integer target amount.')
      }

      if (!context.canCheck) {
        return invalid('Bet is only legal when no bet is currently being faced.')
      }

      if (action.amount <= context.committed) {
        return invalid('Bet target must exceed the seat committed amount.')
      }

      if (action.amount > context.maxCommitted) {
        return invalid('Bet target exceeds the seat stack.')
      }

      const isAllIn = action.amount === context.maxCommitted
      const isFullRaise = action.amount >= context.minOpenBetTo

      if (!isFullRaise && !isAllIn) {
        return invalid('Opening bet must be at least the big blind unless it is an all-in bet.')
      }

      return {
        ok: true,
        value: {
          requestedType: 'bet',
          resolvedType: 'bet',
          targetCommitted: action.amount,
          addedChips: action.amount - context.committed,
          isAllIn,
          isFullRaise,
        },
      }
    }

    case 'raise': {
      if (!isPositiveInteger(action.amount)) {
        return invalid('Raise amount must be a positive integer target amount.')
      }

      if (!context.isFacingBet || context.minRaiseTo === null) {
        return invalid('Raise is only legal when facing a bet.')
      }

      if (action.amount <= context.currentBet) {
        return invalid('Raise target must exceed the current bet.')
      }

      if (action.amount > context.maxCommitted) {
        return invalid('Raise target exceeds the seat stack.')
      }

      const isAllIn = action.amount === context.maxCommitted
      const isFullRaise = action.amount >= context.minRaiseTo

      if (!isFullRaise && !isAllIn) {
        return invalid('Raise target must meet the minimum raise unless it is an all-in raise.')
      }

      return {
        ok: true,
        value: {
          requestedType: 'raise',
          resolvedType: 'raise',
          targetCommitted: action.amount,
          addedChips: action.amount - context.committed,
          isAllIn,
          isFullRaise,
        },
      }
    }

    case 'all-in': {
      const targetCommitted = context.maxCommitted

      if (targetCommitted <= context.committed) {
        return invalid('All-in requires chips that are not yet committed.')
      }

      if (!context.isFacingBet) {
        return {
          ok: true,
          value: {
            requestedType: 'all-in',
            resolvedType: context.currentBet === 0 ? 'bet' : 'raise',
            targetCommitted,
            addedChips: targetCommitted - context.committed,
            isAllIn: true,
            isFullRaise:
              context.currentBet === 0
                ? targetCommitted >= context.minOpenBetTo
                : context.minRaiseTo !== null && targetCommitted >= context.minRaiseTo,
          },
        }
      }

      if (targetCommitted <= context.currentBet) {
        return {
          ok: true,
          value: {
            requestedType: 'all-in',
            resolvedType: 'call',
            targetCommitted,
            addedChips: targetCommitted - context.committed,
            isAllIn: true,
            isFullRaise: false,
          },
        }
      }

      return {
        ok: true,
        value: {
          requestedType: 'all-in',
          resolvedType: 'raise',
          targetCommitted,
          addedChips: targetCommitted - context.committed,
          isAllIn: true,
          isFullRaise: context.minRaiseTo !== null && targetCommitted >= context.minRaiseTo,
        },
      }
    }
  }
}
