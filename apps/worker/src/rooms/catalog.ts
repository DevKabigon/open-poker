import {
  createDefaultTableConfig,
  createInitialRoomState,
  type InternalRoomState,
  type TableConfig,
} from '@openpoker/domain'

export type CashStakeKey = '1-2' | '2-5' | '5-10'

export interface RoomCatalogEntry {
  roomId: string
  stakeKey: CashStakeKey
  tableNumber: number
  displayName: string
  smallBlind: number
  bigBlind: number
  minBuyIn: number
  maxBuyIn: number
  maxSeats: number
  config: TableConfig
}

interface StakeTemplate {
  stakeKey: CashStakeKey
  displayName: string
  smallBlind: number
  bigBlind: number
}

const CASH_TABLES_PER_STAKE = 10

const STAKE_TEMPLATES: StakeTemplate[] = [
  { stakeKey: '1-2', displayName: '$1/$2', smallBlind: 100, bigBlind: 200 },
  { stakeKey: '2-5', displayName: '$2/$5', smallBlind: 200, bigBlind: 500 },
  { stakeKey: '5-10', displayName: '$5/$10', smallBlind: 500, bigBlind: 1_000 },
]

function formatTableNumber(tableNumber: number): string {
  return tableNumber.toString().padStart(2, '0')
}

function createRoomId(stakeKey: CashStakeKey, tableNumber: number): string {
  return `cash-nlhe-${stakeKey}-table-${formatTableNumber(tableNumber)}`
}

function createEntry(template: StakeTemplate, tableNumber: number): RoomCatalogEntry {
  const config = createDefaultTableConfig({
    smallBlind: template.smallBlind,
    bigBlind: template.bigBlind,
    minBuyIn: template.bigBlind * 50,
    maxBuyIn: template.bigBlind * 200,
  })

  return {
    roomId: createRoomId(template.stakeKey, tableNumber),
    stakeKey: template.stakeKey,
    tableNumber,
    displayName: `${template.displayName} Table ${formatTableNumber(tableNumber)}`,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    minBuyIn: config.minBuyIn,
    maxBuyIn: config.maxBuyIn,
    maxSeats: config.maxSeats,
    config,
  }
}

export const ROOM_CATALOG: RoomCatalogEntry[] = STAKE_TEMPLATES.flatMap((template) =>
  Array.from({ length: CASH_TABLES_PER_STAKE }, (_, index) => createEntry(template, index + 1)),
)

export function getRoomCatalog(): RoomCatalogEntry[] {
  return ROOM_CATALOG.map((entry) => ({
    ...entry,
    config: { ...entry.config },
  }))
}

export function getRoomCatalogEntry(roomId: string): RoomCatalogEntry | null {
  const normalizedRoomId = roomId.trim()
  const entry = ROOM_CATALOG.find((candidate) => candidate.roomId === normalizedRoomId)

  if (!entry) {
    return null
  }

  return {
    ...entry,
    config: { ...entry.config },
  }
}

export function assertRoomCatalogEntry(roomId: string): RoomCatalogEntry {
  const entry = getRoomCatalogEntry(roomId)

  if (!entry) {
    throw new Error(`Unknown roomId ${roomId}.`)
  }

  return entry
}

export function createInitialCatalogRoomState(roomId: string, now?: string): InternalRoomState {
  const entry = assertRoomCatalogEntry(roomId)

  return createInitialRoomState(entry.roomId, {
    config: entry.config,
    now,
  })
}
