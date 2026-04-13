import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import {
  createEmptyPokerRoomSessionState,
  issueSeatSession,
  resolveSeatSession,
  revokeAllSeatSessions,
  revokeSeatSessions,
} from '../src/durable-objects/poker-room-sessions'

function createRoomState(): InternalRoomState {
  const state = createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })

  state.seats[2] = {
    ...state.seats[2],
    playerId: 'player-2',
    displayName: 'Player 2',
    stack: 10_000,
  }
  state.seats[4] = {
    ...state.seats[4],
    playerId: 'player-4',
    displayName: 'Player 4',
    stack: 10_000,
  }

  return state
}

describe('poker room sessions', () => {
  it('issues a single session token for an occupied seat', () => {
    const roomState = createRoomState()
    const result = issueSeatSession(
      roomState,
      createEmptyPokerRoomSessionState(),
      2,
      '2026-04-13T15:00:00.000Z',
      'token-seat-2',
    )

    expect(result.session).toEqual({
      token: 'token-seat-2',
      seatId: 2,
      playerId: 'player-2',
      issuedAt: '2026-04-13T15:00:00.000Z',
    })
    expect(result.nextState.sessions).toHaveLength(1)
  })

  it('replaces any previous token for the same seat when issuing a new one', () => {
    const roomState = createRoomState()
    const first = issueSeatSession(
      roomState,
      createEmptyPokerRoomSessionState(),
      2,
      '2026-04-13T15:00:00.000Z',
      'first-token',
    )
    const second = issueSeatSession(
      roomState,
      first.nextState,
      2,
      '2026-04-13T15:01:00.000Z',
      'second-token',
    )

    expect(second.nextState.sessions).toEqual([
      {
        token: 'second-token',
        seatId: 2,
        playerId: 'player-2',
        issuedAt: '2026-04-13T15:01:00.000Z',
      },
    ])
  })

  it('resolves only sessions that still match the current occupied player', () => {
    const roomState = createRoomState()
    const sessionState = issueSeatSession(
      roomState,
      createEmptyPokerRoomSessionState(),
      2,
      '2026-04-13T15:00:00.000Z',
      'token-seat-2',
    ).nextState

    expect(resolveSeatSession(roomState, sessionState, 'token-seat-2')?.seatId).toBe(2)

    roomState.seats[2] = {
      ...roomState.seats[2],
      playerId: 'new-player-2',
    }

    expect(resolveSeatSession(roomState, sessionState, 'token-seat-2')).toBeNull()
  })

  it('can revoke one seat or all seats session tokens', () => {
    const roomState = createRoomState()
    const withSeatTwo = issueSeatSession(
      roomState,
      createEmptyPokerRoomSessionState(),
      2,
      '2026-04-13T15:00:00.000Z',
      'token-seat-2',
    ).nextState
    const withBothSeats = issueSeatSession(
      roomState,
      withSeatTwo,
      4,
      '2026-04-13T15:00:10.000Z',
      'token-seat-4',
    ).nextState

    expect(revokeSeatSessions(withBothSeats, 2).sessions.map((session) => session.token)).toEqual(['token-seat-4'])
    expect(revokeAllSeatSessions().sessions).toEqual([])
  })
})
