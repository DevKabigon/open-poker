import { describe, expect, it } from 'vitest'
import {
  assertRoomCatalogEntry,
  createInitialCatalogRoomState,
  getRoomCatalog,
  getRoomCatalogEntry,
} from '../src/rooms/catalog'

describe('room catalog', () => {
  it('creates ten fixed tables for each supported cash stake', () => {
    const catalog = getRoomCatalog()

    expect(catalog).toHaveLength(30)
    expect(catalog.filter((room) => room.stakeKey === '1-2')).toHaveLength(10)
    expect(catalog.filter((room) => room.stakeKey === '2-5')).toHaveLength(10)
    expect(catalog.filter((room) => room.stakeKey === '5-10')).toHaveLength(10)
  })

  it('uses deterministic room ids and cash table configs', () => {
    const oneTwo = assertRoomCatalogEntry('cash-nlhe-1-2-table-01')
    const twoFive = assertRoomCatalogEntry('cash-nlhe-2-5-table-10')

    expect(oneTwo).toMatchObject({
      displayName: '$1/$2 Table 01',
      smallBlind: 100,
      bigBlind: 200,
      minBuyIn: 10_000,
      maxBuyIn: 40_000,
      maxSeats: 6,
    })
    expect(oneTwo.config).toMatchObject({
      smallBlind: 100,
      bigBlind: 200,
      minBuyIn: 10_000,
      maxBuyIn: 40_000,
    })

    expect(twoFive).toMatchObject({
      roomId: 'cash-nlhe-2-5-table-10',
      displayName: '$2/$5 Table 10',
      smallBlind: 200,
      bigBlind: 500,
      minBuyIn: 25_000,
      maxBuyIn: 100_000,
    })
  })

  it('rejects unknown room ids', () => {
    expect(getRoomCatalogEntry('custom-table')).toBeNull()
    expect(() => assertRoomCatalogEntry('custom-table')).toThrow('Unknown roomId custom-table.')
  })

  it('creates initial room state with the catalog table config', () => {
    const state = createInitialCatalogRoomState('cash-nlhe-5-10-table-03', '2026-04-25T10:00:00.000Z')

    expect(state.roomId).toBe('cash-nlhe-5-10-table-03')
    expect(state.config).toMatchObject({
      smallBlind: 500,
      bigBlind: 1_000,
      minBuyIn: 50_000,
      maxBuyIn: 200_000,
    })
    expect(state.createdAt).toBe('2026-04-25T10:00:00.000Z')
  })
})
