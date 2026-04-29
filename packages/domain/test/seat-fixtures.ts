import { createInitialRoomState, type InternalRoomState, type SeatId } from '../src'

export interface SeatFixture {
  seatId: SeatId
  playerId?: string
  displayName?: string
  stack?: number
  committed?: number
  totalCommitted?: number
  hasFolded?: boolean
  isAllIn?: boolean
  isSittingOut?: boolean
  isDisconnected?: boolean
  isWaitingForNextHand?: boolean
}

export function createSeatFixtureState(fixtures: SeatFixture[]): InternalRoomState {
  const state = createInitialRoomState('test-room', {
    now: '2026-04-13T00:00:00.000Z',
  })

  for (const fixture of fixtures) {
    state.seats[fixture.seatId] = {
      ...state.seats[fixture.seatId],
      playerId: fixture.playerId ?? `player-${fixture.seatId}`,
      displayName: fixture.displayName ?? `Player ${fixture.seatId}`,
      stack: fixture.stack ?? 10_000,
      committed: fixture.committed ?? 0,
      totalCommitted: fixture.totalCommitted ?? fixture.committed ?? 0,
      hasFolded: fixture.hasFolded ?? false,
      isAllIn: fixture.isAllIn ?? false,
      isSittingOut: fixture.isSittingOut ?? false,
      isDisconnected: fixture.isDisconnected ?? false,
      isWaitingForNextHand: fixture.isWaitingForNextHand ?? false,
    }
  }

  return state
}
