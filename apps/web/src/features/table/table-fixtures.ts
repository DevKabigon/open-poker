import {
  createEmptyPublicTableView,
  type PrivatePlayerView,
  type PublicSeatView,
  type RoomSnapshotMessage,
} from '@openpoker/protocol'

export const TABLE_SKELETON_ROOM_ID = 'cash-nlhe-1-2-table-01'

export function createTableSkeletonSnapshot(
  roomId = TABLE_SKELETON_ROOM_ID,
  roomVersion = 0,
): RoomSnapshotMessage {
  const emptyTable = createEmptyPublicTableView(roomId, 6)
  const seats = emptyTable.seats.map((seat) => createSkeletonSeat(seat.seatId))
  const privateView: PrivatePlayerView = {
    seatId: 4,
    playerId: 'hero-player',
    holeCards: ['Qs', 'Qh'],
    showCardsAtShowdown: false,
    canAct: true,
    allowedActions: ['fold', 'call', 'raise'],
    callAmount: 800,
    minBetOrRaiseTo: 2400,
    maxBetOrRaiseTo: 24200,
    actionDeadlineAt: '2026-04-27T17:45:00.000Z',
  }

  return {
    type: 'room-snapshot',
    roomVersion,
    table: {
      ...emptyTable,
      roomVersion,
      handId: 'mock-hand-0001',
      handNumber: 42,
      handStatus: 'in-hand',
      street: 'flop',
      actionDeadlineAt: privateView.actionDeadlineAt,
      dealerSeat: 0,
      smallBlindSeat: 1,
      bigBlindSeat: 2,
      actingSeat: 4,
      board: ['Ah', '7d', '2c'],
      currentBet: 1200,
      mainPot: 3600,
      sidePots: [
        {
          amount: 1200,
          eligibleSeatIds: [2, 4],
        },
      ],
      totalPot: 4800,
      seats,
    },
    privateView,
  }
}

function createSkeletonSeat(seatId: number): PublicSeatView {
  const base: PublicSeatView = {
    seatId,
    playerId: null,
    displayName: null,
    isOccupied: false,
    stack: 0,
    committed: 0,
    totalCommitted: 0,
    hasFolded: false,
    isAllIn: false,
    isSittingOut: false,
    isSittingOutNextHand: false,
    isDisconnected: false,
    disconnectGraceExpiresAt: null,
    isWaitingForNextHand: false,
    actedThisStreet: false,
    lastAction: null,
    revealedHoleCards: null,
  }

  switch (seatId) {
    case 0:
      return {
        ...base,
        playerId: 'player-ivy',
        displayName: 'Ivy',
        isOccupied: true,
        stack: 28600,
        committed: 0,
        totalCommitted: 200,
        actedThisStreet: true,
        lastAction: { type: 'check', amount: null },
      }
    case 1:
      return {
        ...base,
        playerId: 'player-max',
        displayName: 'Max',
        isOccupied: true,
        stack: 19800,
        committed: 400,
        totalCommitted: 600,
        hasFolded: true,
        actedThisStreet: true,
        lastAction: { type: 'fold', amount: null },
      }
    case 2:
      return {
        ...base,
        playerId: 'player-rin',
        displayName: 'Rin',
        isOccupied: true,
        stack: 0,
        committed: 1200,
        totalCommitted: 3200,
        isAllIn: true,
        actedThisStreet: true,
        lastAction: { type: 'all-in', amount: 3200 },
      }
    case 3:
      return {
        ...base,
        playerId: 'player-sol',
        displayName: 'Sol',
        isOccupied: true,
        stack: 15400,
        committed: 0,
        totalCommitted: 0,
        isSittingOut: true,
      }
    case 4:
      return {
        ...base,
        playerId: 'hero-player',
        displayName: 'You',
        isOccupied: true,
        stack: 24200,
        committed: 400,
        totalCommitted: 1400,
      }
    default:
      return base
  }
}
