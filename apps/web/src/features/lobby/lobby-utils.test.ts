import { describe, expect, it } from 'vitest'
import type { LobbyRoomView } from '@openpoker/protocol'
import {
  formatBlindLabel,
  formatBuyInRange,
  formatChipAmount,
  formatRoomStatus,
  getRoomOccupancyTone,
  groupRoomsByStake,
} from './lobby-utils'

describe('lobby utilities', () => {
  it('groups rooms by stake and sorts stakes by blind size', () => {
    const groups = groupRoomsByStake([
      createRoom({ roomId: 'b', stakeKey: '2-5', tableNumber: 2, smallBlind: 200, bigBlind: 500 }),
      createRoom({ roomId: 'a', stakeKey: '1-2', tableNumber: 2, smallBlind: 100, bigBlind: 200 }),
      createRoom({ roomId: 'c', stakeKey: '1-2', tableNumber: 1, smallBlind: 100, bigBlind: 200 }),
    ])

    expect(groups.map((group) => group.label)).toEqual(['$1.00/$2.00', '$2.00/$5.00'])
    expect(groups[0]?.rooms.map((room) => room.tableNumber)).toEqual([1, 2])
  })

  it('formats money and blind labels from integer cents', () => {
    expect(formatChipAmount(125000)).toBe('$1,250.00')
    expect(formatBlindLabel(500, 1000)).toBe('$5.00/$10.00')
    expect(formatBuyInRange(createRoom({ minBuyIn: 10000, maxBuyIn: 40000 }))).toBe('$100.00 - $400.00')
  })

  it('formats active streets and waiting statuses', () => {
    expect(formatRoomStatus(createRoom({ handStatus: 'waiting', street: 'idle' }))).toBe('Waiting')
    expect(formatRoomStatus(createRoom({ handStatus: 'in-hand', street: 'turn' }))).toBe('Turn')
  })

  it('derives occupancy tone', () => {
    expect(getRoomOccupancyTone(createRoom({ occupiedSeatCount: 0, maxSeats: 6 }))).toBe('empty')
    expect(getRoomOccupancyTone(createRoom({ occupiedSeatCount: 3, maxSeats: 6 }))).toBe('open')
    expect(getRoomOccupancyTone(createRoom({ occupiedSeatCount: 6, maxSeats: 6 }))).toBe('full')
  })
})

function createRoom(overrides: Partial<LobbyRoomView> = {}): LobbyRoomView {
  return {
    roomId: 'cash-nlhe-1-2-table-01',
    stakeKey: '1-2',
    tableNumber: 1,
    displayName: 'NLH $1/$2 - Table 01',
    smallBlind: 100,
    bigBlind: 200,
    minBuyIn: 10000,
    maxBuyIn: 40000,
    maxSeats: 6,
    occupiedSeatCount: 0,
    handEligibleSeatCount: 0,
    roomVersion: 0,
    handStatus: 'waiting',
    street: 'idle',
    nextHandStartAt: null,
    ...overrides,
  }
}
