import { type CardCode, type Rank, parseCardCode, RANKS } from './cards'

export const HAND_CATEGORIES = [
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
] as const

export type HandCategory = (typeof HAND_CATEGORIES)[number]
export type HandComparison = -1 | 0 | 1
export type FiveCardHand = [CardCode, CardCode, CardCode, CardCode, CardCode]

export interface EvaluatedHand {
  category: HandCategory
  categoryStrength: number
  tiebreaker: number[]
  cards: FiveCardHand
}

const CATEGORY_STRENGTH = new Map<HandCategory, number>(
  HAND_CATEGORIES.map((category, index) => [category, index]),
)

const RANK_VALUE_BY_RANK = new Map<Rank, number>(RANKS.map((rank, index) => [rank, index + 2]))

export function getCategoryStrength(category: HandCategory): number {
  return CATEGORY_STRENGTH.get(category) ?? 0
}

export function getRankValue(rank: Rank): number {
  const value = RANK_VALUE_BY_RANK.get(rank)

  if (value === undefined) {
    throw new Error(`Unsupported rank: ${rank}`)
  }

  return value
}

export function getCardRankValue(card: CardCode): number {
  return getRankValue(parseCardCode(card).rank)
}

export function compareTiebreakers(left: number[], right: number[]): HandComparison {
  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? -1
    const rightValue = right[index] ?? -1

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

export function compareEvaluatedHands(left: EvaluatedHand, right: EvaluatedHand): HandComparison {
  if (left.categoryStrength > right.categoryStrength) {
    return 1
  }

  if (left.categoryStrength < right.categoryStrength) {
    return -1
  }

  return compareTiebreakers(left.tiebreaker, right.tiebreaker)
}
