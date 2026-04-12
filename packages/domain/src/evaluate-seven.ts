import { type CardCode } from './cards'
import { evaluateFiveCardHand } from './evaluate-five'
import { compareEvaluatedHands, type EvaluatedHand, type FiveCardHand } from './hand-ranking'

function assertSevenDistinctCards(cards: readonly CardCode[]): void {
  if (cards.length !== 7) {
    throw new Error(`Seven-card evaluation requires exactly 7 cards, received ${cards.length}.`)
  }

  const seen = new Set<CardCode>()

  for (const card of cards) {
    if (seen.has(card)) {
      throw new Error(`Seven-card evaluation does not allow duplicate cards: ${card}.`)
    }

    seen.add(card)
  }
}

function getFiveCardCombinations(cards: readonly CardCode[]): FiveCardHand[] {
  const combinations: FiveCardHand[] = []

  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            combinations.push([
              cards[first]!,
              cards[second]!,
              cards[third]!,
              cards[fourth]!,
              cards[fifth]!,
            ])
          }
        }
      }
    }
  }

  return combinations
}

export function evaluateSevenCardHand(cards: readonly CardCode[]): EvaluatedHand {
  assertSevenDistinctCards(cards)

  let bestHand: EvaluatedHand | null = null

  for (const combination of getFiveCardCombinations(cards)) {
    const evaluated = evaluateFiveCardHand(combination)

    if (bestHand === null || compareEvaluatedHands(evaluated, bestHand) > 0) {
      bestHand = evaluated
    }
  }

  if (bestHand === null) {
    throw new Error('Seven-card evaluation failed to produce a best hand.')
  }

  return bestHand
}
