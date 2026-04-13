import { type CardCode, isCardCode } from './cards'
import { type ValidatedAction } from './action-validation'
import { type BettingRoundResolution } from './betting-round'
import { type BlindSeatAssignments } from './blind-order'
import { type HoleCardAssignment } from './dealing'
import { type BlindPosting, type HandBootstrapResolution } from './hand-bootstrap'
import { getStreetTransitionPlan } from './street-transition'
import { type PotAward, type SeatPayout } from './showdown-settlement'
import { type UncalledBetReturn } from './side-pot'
import { type ValidationIssue } from './rules'
import { type SeatId, type Street } from './state'

export type ActionSource = 'player' | 'timeout'

export interface HandStartedEvent {
  type: 'hand-started'
  handId: string
  handNumber: number
  blindAssignments: BlindSeatAssignments
  blindPostings: BlindPosting[]
  holeCardAssignments: HoleCardAssignment[]
  remainingDeck: CardCode[]
  resolution: HandBootstrapResolution
  timestamp: string
}

export interface ActionAppliedEvent {
  type: 'action-applied'
  seatId: SeatId
  source: ActionSource
  action: ValidatedAction
  resolution: BettingRoundResolution
  winningSeatId: SeatId | null
  timestamp: string
}

export interface HandAwardedUncontestedEvent {
  type: 'hand-awarded-uncontested'
  winnerSeatId: SeatId
  amount: number
  timestamp: string
}

export interface StreetAdvancedEvent {
  type: 'street-advanced'
  fromStreet: Exclude<Street, 'idle' | 'showdown'>
  toStreet: Exclude<Street, 'idle'>
  burnCard?: CardCode
  boardCards: CardCode[]
  requiresAction: boolean
  isTerminal: boolean
  timestamp: string
}

export interface ShowdownSettledEvent {
  type: 'showdown-settled'
  potAwards: PotAward[]
  payouts: SeatPayout[]
  uncalledBetReturn: UncalledBetReturn | null
  timestamp: string
}

export type DomainEvent =
  | HandStartedEvent
  | ActionAppliedEvent
  | HandAwardedUncontestedEvent
  | StreetAdvancedEvent
  | ShowdownSettledEvent

function issue(path: string, message: string): ValidationIssue {
  return { path, message }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateTimestamp(target: ValidationIssue[], path: string, value: unknown): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    target.push(issue(path, 'timestamp must be a non-empty string.'))
  }
}

function validateSeatId(target: ValidationIssue[], path: string, value: unknown): void {
  if (!isNonNegativeInteger(value)) {
    target.push(issue(path, 'seat id must be a non-negative integer.'))
  }
}

function validateCardArray(
  target: ValidationIssue[],
  path: string,
  cards: unknown,
  options: { expectedLength?: number; disallowDuplicates?: boolean } = {},
): CardCode[] {
  if (!Array.isArray(cards)) {
    target.push(issue(path, 'value must be an array of card codes.'))
    return []
  }

  if (options.expectedLength !== undefined && cards.length !== options.expectedLength) {
    target.push(issue(path, `value must contain exactly ${options.expectedLength} card codes.`))
  }

  const parsedCards: CardCode[] = []
  const seen = new Set<CardCode>()

  cards.forEach((card, index) => {
    if (typeof card !== 'string' || !isCardCode(card)) {
      target.push(issue(`${path}[${index}]`, 'card must be a valid card code.'))
      return
    }

    if (options.disallowDuplicates && seen.has(card)) {
      target.push(issue(`${path}[${index}]`, `duplicate card ${card} is not allowed.`))
    }

    seen.add(card)
    parsedCards.push(card)
  })

  return parsedCards
}

function validateBlindAssignments(target: ValidationIssue[], assignments: unknown): void {
  if (!isPlainObject(assignments)) {
    target.push(issue('blindAssignments', 'blindAssignments must be an object.'))
    return
  }

  validateSeatId(target, 'blindAssignments.dealerSeat', assignments.dealerSeat)
  validateSeatId(target, 'blindAssignments.smallBlindSeat', assignments.smallBlindSeat)
  validateSeatId(target, 'blindAssignments.bigBlindSeat', assignments.bigBlindSeat)

  if (typeof assignments.isHeadsUp !== 'boolean') {
    target.push(issue('blindAssignments.isHeadsUp', 'isHeadsUp must be a boolean.'))
  }
}

function validateBlindPostings(target: ValidationIssue[], postings: unknown): void {
  if (!Array.isArray(postings)) {
    target.push(issue('blindPostings', 'blindPostings must be an array.'))
    return
  }

  const seenSeatIds = new Set<SeatId>()
  const seenBlindKinds = new Set<string>()

  postings.forEach((posting, index) => {
    if (!isPlainObject(posting)) {
      target.push(issue(`blindPostings[${index}]`, 'blind posting must be an object.'))
      return
    }

    validateSeatId(target, `blindPostings[${index}].seatId`, posting.seatId)

    if (posting.blind !== 'small-blind' && posting.blind !== 'big-blind') {
      target.push(issue(`blindPostings[${index}].blind`, 'blind must be small-blind or big-blind.'))
    } else {
      seenBlindKinds.add(posting.blind)
    }

    if (!isNonNegativeInteger(posting.amount)) {
      target.push(issue(`blindPostings[${index}].amount`, 'amount must be a non-negative integer.'))
    }

    if (typeof posting.isAllIn !== 'boolean') {
      target.push(issue(`blindPostings[${index}].isAllIn`, 'isAllIn must be a boolean.'))
    }

    if (isNonNegativeInteger(posting.seatId)) {
      if (seenSeatIds.has(posting.seatId)) {
        target.push(issue(`blindPostings[${index}].seatId`, 'blind posting seat ids must be unique.'))
      }

      seenSeatIds.add(posting.seatId)
    }
  })

  if (!seenBlindKinds.has('small-blind') || !seenBlindKinds.has('big-blind')) {
    target.push(issue('blindPostings', 'blindPostings must include both small-blind and big-blind entries.'))
  }
}

function validateValidatedAction(target: ValidationIssue[], action: unknown): void {
  if (!isPlainObject(action)) {
    target.push(issue('action', 'action must be an object.'))
    return
  }

  if (
    action.requestedType !== 'fold' &&
    action.requestedType !== 'check' &&
    action.requestedType !== 'call' &&
    action.requestedType !== 'bet' &&
    action.requestedType !== 'raise' &&
    action.requestedType !== 'all-in'
  ) {
    target.push(issue('action.requestedType', 'requestedType is invalid.'))
  }

  if (
    action.resolvedType !== 'fold' &&
    action.resolvedType !== 'check' &&
    action.resolvedType !== 'call' &&
    action.resolvedType !== 'bet' &&
    action.resolvedType !== 'raise'
  ) {
    target.push(issue('action.resolvedType', 'resolvedType is invalid.'))
  }

  if (!isNonNegativeInteger(action.targetCommitted)) {
    target.push(issue('action.targetCommitted', 'targetCommitted must be a non-negative integer.'))
  }

  if (!isNonNegativeInteger(action.addedChips)) {
    target.push(issue('action.addedChips', 'addedChips must be a non-negative integer.'))
  }

  if (typeof action.isAllIn !== 'boolean') {
    target.push(issue('action.isAllIn', 'isAllIn must be a boolean.'))
  }

  if (typeof action.isFullRaise !== 'boolean') {
    target.push(issue('action.isFullRaise', 'isFullRaise must be a boolean.'))
  }
}

function validateSeatPayoutArray(target: ValidationIssue[], path: string, payouts: unknown): SeatPayout[] {
  if (!Array.isArray(payouts)) {
    target.push(issue(path, 'value must be an array.'))
    return []
  }

  const normalized: SeatPayout[] = []
  const seenSeatIds = new Set<SeatId>()

  payouts.forEach((payout, index) => {
    if (!isPlainObject(payout)) {
      target.push(issue(`${path}[${index}]`, 'payout must be an object.'))
      return
    }

    validateSeatId(target, `${path}[${index}].seatId`, payout.seatId)

    if (!isPositiveInteger(payout.amount)) {
      target.push(issue(`${path}[${index}].amount`, 'amount must be a positive integer.'))
    }

    if (isNonNegativeInteger(payout.seatId)) {
      if (seenSeatIds.has(payout.seatId)) {
        target.push(issue(`${path}[${index}].seatId`, 'seat ids must be unique within a payout array.'))
      }

      seenSeatIds.add(payout.seatId)
    }

    if (isNonNegativeInteger(payout.seatId) && isPositiveInteger(payout.amount)) {
      normalized.push({ seatId: payout.seatId, amount: payout.amount })
    }
  })

  return normalized
}

function validateHandStartedEvent(target: ValidationIssue[], event: Record<string, unknown>): void {
  if (typeof event.handId !== 'string' || event.handId.trim().length === 0) {
    target.push(issue('handId', 'handId must be a non-empty string.'))
  }

  if (!isPositiveInteger(event.handNumber)) {
    target.push(issue('handNumber', 'handNumber must be a positive integer.'))
  }

  validateBlindAssignments(target, event.blindAssignments)
  validateBlindPostings(target, event.blindPostings)
  validateTimestamp(target, 'timestamp', event.timestamp)

  if (event.resolution !== 'needs-action' && event.resolution !== 'all-in-runout') {
    target.push(issue('resolution', 'resolution must be needs-action or all-in-runout.'))
  }

  if (!Array.isArray(event.holeCardAssignments)) {
    target.push(issue('holeCardAssignments', 'holeCardAssignments must be an array.'))
    return
  }

  const seenSeatIds = new Set<SeatId>()
  const knownCards = new Set<CardCode>()

  event.holeCardAssignments.forEach((assignment, index) => {
    if (!isPlainObject(assignment)) {
      target.push(issue(`holeCardAssignments[${index}]`, 'hole card assignment must be an object.'))
      return
    }

    validateSeatId(target, `holeCardAssignments[${index}].seatId`, assignment.seatId)

    if (isNonNegativeInteger(assignment.seatId)) {
      if (seenSeatIds.has(assignment.seatId)) {
        target.push(issue(`holeCardAssignments[${index}].seatId`, 'hole card assignment seat ids must be unique.'))
      }

      seenSeatIds.add(assignment.seatId)
    }

    const cards = validateCardArray(target, `holeCardAssignments[${index}].cards`, assignment.cards, {
      expectedLength: 2,
      disallowDuplicates: true,
    })

    cards.forEach((card, cardIndex) => {
      if (knownCards.has(card)) {
        target.push(
          issue(`holeCardAssignments[${index}].cards[${cardIndex}]`, `card ${card} is duplicated across the hand start event.`),
        )
      }

      knownCards.add(card)
    })
  })

  const remainingDeck = validateCardArray(target, 'remainingDeck', event.remainingDeck, {
    disallowDuplicates: true,
  })

  remainingDeck.forEach((card, index) => {
    if (knownCards.has(card)) {
      target.push(issue(`remainingDeck[${index}]`, `card ${card} is duplicated across the hand start event.`))
    }

    knownCards.add(card)
  })

  if (knownCards.size > 0 && knownCards.size !== 52) {
    target.push(issue('remainingDeck', 'holeCardAssignments plus remainingDeck must account for exactly 52 unique cards.'))
  }
}

function validateActionAppliedEvent(target: ValidationIssue[], event: Record<string, unknown>): void {
  validateSeatId(target, 'seatId', event.seatId)
  validateTimestamp(target, 'timestamp', event.timestamp)
  validateValidatedAction(target, event.action)

  if (event.source !== 'player' && event.source !== 'timeout') {
    target.push(issue('source', 'source must be player or timeout.'))
  }

  if (
    event.resolution !== 'needs-action' &&
    event.resolution !== 'round-complete' &&
    event.resolution !== 'hand-complete' &&
    event.resolution !== 'all-in-runout'
  ) {
    target.push(issue('resolution', 'resolution is invalid.'))
  }

  if (!(event.winningSeatId === null || isNonNegativeInteger(event.winningSeatId))) {
    target.push(issue('winningSeatId', 'winningSeatId must be null or a non-negative integer.'))
  }
}

function validateHandAwardedUncontestedEvent(target: ValidationIssue[], event: Record<string, unknown>): void {
  validateSeatId(target, 'winnerSeatId', event.winnerSeatId)
  validateTimestamp(target, 'timestamp', event.timestamp)

  if (!isPositiveInteger(event.amount)) {
    target.push(issue('amount', 'amount must be a positive integer.'))
  }
}

function validateStreetAdvancedEvent(target: ValidationIssue[], event: Record<string, unknown>): void {
  validateTimestamp(target, 'timestamp', event.timestamp)

  if (event.fromStreet !== 'preflop' && event.fromStreet !== 'flop' && event.fromStreet !== 'turn' && event.fromStreet !== 'river') {
    target.push(issue('fromStreet', 'fromStreet must be preflop, flop, turn, or river.'))
    return
  }

  const plan = getStreetTransitionPlan(event.fromStreet)

  if (!plan) {
    target.push(issue('fromStreet', 'fromStreet must support a legal transition.'))
    return
  }

  if (event.toStreet !== plan.toStreet) {
    target.push(issue('toStreet', `toStreet must be ${plan.toStreet} when fromStreet is ${plan.fromStreet}.`))
  }

  if (plan.burnCount === 1) {
    if (typeof event.burnCard !== 'string' || !isCardCode(event.burnCard)) {
      target.push(issue('burnCard', 'burnCard must be a valid card code for this transition.'))
    }
  } else if (event.burnCard !== undefined) {
    target.push(issue('burnCard', 'burnCard must be omitted for this transition.'))
  }

  validateCardArray(target, 'boardCards', event.boardCards, {
    expectedLength: plan.boardCardCount,
    disallowDuplicates: true,
  })

  if (typeof event.requiresAction !== 'boolean') {
    target.push(issue('requiresAction', 'requiresAction must be a boolean.'))
  }

  if (typeof event.isTerminal !== 'boolean') {
    target.push(issue('isTerminal', 'isTerminal must be a boolean.'))
  }
}

function validateShowdownSettledEvent(target: ValidationIssue[], event: Record<string, unknown>): void {
  validateTimestamp(target, 'timestamp', event.timestamp)

  const payouts = validateSeatPayoutArray(target, 'payouts', event.payouts)

  if (!Array.isArray(event.potAwards)) {
    target.push(issue('potAwards', 'potAwards must be an array.'))
  } else {
    const seenPotIndexes = new Set<number>()

    event.potAwards.forEach((award, index) => {
      if (!isPlainObject(award)) {
        target.push(issue(`potAwards[${index}]`, 'pot award must be an object.'))
        return
      }

      if (!isNonNegativeInteger(award.potIndex)) {
        target.push(issue(`potAwards[${index}].potIndex`, 'potIndex must be a non-negative integer.'))
      } else {
        if (seenPotIndexes.has(award.potIndex)) {
          target.push(issue(`potAwards[${index}].potIndex`, 'potIndex values must be unique.'))
        }

        seenPotIndexes.add(award.potIndex)
      }

      if (!isPositiveInteger(award.amount)) {
        target.push(issue(`potAwards[${index}].amount`, 'amount must be a positive integer.'))
      }

      const eligibleSeatIds = Array.isArray(award.eligibleSeatIds) ? award.eligibleSeatIds : []
      const winnerSeatIds = Array.isArray(award.winnerSeatIds) ? award.winnerSeatIds : []
      const shares = validateSeatPayoutArray(target, `potAwards[${index}].shares`, award.shares)

      if (!Array.isArray(award.eligibleSeatIds)) {
        target.push(issue(`potAwards[${index}].eligibleSeatIds`, 'eligibleSeatIds must be an array.'))
      }

      if (!Array.isArray(award.winnerSeatIds)) {
        target.push(issue(`potAwards[${index}].winnerSeatIds`, 'winnerSeatIds must be an array.'))
      }

      const eligibleSet = new Set<number>()
      eligibleSeatIds.forEach((seatId, seatIndex) => {
        if (!isNonNegativeInteger(seatId)) {
          target.push(issue(`potAwards[${index}].eligibleSeatIds[${seatIndex}]`, 'seat id must be a non-negative integer.'))
          return
        }

        if (eligibleSet.has(seatId)) {
          target.push(issue(`potAwards[${index}].eligibleSeatIds[${seatIndex}]`, 'eligibleSeatIds must be unique.'))
        }

        eligibleSet.add(seatId)
      })

      const winnerSet = new Set<number>()
      winnerSeatIds.forEach((seatId, seatIndex) => {
        if (!isNonNegativeInteger(seatId)) {
          target.push(issue(`potAwards[${index}].winnerSeatIds[${seatIndex}]`, 'seat id must be a non-negative integer.'))
          return
        }

        if (!eligibleSet.has(seatId)) {
          target.push(issue(`potAwards[${index}].winnerSeatIds[${seatIndex}]`, 'winner seat must also be eligible for the pot.'))
        }

        if (winnerSet.has(seatId)) {
          target.push(issue(`potAwards[${index}].winnerSeatIds[${seatIndex}]`, 'winnerSeatIds must be unique.'))
        }

        winnerSet.add(seatId)
      })

      const shareTotal = shares.reduce((sum, share) => sum + share.amount, 0)

      if (isPositiveInteger(award.amount) && shareTotal !== award.amount) {
        target.push(issue(`potAwards[${index}].shares`, 'shares must sum to the pot amount.'))
      }

      shares.forEach((share, shareIndex) => {
        if (!winnerSet.has(share.seatId)) {
          target.push(
            issue(`potAwards[${index}].shares[${shareIndex}].seatId`, 'share recipient must be one of the winner seats.'),
          )
        }
      })
    })
  }

  if (!(event.uncalledBetReturn === null || isPlainObject(event.uncalledBetReturn))) {
    target.push(issue('uncalledBetReturn', 'uncalledBetReturn must be null or an object.'))
  }

  if (isPlainObject(event.uncalledBetReturn)) {
    validateSeatId(target, 'uncalledBetReturn.seatId', event.uncalledBetReturn.seatId)

    if (!isPositiveInteger(event.uncalledBetReturn.amount)) {
      target.push(issue('uncalledBetReturn.amount', 'uncalledBetReturn.amount must be a positive integer.'))
    }
  }

  const payoutTotal = payouts.reduce((sum, payout) => sum + payout.amount, 0)
  const awardTotal = Array.isArray(event.potAwards)
    ? event.potAwards.reduce((sum, award) => sum + (isPlainObject(award) && isPositiveInteger(award.amount) ? award.amount : 0), 0)
    : 0

  if (payouts.length > 0 && Array.isArray(event.potAwards) && payoutTotal !== awardTotal) {
    target.push(issue('payouts', 'payouts must sum to the total amount awarded across potAwards.'))
  }
}

export function getDomainEventValidationIssues(event: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPlainObject(event)) {
    return [issue('event', 'event must be an object.')]
  }

  switch (event.type) {
    case 'hand-started':
      validateHandStartedEvent(issues, event)
      break
    case 'action-applied':
      validateActionAppliedEvent(issues, event)
      break
    case 'hand-awarded-uncontested':
      validateHandAwardedUncontestedEvent(issues, event)
      break
    case 'street-advanced':
      validateStreetAdvancedEvent(issues, event)
      break
    case 'showdown-settled':
      validateShowdownSettledEvent(issues, event)
      break
    default:
      issues.push(
        issue(
          'type',
          'type must be one of hand-started, action-applied, hand-awarded-uncontested, street-advanced, or showdown-settled.',
        ),
      )
  }

  return issues
}

export function assertValidDomainEvent(event: unknown): asserts event is DomainEvent {
  const issues = getDomainEventValidationIssues(event)

  if (issues.length === 0) {
    return
  }

  throw new Error(`Invalid domain event: ${issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`)
}

export function isDomainEvent(event: unknown): event is DomainEvent {
  return getDomainEventValidationIssues(event).length === 0
}
