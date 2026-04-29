import { describe, expect, it } from 'vitest'
import { createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import { createEmptyPokerRoomSessionState } from '../src/durable-objects/poker-room-sessions'
import { claimSeat, leaveSeat } from '../src/durable-objects/poker-room-seating'

function createRoomState(): InternalRoomState {
  return createInitialRoomState('room-1', {
    now: '2026-04-13T00:00:00.000Z',
  })
}

describe('poker room seating', () => {
  it('claims an empty seat, applies the buy-in, and issues a seat session', () => {
    const roomState = createRoomState()

    const result = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 3,
        playerId: 'player-3',
        displayName: 'Player 3',
        buyIn: 12_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-3',
    )

    expect(result.nextRoomState.seats[3]).toMatchObject({
      seatId: 3,
      playerId: 'player-3',
      displayName: 'Player 3',
      stack: 12_000,
      isSittingOut: false,
      isDisconnected: false,
    })
    expect(result.session).toEqual({
      token: 'seat-token-3',
      seatId: 3,
      playerId: 'player-3',
      issuedAt: '2026-04-13T18:00:00.000Z',
    })
  })

  it('rejects seat claims that are out of the configured buy-in range', () => {
    const roomState = createRoomState()

    expect(() =>
      claimSeat(
        roomState,
        createEmptyPokerRoomSessionState(),
        {
          seatId: 1,
          playerId: 'player-1',
          buyIn: 1_000,
        },
        '2026-04-13T18:00:00.000Z',
      ),
    ).toThrow('buyIn must be between 5000 and 20000')
  })

  it('rejects claims for occupied seats or already seated players', () => {
    const roomState = createRoomState()
    const first = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 1,
        playerId: 'player-1',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-1',
    )

    expect(() =>
      claimSeat(
        first.nextRoomState,
        first.nextSessionState,
        {
          seatId: 1,
          playerId: 'player-2',
          buyIn: 10_000,
        },
        '2026-04-13T18:01:00.000Z',
      ),
    ).toThrow('Seat 1 is already occupied.')

    expect(() =>
      claimSeat(
        first.nextRoomState,
        first.nextSessionState,
        {
          seatId: 2,
          playerId: 'player-1',
          buyIn: 10_000,
        },
        '2026-04-13T18:01:00.000Z',
      ),
    ).toThrow('Player player-1 is already seated at seat 1.')
  })

  it('allows new seat claims while a hand is running and marks them for the next hand', () => {
    const roomState = createRoomState()
    roomState.handStatus = 'in-hand'
    roomState.street = 'preflop'

    const result = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 1,
        playerId: 'player-1',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-1',
    )

    expect(result.nextRoomState.seats[1]).toMatchObject({
      playerId: 'player-1',
      stack: 10_000,
      committed: 0,
      totalCommitted: 0,
      holeCards: null,
      isWaitingForNextHand: true,
    })
    expect(result.session.token).toBe('seat-token-1')
  })

  it('fully clears a seat when the player leaves outside an active hand', () => {
    const roomState = createRoomState()
    const claimed = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 4,
        playerId: 'player-4',
        buyIn: 9_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-4',
    )

    const result = leaveSeat(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-4',
      4,
      '2026-04-13T18:05:00.000Z',
    )

    expect(result.disposition).toBe('cleared')
    expect(result.nextRoomState.seats[4]).toMatchObject({
      seatId: 4,
      playerId: null,
      displayName: null,
      stack: 0,
    })
    expect(result.nextSessionState.sessions).toEqual([])
  })

  it('marks the seat sitting-out and disconnected when leaving mid-hand', () => {
    const roomState = createRoomState()
    const claimed = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 2,
        playerId: 'player-2',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-2',
    )

    claimed.nextRoomState.handStatus = 'in-hand'
    claimed.nextRoomState.street = 'turn'
    claimed.nextRoomState.seats[2] = {
      ...claimed.nextRoomState.seats[2]!,
      committed: 400,
      totalCommitted: 2_000,
      holeCards: ['As', 'Kh'],
    }

    const result = leaveSeat(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-2',
      2,
      '2026-04-13T18:06:00.000Z',
    )

    expect(result.disposition).toBe('sitting-out')
    expect(result.nextRoomState.seats[2]).toMatchObject({
      seatId: 2,
      playerId: 'player-2',
      isSittingOut: true,
      isDisconnected: true,
      committed: 400,
      totalCommitted: 2_000,
      holeCards: ['As', 'Kh'],
    })
    expect(result.nextSessionState.sessions).toEqual([])
  })

  it('clears a next-hand waiting seat when it leaves before joining a hand', () => {
    const roomState = createRoomState()
    roomState.handStatus = 'in-hand'
    roomState.street = 'turn'

    const claimed = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 5,
        playerId: 'player-5',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-5',
    )

    const result = leaveSeat(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-5',
      5,
      '2026-04-13T18:06:00.000Z',
    )

    expect(result.disposition).toBe('cleared')
    expect(result.nextRoomState.seats[5]).toMatchObject({
      seatId: 5,
      playerId: null,
      stack: 0,
      isWaitingForNextHand: false,
    })
    expect(result.nextSessionState.sessions).toEqual([])
  })
})
