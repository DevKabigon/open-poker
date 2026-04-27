import type { RoomSnapshotMessage, TableActionType, TableHandStatus, TableStreet } from './table-view'

export interface ApiErrorResponse {
  ok: false
  reason: string
}

export interface LobbyRoomView {
  roomId: string
  stakeKey: string
  tableNumber: number
  displayName: string
  smallBlind: number
  bigBlind: number
  minBuyIn: number
  maxBuyIn: number
  maxSeats: number
  occupiedSeatCount: number
  handEligibleSeatCount: number
  roomVersion: number
  handStatus: TableHandStatus
  street: TableStreet
  nextHandStartAt: string | null
}

export interface LobbyRoomsResponse {
  rooms: LobbyRoomView[]
}

export interface RoomSnapshotResponse {
  ok: true
  roomId: string
  roomVersion: number
  snapshot: RoomSnapshotMessage
}

export interface RoomCommandResponse extends RoomSnapshotResponse {
  events: unknown[]
}

export interface ClaimSeatRequest {
  playerId: string
  buyIn: number
  displayName?: string | null
}

export interface ClaimSeatResponse extends RoomSnapshotResponse {
  seatId: number
  playerId: string
  sessionToken: string
}

export interface ResumeSeatSessionRequest {
  sessionToken: string
}

export interface ResumeSeatSessionResponse extends RoomSnapshotResponse {
  seatId: number
  playerId: string
  sessionToken: string
  issuedAt: string
}

export interface LeaveSeatRequest {
  sessionToken: string
}

export interface LeaveSeatResponse extends RoomSnapshotResponse {
  seatId: number
  playerId: string
  disposition: 'cleared' | 'sitting-out'
}

export interface SetShowdownRevealPreferenceRequest {
  sessionToken: string
  showCardsAtShowdown: boolean
}

export interface SetShowdownRevealPreferenceResponse extends RoomSnapshotResponse {
  seatId: number
  playerId: string
  showCardsAtShowdown: boolean
}

export type PlayerActionRequest =
  | { type: 'fold' | 'check' | 'call' | 'all-in' }
  | { type: Extract<TableActionType, 'bet' | 'raise'>; amount: number }

export interface RoomCommandRequest {
  command:
    | { type: 'act'; seatId: number; action: PlayerActionRequest; timestamp?: string }
    | { type: 'timeout'; seatId: number; timestamp?: string }
    | { type: 'advance-street'; timestamp?: string }
    | { type: 'settle-showdown'; timestamp?: string }
    | { type: 'start-hand'; seed: string | number; handId?: string; timestamp?: string }
  sessionToken?: string
}

export type ApiResponse<T> = T | ApiErrorResponse
