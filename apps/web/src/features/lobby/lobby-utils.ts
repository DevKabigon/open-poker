import type { LobbyRoomView, TableHandStatus, TableStreet } from '@openpoker/protocol'

export interface StakeGroup {
  stakeKey: string
  label: string
  compactLabel: string
  rooms: LobbyRoomView[]
}

export interface StakeSummary {
  blindLabel: string
  buyInRange: string
  tableCount: number
  occupiedSeats: number
  maxSeats: number
  openTables: number
  activeHands: number
}

const STREET_LABELS: Record<TableStreet, string> = {
  idle: 'Idle',
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
}

const STATUS_LABELS: Record<TableHandStatus, string> = {
  waiting: 'Waiting',
  'in-hand': 'In hand',
  showdown: 'Showdown',
  settled: 'Settled',
}

export function groupRoomsByStake(rooms: LobbyRoomView[]): StakeGroup[] {
  const groups = new Map<string, LobbyRoomView[]>()

  for (const room of rooms) {
    groups.set(room.stakeKey, [...(groups.get(room.stakeKey) ?? []), room])
  }

  return Array.from(groups.entries())
    .map(([stakeKey, stakeRooms]) => ({
      stakeKey,
      label: createStakeLabel(stakeRooms[0]),
      compactLabel: createCompactStakeLabel(stakeRooms[0]),
      rooms: [...stakeRooms].sort((a, b) => a.tableNumber - b.tableNumber),
    }))
    .sort((a, b) => a.rooms[0]!.smallBlind - b.rooms[0]!.smallBlind)
}

export function summarizeStakeGroup(group: StakeGroup): StakeSummary {
  const firstRoom = group.rooms[0]

  return {
    blindLabel: group.label,
    buyInRange: firstRoom ? formatBuyInRange(firstRoom) : '$0.00 - $0.00',
    tableCount: group.rooms.length,
    occupiedSeats: group.rooms.reduce((total, room) => total + room.occupiedSeatCount, 0),
    maxSeats: group.rooms.reduce((total, room) => total + room.maxSeats, 0),
    openTables: group.rooms.filter((room) => room.occupiedSeatCount < room.maxSeats).length,
    activeHands: group.rooms.filter((room) => room.handStatus === 'in-hand' || room.handStatus === 'showdown').length,
  }
}

export function formatChipAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

export function formatBlindLabel(smallBlind: number, bigBlind: number): string {
  return `${formatChipAmount(smallBlind)}/${formatChipAmount(bigBlind)}`
}

export function formatCompactBlindLabel(smallBlind: number, bigBlind: number): string {
  return `${formatCompactChipAmount(smallBlind)}/${formatCompactChipAmount(bigBlind)}`
}

export function formatBuyInRange(room: Pick<LobbyRoomView, 'minBuyIn' | 'maxBuyIn'>): string {
  return `${formatChipAmount(room.minBuyIn)} - ${formatChipAmount(room.maxBuyIn)}`
}

export function formatRoomStatus(room: Pick<LobbyRoomView, 'handStatus' | 'street'>): string {
  if (room.handStatus === 'in-hand') {
    return STREET_LABELS[room.street]
  }

  return STATUS_LABELS[room.handStatus]
}

export function getRoomOccupancyTone(room: Pick<LobbyRoomView, 'occupiedSeatCount' | 'maxSeats'>): 'empty' | 'open' | 'full' {
  if (room.occupiedSeatCount === 0) {
    return 'empty'
  }

  if (room.occupiedSeatCount >= room.maxSeats) {
    return 'full'
  }

  return 'open'
}

function createStakeLabel(room: LobbyRoomView | undefined): string {
  if (!room) {
    return 'Unknown'
  }

  return formatBlindLabel(room.smallBlind, room.bigBlind)
}

function createCompactStakeLabel(room: LobbyRoomView | undefined): string {
  if (!room) {
    return 'Unknown'
  }

  return formatCompactBlindLabel(room.smallBlind, room.bigBlind)
}

function formatCompactChipAmount(amount: number): string {
  const value = amount / 100

  return `$${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value)}`
}
