export type TableStreet = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type TableHandStatus = 'waiting' | 'in-hand' | 'showdown' | 'settled'
export type TableActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
export type TableCardCode = string

export interface PublicPotView {
  amount: number
  eligibleSeatIds: number[]
}

export interface PublicUncalledBetReturnView {
  seatId: number
  amount: number
}

export interface PublicSeatView {
  seatId: number
  playerId: string | null
  displayName: string | null
  isOccupied: boolean
  stack: number
  committed: number
  totalCommitted: number
  hasFolded: boolean
  isAllIn: boolean
  isSittingOut: boolean
  isDisconnected: boolean
  actedThisStreet: boolean
  revealedHoleCards: [TableCardCode, TableCardCode] | null
}

export interface PublicTableView {
  roomId: string
  roomVersion: number
  handId: string | null
  handNumber: number
  handStatus: TableHandStatus
  street: TableStreet
  nextHandStartAt: string | null
  dealerSeat: number | null
  smallBlindSeat: number | null
  bigBlindSeat: number | null
  actingSeat: number | null
  board: TableCardCode[]
  currentBet: number
  mainPot: number
  sidePots: PublicPotView[]
  totalPot: number
  uncalledBetReturn: PublicUncalledBetReturnView | null
  seats: PublicSeatView[]
}

export interface PrivatePlayerView {
  seatId: number
  playerId: string
  holeCards: [TableCardCode, TableCardCode] | null
  canAct: boolean
  allowedActions: TableActionType[]
  callAmount: number
  minBetOrRaiseTo: number | null
  maxBetOrRaiseTo: number | null
  actionDeadlineAt: string | null
}

export interface RoomSnapshotMessage {
  type: 'room-snapshot'
  roomVersion: number
  table: PublicTableView
  privateView: PrivatePlayerView | null
}

export interface CommandAckMessage {
  type: 'command-ack'
  commandId: string
  roomVersion: number
}

export interface CommandRejectedMessage {
  type: 'command-rejected'
  commandId: string
  reason: string
}

export type ClientToServerMessage =
  | { type: 'join-room'; roomId: string; sessionToken: string }
  | {
      type: 'player-action'
      commandId: string
      roomId: string
      action: TableActionType
      amount?: number
    }

export type ServerToClientMessage =
  | RoomSnapshotMessage
  | CommandAckMessage
  | CommandRejectedMessage

export function createEmptyPublicTableView(roomId: string, maxSeats = 6): PublicTableView {
  return {
    roomId,
    roomVersion: 0,
    handId: null,
    handNumber: 0,
    handStatus: 'waiting',
    street: 'idle',
    nextHandStartAt: null,
    dealerSeat: null,
    smallBlindSeat: null,
    bigBlindSeat: null,
    actingSeat: null,
    board: [],
    currentBet: 0,
    mainPot: 0,
    sidePots: [],
    totalPot: 0,
    uncalledBetReturn: null,
    seats: Array.from({ length: maxSeats }, (_, seatId) => ({
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
      isDisconnected: false,
      actedThisStreet: false,
      revealedHoleCards: null,
    })),
  }
}
