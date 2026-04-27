import { type CardCode } from './cards'
import { assertValidTableConfig, createDefaultTableConfig, type TableConfig } from './rules'

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type PlayerActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'all-in'
  | 'timeout'

export type SeatId = number
export type HandStatus = 'waiting' | 'in-hand' | 'showdown' | 'settled'

export interface PotState {
  amount: number
  eligibleSeatIds: SeatId[]
}

export interface PlayerSeatState {
  seatId: SeatId
  playerId: string | null
  displayName: string | null
  stack: number
  committed: number
  totalCommitted: number
  hasFolded: boolean
  isAllIn: boolean
  isSittingOut: boolean
  isDisconnected: boolean
  actedThisStreet: boolean
  showCardsAtShowdown: boolean
  holeCards: [CardCode, CardCode] | null
}

export interface InternalRoomState {
  roomId: string
  config: TableConfig
  handId: string | null
  handNumber: number
  roomVersion: number
  handStatus: HandStatus
  street: Street
  dealerSeat: SeatId | null
  smallBlindSeat: SeatId | null
  bigBlindSeat: SeatId | null
  actingSeat: SeatId | null
  pendingActionSeatIds: SeatId[]
  raiseRightsSeatIds: SeatId[]
  board: CardCode[]
  burnCards: CardCode[]
  deck: CardCode[]
  mainPot: number
  sidePots: PotState[]
  currentBet: number
  lastFullRaiseSize: number
  actionSequence: number
  seats: PlayerSeatState[]
  createdAt: string
  updatedAt: string
}

export interface CreateInitialRoomStateOptions {
  config?: Partial<TableConfig>
  now?: string
}

export function createEmptySeatState(seatId: SeatId): PlayerSeatState {
  return {
    seatId,
    playerId: null,
    displayName: null,
    stack: 0,
    committed: 0,
    totalCommitted: 0,
    hasFolded: false,
    isAllIn: false,
    isSittingOut: false,
    isDisconnected: false,
    actedThisStreet: false,
    showCardsAtShowdown: false,
    holeCards: null,
  }
}

export function createInitialRoomState(
  roomId: string,
  options: CreateInitialRoomStateOptions = {},
): InternalRoomState {
  const config = createDefaultTableConfig(options.config)
  assertValidTableConfig(config)

  const timestamp = options.now ?? new Date().toISOString()

  return {
    roomId,
    config,
    handId: null,
    handNumber: 0,
    roomVersion: 0,
    handStatus: 'waiting',
    street: 'idle',
    dealerSeat: null,
    smallBlindSeat: null,
    bigBlindSeat: null,
    actingSeat: null,
    pendingActionSeatIds: [],
    raiseRightsSeatIds: [],
    board: [],
    burnCards: [],
    deck: [],
    mainPot: 0,
    sidePots: [],
    currentBet: 0,
    lastFullRaiseSize: config.bigBlind,
    actionSequence: 0,
    seats: Array.from({ length: config.maxSeats }, (_, seatId) => createEmptySeatState(seatId)),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
