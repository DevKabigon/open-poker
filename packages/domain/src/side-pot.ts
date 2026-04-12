import { type PlayerSeatState, type PotState, type SeatId } from './state'

export interface PotParticipant {
  seatId: SeatId
  committed: number
  isEligible: boolean
}

export interface SidePotSlice extends PotState {
  contributingSeatIds: SeatId[]
}

export interface UncalledBetReturn {
  seatId: SeatId
  amount: number
}

export interface SidePotCalculationResult {
  pots: SidePotSlice[]
  mainPot: number
  sidePots: PotState[]
  totalPot: number
  uncalledBetReturn: UncalledBetReturn | null
}

function sortSeatIdsAscending(seatIds: SeatId[]): SeatId[] {
  return [...seatIds].sort((left, right) => left - right)
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validateParticipants(participants: PotParticipant[]): void {
  const seenSeatIds = new Set<SeatId>()

  participants.forEach((participant, index) => {
    if (!Number.isInteger(participant.seatId) || participant.seatId < 0) {
      throw new Error(`Participant ${index} has an invalid seatId.`)
    }

    if (seenSeatIds.has(participant.seatId)) {
      throw new Error(`Participant seatId ${participant.seatId} is duplicated.`)
    }

    seenSeatIds.add(participant.seatId)

    if (!isNonNegativeInteger(participant.committed)) {
      throw new Error(`Participant ${participant.seatId} committed amount must be a non-negative integer.`)
    }
  })
}

function createEmptyResult(): SidePotCalculationResult {
  return {
    pots: [],
    mainPot: 0,
    sidePots: [],
    totalPot: 0,
    uncalledBetReturn: null,
  }
}

function mapPotsToState(pots: SidePotSlice[]): PotState[] {
  return pots.map((pot) => ({
    amount: pot.amount,
    eligibleSeatIds: [...pot.eligibleSeatIds],
  }))
}

export function getPotParticipantsFromSeats(seats: PlayerSeatState[]): PotParticipant[] {
  return seats
    .filter((seat) => seat.playerId !== null && seat.totalCommitted > 0)
    .map((seat) => ({
      seatId: seat.seatId,
      committed: seat.totalCommitted,
      isEligible: !seat.hasFolded,
    }))
}

export function calculateSidePots(participants: PotParticipant[]): SidePotCalculationResult {
  validateParticipants(participants)

  const contributingParticipants = participants
    .filter((participant) => participant.committed > 0)
    .sort((left, right) => left.committed - right.committed || left.seatId - right.seatId)

  if (contributingParticipants.length === 0) {
    return createEmptyResult()
  }

  const commitmentLevels = [...new Set(contributingParticipants.map((participant) => participant.committed))]
  const pots: SidePotSlice[] = []
  let previousLevel = 0
  let uncalledBetReturn: UncalledBetReturn | null = null

  for (const level of commitmentLevels) {
    const sliceSize = level - previousLevel

    if (sliceSize <= 0) {
      previousLevel = level
      continue
    }

    const contributors = contributingParticipants.filter((participant) => participant.committed >= level)
    const amount = sliceSize * contributors.length

    if (contributors.length === 1) {
      const contributor = contributors[0]!
      const carriedForwardAmount: number =
        uncalledBetReturn !== null && uncalledBetReturn.seatId === contributor.seatId ? uncalledBetReturn.amount : 0

      uncalledBetReturn = {
        seatId: contributor.seatId,
        amount: carriedForwardAmount + amount,
      }

      previousLevel = level
      continue
    }

    const eligibleSeatIds = sortSeatIdsAscending(
      contributors.filter((participant) => participant.isEligible).map((participant) => participant.seatId),
    )

    if (eligibleSeatIds.length === 0) {
      throw new Error(`Pot slice capped at ${level} has no eligible seats.`)
    }

    pots.push({
      amount,
      eligibleSeatIds,
      contributingSeatIds: sortSeatIdsAscending(contributors.map((participant) => participant.seatId)),
    })

    previousLevel = level
  }

  const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0)

  return {
    pots,
    mainPot: pots[0]?.amount ?? 0,
    sidePots: mapPotsToState(pots.slice(1)),
    totalPot,
    uncalledBetReturn,
  }
}

export function calculateSidePotsFromSeats(seats: PlayerSeatState[]): SidePotCalculationResult {
  return calculateSidePots(getPotParticipantsFromSeats(seats))
}
