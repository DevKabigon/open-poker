import type { LobbyRoomView, TableHandStatus, TableStreet } from '@openpoker/protocol'

export interface StakeGroup {
  stakeKey: string
  label: string
  rooms: LobbyRoomView[]
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
      rooms: [...stakeRooms].sort((a, b) => a.tableNumber - b.tableNumber),
    }))
    .sort((a, b) => a.rooms[0]!.smallBlind - b.rooms[0]!.smallBlind)
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
