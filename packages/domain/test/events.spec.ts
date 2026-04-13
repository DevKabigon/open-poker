import { describe, expect, it } from 'vitest'
import {
  assertValidDomainEvent,
  createOrderedDeck,
  getDomainEventValidationIssues,
  isDomainEvent,
  type DomainEvent,
} from '../src'

function createHandStartedEvent(): DomainEvent {
  const dealtCards = ['As', 'Ah', 'Ks', 'Kh'] as const
  const remainingDeck = createOrderedDeck().filter((card) => !dealtCards.includes(card))

  return {
    type: 'hand-started',
    handId: 'room-1:hand:1',
    handNumber: 1,
    blindAssignments: {
      dealerSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 2,
      isHeadsUp: true,
    },
    blindPostings: [
      { seatId: 0, blind: 'small-blind', amount: 50, isAllIn: false },
      { seatId: 2, blind: 'big-blind', amount: 100, isAllIn: false },
    ],
    holeCardAssignments: [
      { seatId: 0, cards: ['As', 'Ah'] },
      { seatId: 2, cards: ['Ks', 'Kh'] },
    ],
    remainingDeck,
    resolution: 'needs-action',
    timestamp: '2026-04-13T10:10:00.000Z',
  }
}

describe('domain events', () => {
  it('accepts a valid hand-started event', () => {
    const event = createHandStartedEvent()

    expect(getDomainEventValidationIssues(event)).toEqual([])
    expect(isDomainEvent(event)).toBe(true)
    expect(() => assertValidDomainEvent(event)).not.toThrow()
  })

  it('rejects a hand-started event with duplicated cards', () => {
    const event = {
      ...createHandStartedEvent(),
      remainingDeck: ['As', ...createOrderedDeck().filter((card) => card !== 'As')],
    }

    expect(getDomainEventValidationIssues(event)).toContainEqual({
      path: 'remainingDeck[0]',
      message: 'card As is duplicated across the hand start event.',
    })
  })

  it('accepts a valid action-applied event and street-advanced event', () => {
    const actionEvent: DomainEvent = {
      type: 'action-applied',
      seatId: 1,
      source: 'player',
      action: {
        requestedType: 'call',
        resolvedType: 'call',
        targetCommitted: 300,
        addedChips: 200,
        isAllIn: false,
        isFullRaise: false,
      },
      resolution: 'round-complete',
      winningSeatId: null,
      timestamp: '2026-04-13T10:11:00.000Z',
    }

    const streetEvent: DomainEvent = {
      type: 'street-advanced',
      fromStreet: 'preflop',
      toStreet: 'flop',
      burnCard: '2c',
      boardCards: ['7d', 'Jh', 'Qs'],
      requiresAction: true,
      isTerminal: false,
      timestamp: '2026-04-13T10:12:00.000Z',
    }

    expect(getDomainEventValidationIssues(actionEvent)).toEqual([])
    expect(getDomainEventValidationIssues(streetEvent)).toEqual([])
  })

  it('rejects a showdown-settled event when payouts do not match awards', () => {
    expect(getDomainEventValidationIssues({
      type: 'showdown-settled',
      potAwards: [
        {
          potIndex: 0,
          amount: 500,
          eligibleSeatIds: [0, 1],
          winnerSeatIds: [0],
          shares: [{ seatId: 0, amount: 500 }],
        },
      ],
      payouts: [{ seatId: 0, amount: 400 }],
      uncalledBetReturn: null,
      timestamp: '2026-04-13T10:13:00.000Z',
    })).toContainEqual({
      path: 'payouts',
      message: 'payouts must sum to the total amount awarded across potAwards.',
    })
  })

  it('accepts a valid uncontested hand award event', () => {
    const event: DomainEvent = {
      type: 'hand-awarded-uncontested',
      winnerSeatId: 4,
      amount: 750,
      timestamp: '2026-04-13T10:14:00.000Z',
    }

    expect(getDomainEventValidationIssues(event)).toEqual([])
  })
})
