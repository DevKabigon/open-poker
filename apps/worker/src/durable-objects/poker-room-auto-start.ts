import {
  dispatchDomainCommand,
  getHandEligibleSeatIds,
  type DispatchDomainCommandResult,
  type InternalRoomState,
} from '@openpoker/domain'

export interface AutoStartHandResult extends DispatchDomainCommandResult {
  seed: string
}

export function canAutoStartHand(state: InternalRoomState): boolean {
  if (state.handStatus === 'showdown' || state.handStatus === 'in-hand') {
    return false
  }

  return getHandEligibleSeatIds(state.seats).length >= state.config.autoStartMinPlayers
}

export function canAutoStartHandImmediately(): boolean {
  return false
}

export function createAutoStartSeed(state: InternalRoomState, now: string): string {
  return `${state.roomId}:auto-start:${state.handNumber + 1}:${now}`
}

export function maybeAutoStartHand(
  state: InternalRoomState,
  now: string,
): AutoStartHandResult | null {
  if (!canAutoStartHand(state)) {
    return null
  }

  const seed = createAutoStartSeed(state, now)
  const result = dispatchDomainCommand(state, {
    type: 'start-hand',
    seed,
    timestamp: now,
  })

  return {
    ...result,
    seed,
  }
}
