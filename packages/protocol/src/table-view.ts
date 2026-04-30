export type TableStreet = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type TableHandStatus = 'waiting' | 'in-hand' | 'showdown' | 'settled'
export type TableActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'
export type TableHandCategory =
  | 'high-card'
  | 'one-pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
export type TableCardCode = string

export interface PublicPotView {
  amount: number
  eligibleSeatIds: number[]
}

export interface PublicUncalledBetReturnView {
  seatId: number
  amount: number
}

export interface PublicSeatPayoutView {
  seatId: number
  amount: number
}

export interface PublicSeatNetPayoutView {
  seatId: number
  amount: number
}

export interface PublicSeatActionView {
  type: TableActionType
  amount: number | null
}

export interface PublicShowdownHandEvaluationView {
  seatId: number
  category: TableHandCategory | null
  bestCards: [TableCardCode, TableCardCode, TableCardCode, TableCardCode, TableCardCode] | null
  isRevealed: boolean
}

export interface PublicPotAwardView {
  potIndex: number
  amount: number
  eligibleSeatIds: number[]
  winnerSeatIds: number[]
  shares: PublicSeatPayoutView[]
}

export interface PublicShowdownSummaryView {
  handId: string | null
  handNumber: number
  handEvaluations: PublicShowdownHandEvaluationView[]
  potAwards: PublicPotAwardView[]
  payouts: PublicSeatPayoutView[]
  netPayouts: PublicSeatNetPayoutView[]
  uncalledBetReturn: PublicUncalledBetReturnView | null
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
  isSittingOutNextHand: boolean
  isDisconnected: boolean
  disconnectGraceExpiresAt: string | null
  isWaitingForNextHand: boolean
  actedThisStreet: boolean
  lastAction: PublicSeatActionView | null
  revealedHoleCards: [TableCardCode, TableCardCode] | null
}

export interface PublicTableView {
  roomId: string
  roomVersion: number
  handId: string | null
  handNumber: number
  handStatus: TableHandStatus
  street: TableStreet
  actionTimeoutMs: number
  actionDeadlineAt: string | null
  nextHandStartAt: string | null
  nextHandDelayMs: number | null
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
  showdownSummary: PublicShowdownSummaryView | null
  seats: PublicSeatView[]
}

export interface PrivatePlayerView {
  seatId: number
  playerId: string
  holeCards: [TableCardCode, TableCardCode] | null
  showCardsAtShowdown: boolean
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
    actionTimeoutMs: 30_000,
    actionDeadlineAt: null,
    nextHandStartAt: null,
    nextHandDelayMs: null,
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
    showdownSummary: null,
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
      isSittingOutNextHand: false,
      isDisconnected: false,
      disconnectGraceExpiresAt: null,
      isWaitingForNextHand: false,
      actedThisStreet: false,
      lastAction: null,
      revealedHoleCards: null,
    })),
  }
}
