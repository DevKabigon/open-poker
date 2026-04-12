export interface PublicSeatView {
  seatId: number
  playerId: string | null
  name: string | null
  stack: number
  committed: number
  hasFolded: boolean
  isAllIn: boolean
  isDisconnected: boolean
}

export interface PublicTableView {
  roomId: string
  handId: string | null
  street: 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
  dealerSeat: number | null
  actingSeat: number | null
  board: string[]
  mainPot: number
  sidePots: Array<{ amount: number; eligibleSeatIds: number[] }>
  seats: PublicSeatView[]
}

export interface PrivatePlayerView {
  playerId: string
  holeCards: [string, string] | null
  allowedActions: Array<'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'>
  callAmount: number
  minRaiseTo: number | null
  maxRaiseTo: number | null
  actionDeadlineAt: string | null
}

export type ClientToServerMessage =
  | { type: 'join-room'; roomId: string; sessionToken: string }
  | {
      type: 'player-action'
      commandId: string
      roomId: string
      action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
      amount?: number
    }

export type ServerToClientMessage =
  | { type: 'room-snapshot'; roomVersion: number; table: PublicTableView; privateView?: PrivatePlayerView }
  | { type: 'command-ack'; commandId: string; roomVersion: number }
  | { type: 'command-rejected'; commandId: string; reason: string }

export function createEmptyPublicTableView(roomId: string): PublicTableView {
  return {
    roomId,
    handId: null,
    street: 'idle',
    dealerSeat: null,
    actingSeat: null,
    board: [],
    mainPot: 0,
    sidePots: [],
    seats: Array.from({ length: 6 }, (_, index) => ({
      seatId: index,
      playerId: null,
      name: null,
      stack: 0,
      committed: 0,
      hasFolded: false,
      isAllIn: false,
      isDisconnected: false,
    })),
  }
}
