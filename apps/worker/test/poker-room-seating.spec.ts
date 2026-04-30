import { describe, expect, it } from 'vitest'
import { assertRoomStateInvariants, createInitialRoomState, type InternalRoomState } from '@openpoker/domain'
import { createEmptyPokerRoomSessionState } from '../src/durable-objects/poker-room-sessions'
import {
  claimSeat,
  leaveSeat,
  setSitOutNextHand,
  sitInSeat,
} from '../src/durable-objects/poker-room-seating'

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

  it('fully clears a seat when a sitting-out player leaves', () => {
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
    const sittingOut = setSitOutNextHand(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-4',
      4,
      true,
      '2026-04-13T18:04:00.000Z',
    )

    const result = leaveSeat(
      sittingOut.nextRoomState,
      sittingOut.nextSessionState,
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

  it('allows a sitting-out button seat to leave after a settled hand', () => {
    const roomState = createRoomState()
    const first = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 0,
        playerId: 'button-player',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-0',
    )
    const second = claimSeat(
      first.nextRoomState,
      first.nextSessionState,
      {
        seatId: 1,
        playerId: 'big-blind-player',
        buyIn: 10_000,
      },
      '2026-04-13T18:01:00.000Z',
      'seat-token-1',
    )
    const settledState = {
      ...second.nextRoomState,
      handId: 'settled-hand',
      handNumber: 1,
      handStatus: 'settled' as const,
      street: 'preflop' as const,
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
    }
    const sittingOut = setSitOutNextHand(
      settledState,
      second.nextSessionState,
      'seat-token-0',
      0,
      true,
      '2026-04-13T18:04:00.000Z',
    )

    const result = leaveSeat(
      sittingOut.nextRoomState,
      sittingOut.nextSessionState,
      'seat-token-0',
      0,
      '2026-04-13T18:05:00.000Z',
    )

    expect(result.nextRoomState.seats[0]?.playerId).toBeNull()
    expect(result.nextRoomState.dealerSeat).toBe(0)
    expect(result.nextRoomState.smallBlindSeat).toBe(0)
    expect(() => assertRoomStateInvariants(result.nextRoomState)).not.toThrow()
  })

  it('rejects leaving before the seat is sitting out', () => {
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

    expect(() =>
      leaveSeat(
        claimed.nextRoomState,
        claimed.nextSessionState,
        'seat-token-2',
        2,
        '2026-04-13T18:06:00.000Z',
      ),
    ).toThrow('Seat must be sitting out before it can be left.')
  })

  it('marks an active player to sit out on the next hand without disconnecting them', () => {
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

    const result = setSitOutNextHand(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-2',
      2,
      true,
      '2026-04-13T18:06:00.000Z',
    )

    expect(result.nextRoomState.seats[2]).toMatchObject({
      seatId: 2,
      playerId: 'player-2',
      isSittingOut: false,
      isSittingOutNextHand: true,
      isDisconnected: false,
      committed: 400,
      totalCommitted: 2_000,
      holeCards: ['As', 'Kh'],
    })
    expect(result.nextSessionState.sessions).toEqual(claimed.nextSessionState.sessions)
  })

  it('rejects sitting out when a waiting-room start countdown depends on that seat', () => {
    const roomState = createRoomState()
    const first = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 0,
        playerId: 'player-0',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-0',
    )
    const second = claimSeat(
      first.nextRoomState,
      first.nextSessionState,
      {
        seatId: 1,
        playerId: 'player-1',
        buyIn: 10_000,
      },
      '2026-04-13T18:01:00.000Z',
      'seat-token-1',
    )

    expect(() =>
      setSitOutNextHand(
        second.nextRoomState,
        second.nextSessionState,
        'seat-token-1',
        1,
        true,
        '2026-04-13T18:01:01.000Z',
      ),
    ).toThrow('Cannot sit out next hand while this seat is needed for the queued hand to start.')
  })

  it('allows a waiting-room seat to sit out when enough eligible players remain', () => {
    const roomState = createRoomState()
    const first = claimSeat(
      roomState,
      createEmptyPokerRoomSessionState(),
      {
        seatId: 0,
        playerId: 'player-0',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-0',
    )
    const second = claimSeat(
      first.nextRoomState,
      first.nextSessionState,
      {
        seatId: 1,
        playerId: 'player-1',
        buyIn: 10_000,
      },
      '2026-04-13T18:01:00.000Z',
      'seat-token-1',
    )
    const third = claimSeat(
      second.nextRoomState,
      second.nextSessionState,
      {
        seatId: 2,
        playerId: 'player-2',
        buyIn: 10_000,
      },
      '2026-04-13T18:01:30.000Z',
      'seat-token-2',
    )

    const result = setSitOutNextHand(
      third.nextRoomState,
      third.nextSessionState,
      'seat-token-2',
      2,
      true,
      '2026-04-13T18:01:31.000Z',
    )

    expect(result.nextRoomState.seats[2]).toMatchObject({
      isSittingOut: true,
      isSittingOutNextHand: false,
    })
  })

  it('lets a next-hand waiting seat sit out and leave before joining a hand', () => {
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
    const sittingOut = setSitOutNextHand(
      claimed.nextRoomState,
      claimed.nextSessionState,
      'seat-token-5',
      5,
      true,
      '2026-04-13T18:05:00.000Z',
    )

    const result = leaveSeat(
      sittingOut.nextRoomState,
      sittingOut.nextSessionState,
      'seat-token-5',
      5,
      '2026-04-13T18:06:00.000Z',
    )

    expect(result.disposition).toBe('cleared')
    expect(result.nextRoomState.seats[5]).toMatchObject({
      seatId: 5,
      playerId: null,
      stack: 0,
      isSittingOut: false,
      isWaitingForNextHand: false,
    })
    expect(result.nextSessionState.sessions).toEqual([])
  })

  it('lets a sitting-out player sit back in for the next active hand', () => {
    const roomState = createRoomState()
    roomState.handStatus = 'in-hand'
    roomState.street = 'turn'
    roomState.seats[1] = {
      ...roomState.seats[1]!,
      playerId: 'player-1',
      displayName: 'Player 1',
      stack: 10_000,
      isSittingOut: true,
    }
    const sessionState = createEmptyPokerRoomSessionState()
    const claimed = claimSeat(
      createRoomState(),
      sessionState,
      {
        seatId: 1,
        playerId: 'player-1',
        buyIn: 10_000,
      },
      '2026-04-13T18:00:00.000Z',
      'seat-token-1',
    )
    const activeSittingOutState = {
      ...roomState,
      seats: roomState.seats.map((seat) => ({ ...seat })),
    }

    const result = sitInSeat(
      activeSittingOutState,
      claimed.nextSessionState,
      'seat-token-1',
      1,
      '2026-04-13T18:06:00.000Z',
    )

    expect(result.nextRoomState.seats[1]).toMatchObject({
      isSittingOut: false,
      isSittingOutNextHand: false,
      isWaitingForNextHand: true,
      isDisconnected: false,
    })
  })
})
