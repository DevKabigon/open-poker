import { createCardCode, type CardCode, RANKS, SUITS } from './cards'
import { type Street } from './state'

export interface DrawCardsResult {
  cards: CardCode[]
  remainingDeck: CardCode[]
}

export interface StreetDrawResult {
  burnCard?: CardCode
  boardCards: CardCode[]
  remainingDeck: CardCode[]
}

export function createOrderedDeck(): CardCode[] {
  const deck: CardCode[] = []

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCardCode(rank, suit))
    }
  }

  return deck
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number') {
    return (seed >>> 0) || 0x9e3779b9
  }

  let hash = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) || 0x9e3779b9
}

export function createSeededRng(seed: number | string): () => number {
  let state = normalizeSeed(seed)

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

export function shuffleDeck(deck: CardCode[], seed: number | string): CardCode[] {
  const rng = createSeededRng(seed)
  const shuffled = [...deck]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const temporary = shuffled[index]
    shuffled[index] = shuffled[swapIndex]!
    shuffled[swapIndex] = temporary!
  }

  return shuffled
}

export function createShuffledDeck(seed: number | string): CardCode[] {
  return shuffleDeck(createOrderedDeck(), seed)
}

export function drawCards(deck: CardCode[], count: number): DrawCardsResult {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('draw count must be a non-negative integer.')
  }

  if (deck.length < count) {
    throw new Error(`Cannot draw ${count} cards from a deck with only ${deck.length} cards remaining.`)
  }

  return {
    cards: deck.slice(0, count),
    remainingDeck: deck.slice(count),
  }
}

export function drawStreetCards(deck: CardCode[], street: Street): StreetDrawResult {
  switch (street) {
    case 'preflop': {
      const burn = drawCards(deck, 1)
      const board = drawCards(burn.remainingDeck, 3)

      return {
        burnCard: burn.cards[0],
        boardCards: board.cards,
        remainingDeck: board.remainingDeck,
      }
    }
    case 'flop':
    case 'turn': {
      const burn = drawCards(deck, 1)
      const board = drawCards(burn.remainingDeck, 1)

      return {
        burnCard: burn.cards[0],
        boardCards: board.cards,
        remainingDeck: board.remainingDeck,
      }
    }
    case 'river':
      return {
        boardCards: [],
        remainingDeck: [...deck],
      }
    case 'idle':
    case 'showdown':
      throw new Error(`Cannot draw street cards from street ${street}.`)
  }
}
