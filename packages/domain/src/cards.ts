export const SUITS = ['c', 'd', 'h', 's'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type CardCode = `${Rank}${Suit}`

export interface Card {
  rank: Rank
  suit: Suit
  code: CardCode
}

const SUIT_SET = new Set<string>(SUITS)
const RANK_SET = new Set<string>(RANKS)

export function isSuit(value: string): value is Suit {
  return SUIT_SET.has(value)
}

export function isRank(value: string): value is Rank {
  return RANK_SET.has(value)
}

export function isCardCode(value: string): value is CardCode {
  if (value.length !== 2) {
    return false
  }

  return isRank(value[0] ?? '') && isSuit(value[1] ?? '')
}

export function assertCardCode(value: string): asserts value is CardCode {
  if (!isCardCode(value)) {
    throw new Error(`Invalid card code: ${value}`)
  }
}

export function createCardCode(rank: Rank, suit: Suit): CardCode {
  return `${rank}${suit}`
}

export function parseCardCode(cardCode: CardCode): Card {
  return {
    rank: cardCode[0] as Rank,
    suit: cardCode[1] as Suit,
    code: cardCode,
  }
}

export function formatCard(card: Pick<Card, 'rank' | 'suit'>): CardCode {
  return createCardCode(card.rank, card.suit)
}
