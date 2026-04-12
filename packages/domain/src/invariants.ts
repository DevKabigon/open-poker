import { type CardCode } from './cards'
import { getTableConfigValidationIssues, type ValidationIssue } from './rules'
import { type InternalRoomState, type PlayerSeatState, type SeatId, type Street } from './state'

export interface RoomStateIssue {
  path: string
  message: string
}

export class RoomStateInvariantError extends Error {
  readonly issues: RoomStateIssue[]

  constructor(issues: RoomStateIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '))
    this.name = 'RoomStateInvariantError'
    this.issues = issues
  }
}

function addIssues(target: RoomStateIssue[], issues: ValidationIssue[]): void {
  for (const issue of issues) {
    target.push(issue)
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function getExpectedBoardSize(street: Street): number {
  switch (street) {
    case 'idle':
    case 'preflop':
      return 0
    case 'flop':
      return 3
    case 'turn':
      return 4
    case 'river':
    case 'showdown':
      return 5
  }
}

function collectKnownCards(state: InternalRoomState): Array<{ path: string; card: CardCode }> {
  const cards: Array<{ path: string; card: CardCode }> = []

  state.board.forEach((card, index) => {
    cards.push({ path: `board[${index}]`, card })
  })

  state.seats.forEach((seat, seatIndex) => {
    seat.holeCards?.forEach((card, cardIndex) => {
      cards.push({ path: `seats[${seatIndex}].holeCards[${cardIndex}]`, card })
    })
  })

  state.burnCards.forEach((card, index) => {
    cards.push({ path: `burnCards[${index}]`, card })
  })

  state.deck.forEach((card, index) => {
    cards.push({ path: `deck[${index}]`, card })
  })

  return cards
}

function isSeatActionable(seat: PlayerSeatState): boolean {
  return seat.playerId !== null && !seat.hasFolded && !seat.isAllIn && !seat.isSittingOut
}

function validateSeatCollection(state: InternalRoomState, issues: RoomStateIssue[]): void {
  const seenSeatIds = new Set<number>()
  const seenPlayerIds = new Set<string>()

  state.seats.forEach((seat, index) => {
    const path = `seats[${index}]`

    if (!Number.isInteger(seat.seatId) || seat.seatId < 0 || seat.seatId >= state.config.maxSeats) {
      issues.push({
        path: `${path}.seatId`,
        message: `Seat id must be an integer between 0 and ${state.config.maxSeats - 1}.`,
      })
    }

    if (seenSeatIds.has(seat.seatId)) {
      issues.push({ path: `${path}.seatId`, message: 'Seat ids must be unique.' })
    }

    seenSeatIds.add(seat.seatId)

    for (const amountPath of ['stack', 'committed', 'totalCommitted'] as const) {
      if (!isNonNegativeInteger(seat[amountPath])) {
        issues.push({
          path: `${path}.${amountPath}`,
          message: `${amountPath} must be a non-negative integer.`,
        })
      }
    }

    if (seat.committed > seat.totalCommitted) {
      issues.push({
        path: `${path}.committed`,
        message: 'committed must not exceed totalCommitted.',
      })
    }

    const playerId = seat.playerId
    const isEmptySeat = playerId === null

    if (isEmptySeat) {
      if (seat.displayName !== null) {
        issues.push({ path: `${path}.displayName`, message: 'Empty seats must not have a displayName.' })
      }

      if (seat.stack !== 0 || seat.committed !== 0 || seat.totalCommitted !== 0) {
        issues.push({ path, message: 'Empty seats must not carry chips.' })
      }

      if (seat.hasFolded || seat.isAllIn || seat.isSittingOut || seat.isDisconnected || seat.actedThisStreet) {
        issues.push({ path, message: 'Empty seats must not carry participation flags.' })
      }

      if (seat.holeCards !== null) {
        issues.push({ path: `${path}.holeCards`, message: 'Empty seats must not have hole cards.' })
      }

      return
    }

    if (playerId.trim().length === 0) {
      issues.push({ path: `${path}.playerId`, message: 'Occupied seats must have a non-empty playerId.' })
    }

    if (seenPlayerIds.has(playerId)) {
      issues.push({ path: `${path}.playerId`, message: 'playerId values must be unique across occupied seats.' })
    }

    seenPlayerIds.add(playerId)

    if (seat.holeCards !== null && seat.holeCards[0] === seat.holeCards[1]) {
      issues.push({ path: `${path}.holeCards`, message: 'A player cannot hold the same card twice.' })
    }
  })
}

function validateSeatPointers(state: InternalRoomState, issues: RoomStateIssue[]): void {
  const seatById = new Map(state.seats.map((seat) => [seat.seatId, seat]))

  for (const pointer of ['dealerSeat', 'smallBlindSeat', 'bigBlindSeat', 'actingSeat'] as const) {
    const seatId = state[pointer]

    if (seatId === null) {
      continue
    }

    const seat = seatById.get(seatId)

    if (!seat || seat.playerId === null) {
      issues.push({ path: pointer, message: 'Seat pointer must reference an occupied seat.' })
    }
  }

  if (state.actingSeat !== null) {
    const actingSeat = seatById.get(state.actingSeat)

    if (!actingSeat || !isSeatActionable(actingSeat)) {
      issues.push({ path: 'actingSeat', message: 'actingSeat must reference an actionable seat.' })
    }

    if (!state.pendingActionSeatIds.includes(state.actingSeat)) {
      issues.push({
        path: 'pendingActionSeatIds',
        message: 'actingSeat must be included in pendingActionSeatIds.',
      })
    }
  }

  const seenPending = new Set<SeatId>()

  state.pendingActionSeatIds.forEach((seatId, index) => {
    if (seenPending.has(seatId)) {
      issues.push({
        path: `pendingActionSeatIds[${index}]`,
        message: 'pendingActionSeatIds must not contain duplicates.',
      })
    }

    seenPending.add(seatId)

    const seat = seatById.get(seatId)

    if (!seat || !isSeatActionable(seat)) {
      issues.push({
        path: `pendingActionSeatIds[${index}]`,
        message: 'pendingActionSeatIds must contain only actionable seats.',
      })
    }
  })

  const seenRaiseRights = new Set<SeatId>()

  state.raiseRightsSeatIds.forEach((seatId, index) => {
    if (seenRaiseRights.has(seatId)) {
      issues.push({
        path: `raiseRightsSeatIds[${index}]`,
        message: 'raiseRightsSeatIds must not contain duplicates.',
      })
    }

    seenRaiseRights.add(seatId)

    if (!state.pendingActionSeatIds.includes(seatId)) {
      issues.push({
        path: `raiseRightsSeatIds[${index}]`,
        message: 'raiseRightsSeatIds must be a subset of pendingActionSeatIds.',
      })
    }

    const seat = seatById.get(seatId)

    if (!seat || !isSeatActionable(seat)) {
      issues.push({
        path: `raiseRightsSeatIds[${index}]`,
        message: 'raiseRightsSeatIds must contain only actionable seats.',
      })
    }
  })
}

function validateCards(state: InternalRoomState, issues: RoomStateIssue[]): void {
  if (state.board.length !== getExpectedBoardSize(state.street)) {
    issues.push({
      path: 'board',
      message: `Board must contain ${getExpectedBoardSize(state.street)} cards during ${state.street}.`,
    })
  }

  const seen = new Map<CardCode, string>()

  for (const entry of collectKnownCards(state)) {
    const previous = seen.get(entry.card)

    if (previous) {
      issues.push({
        path: entry.path,
        message: `Card ${entry.card} is duplicated with ${previous}.`,
      })
      continue
    }

    seen.set(entry.card, entry.path)
  }
}

function validateBettingState(state: InternalRoomState, issues: RoomStateIssue[]): void {
  if (!isNonNegativeInteger(state.mainPot)) {
    issues.push({ path: 'mainPot', message: 'mainPot must be a non-negative integer.' })
  }

  if (!isNonNegativeInteger(state.currentBet)) {
    issues.push({ path: 'currentBet', message: 'currentBet must be a non-negative integer.' })
  }

  if (!isNonNegativeInteger(state.lastFullRaiseSize)) {
    issues.push({ path: 'lastFullRaiseSize', message: 'lastFullRaiseSize must be a non-negative integer.' })
  }

  const maxCommitted = state.seats.reduce((max, seat) => Math.max(max, seat.committed), 0)

  if (state.currentBet !== maxCommitted) {
    issues.push({
      path: 'currentBet',
      message: 'currentBet must equal the maximum committed amount across all seats.',
    })
  }

  state.sidePots.forEach((pot, potIndex) => {
    if (!isNonNegativeInteger(pot.amount) || pot.amount === 0) {
      issues.push({
        path: `sidePots[${potIndex}].amount`,
        message: 'Each side pot amount must be a positive integer.',
      })
    }
  })
}

function validateLifecycle(state: InternalRoomState, issues: RoomStateIssue[]): void {
  if (state.roomId.trim().length === 0) {
    issues.push({ path: 'roomId', message: 'roomId must be a non-empty string.' })
  }

  if (!Number.isInteger(state.handNumber) || state.handNumber < 0) {
    issues.push({ path: 'handNumber', message: 'handNumber must be a non-negative integer.' })
  }

  if (!Number.isInteger(state.roomVersion) || state.roomVersion < 0) {
    issues.push({ path: 'roomVersion', message: 'roomVersion must be a non-negative integer.' })
  }

  if (!Number.isInteger(state.actionSequence) || state.actionSequence < 0) {
    issues.push({ path: 'actionSequence', message: 'actionSequence must be a non-negative integer.' })
  }

  if (state.handStatus === 'waiting') {
    if (state.handId !== null) {
      issues.push({ path: 'handId', message: 'handId must be null while waiting for a hand to start.' })
    }

    if (state.street !== 'idle') {
      issues.push({ path: 'street', message: 'street must be idle while handStatus is waiting.' })
    }

    if (state.actingSeat !== null || state.pendingActionSeatIds.length > 0) {
      issues.push({
        path: 'pendingActionSeatIds',
        message: 'There must be no acting seat or pending actions while waiting.',
      })
    }

    if (state.raiseRightsSeatIds.length > 0) {
      issues.push({
        path: 'raiseRightsSeatIds',
        message: 'raiseRightsSeatIds must be empty while waiting.',
      })
    }

    if (state.mainPot !== 0 || state.sidePots.length > 0 || state.currentBet !== 0) {
      issues.push({
        path: 'mainPot',
        message: 'Pot and currentBet values must be reset while waiting.',
      })
    }
  } else if (state.handId === null) {
    issues.push({ path: 'handId', message: 'handId is required once a hand is in progress or settled.' })
  }
}

export function getRoomStateInvariantIssues(state: InternalRoomState): RoomStateIssue[] {
  const issues: RoomStateIssue[] = []

  addIssues(issues, getTableConfigValidationIssues(state.config))

  if (state.seats.length !== state.config.maxSeats) {
    issues.push({
      path: 'seats',
      message: `seats must contain exactly ${state.config.maxSeats} entries.`,
    })
  }

  validateLifecycle(state, issues)
  validateSeatCollection(state, issues)
  validateSeatPointers(state, issues)
  validateCards(state, issues)
  validateBettingState(state, issues)

  return issues
}

export function assertRoomStateInvariants(state: InternalRoomState): void {
  const issues = getRoomStateInvariantIssues(state)

  if (issues.length > 0) {
    throw new RoomStateInvariantError(issues)
  }
}
