import { type CardCode, parseCardCode } from './cards'
import {
  getCategoryStrength,
  getCardRankValue,
  type EvaluatedHand,
  type FiveCardHand,
} from './hand-ranking'

interface RankGroup {
  rank: number
  count: number
}

function assertFiveDistinctCards(cards: readonly CardCode[]): asserts cards is FiveCardHand {
  if (cards.length !== 5) {
    throw new Error(`Five-card hand evaluation requires exactly 5 cards, received ${cards.length}.`)
  }

  const seen = new Set<CardCode>()

  for (const card of cards) {
    if (seen.has(card)) {
      throw new Error(`Five-card hand evaluation does not allow duplicate cards: ${card}.`)
    }

    seen.add(card)
  }
}

function getRankGroups(rankValues: number[]): RankGroup[] {
  const counts = new Map<number, number>()

  for (const rank of rankValues) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => right.count - left.count || right.rank - left.rank)
}

function getSortedUniqueRanks(rankValues: number[]): number[] {
  return [...new Set(rankValues)].sort((left, right) => right - left)
}

function getStraightHighRank(rankValues: number[]): number | null {
  const uniqueRanks = getSortedUniqueRanks(rankValues)

  if (uniqueRanks.length !== 5) {
    return null
  }

  const isWheel =
    uniqueRanks[0] === 14 &&
    uniqueRanks[1] === 5 &&
    uniqueRanks[2] === 4 &&
    uniqueRanks[3] === 3 &&
    uniqueRanks[4] === 2

  if (isWheel) {
    return 5
  }

  for (let index = 1; index < uniqueRanks.length; index += 1) {
    if (uniqueRanks[index - 1]! - uniqueRanks[index]! !== 1) {
      return null
    }
  }

  return uniqueRanks[0] ?? null
}

function createEvaluatedHand(
  category: EvaluatedHand['category'],
  tiebreaker: number[],
  cards: FiveCardHand,
): EvaluatedHand {
  return {
    category,
    categoryStrength: getCategoryStrength(category),
    tiebreaker,
    cards: [...cards] as FiveCardHand,
  }
}

export function evaluateFiveCardHand(cards: readonly CardCode[]): EvaluatedHand {
  assertFiveDistinctCards(cards)

  const parsedCards = cards.map((card) => parseCardCode(card))
  const rankValues = parsedCards.map((card) => getCardRankValue(card.code)).sort((left, right) => right - left)
  const rankGroups = getRankGroups(rankValues)
  const straightHighRank = getStraightHighRank(rankValues)
  const isFlush = parsedCards.every((card) => card.suit === parsedCards[0]?.suit)

  if (isFlush && straightHighRank !== null) {
    return createEvaluatedHand('straight-flush', [straightHighRank], cards)
  }

  if (rankGroups[0]?.count === 4) {
    return createEvaluatedHand('four-of-a-kind', [rankGroups[0].rank, rankGroups[1]!.rank], cards)
  }

  if (rankGroups[0]?.count === 3 && rankGroups[1]?.count === 2) {
    return createEvaluatedHand('full-house', [rankGroups[0].rank, rankGroups[1].rank], cards)
  }

  if (isFlush) {
    return createEvaluatedHand('flush', [...rankValues], cards)
  }

  if (straightHighRank !== null) {
    return createEvaluatedHand('straight', [straightHighRank], cards)
  }

  if (rankGroups[0]?.count === 3) {
    const kickers = rankGroups.slice(1).map((group) => group.rank).sort((left, right) => right - left)
    return createEvaluatedHand('three-of-a-kind', [rankGroups[0].rank, ...kickers], cards)
  }

  if (rankGroups[0]?.count === 2 && rankGroups[1]?.count === 2) {
    const higherPair = Math.max(rankGroups[0].rank, rankGroups[1].rank)
    const lowerPair = Math.min(rankGroups[0].rank, rankGroups[1].rank)
    const kicker = rankGroups[2]!.rank
    return createEvaluatedHand('two-pair', [higherPair, lowerPair, kicker], cards)
  }

  if (rankGroups[0]?.count === 2) {
    const kickers = rankGroups.slice(1).map((group) => group.rank).sort((left, right) => right - left)
    return createEvaluatedHand('one-pair', [rankGroups[0].rank, ...kickers], cards)
  }

  return createEvaluatedHand('high-card', [...rankValues], cards)
}
