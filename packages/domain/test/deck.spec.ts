import { describe, expect, it } from 'vitest'
import { createOrderedDeck, createShuffledDeck, drawCards, drawStreetCards } from '../src'

describe('deck', () => {
  it('creates a standard 52-card deck with unique card codes', () => {
    const deck = createOrderedDeck()

    expect(deck).toHaveLength(52)
    expect(new Set(deck).size).toBe(52)
    expect(deck[0]).toBe('2c')
    expect(deck.at(-1)).toBe('As')
  })

  it('shuffles deterministically for the same seed', () => {
    const first = createShuffledDeck('openpoker-seed')
    const second = createShuffledDeck('openpoker-seed')
    const third = createShuffledDeck('another-seed')

    expect(first).toEqual(second)
    expect(first).not.toEqual(third)
  })

  it('draws cards from the top of the deck and returns the remaining deck', () => {
    const deck = createOrderedDeck()
    const draw = drawCards(deck, 3)

    expect(draw.cards).toEqual(['2c', '3c', '4c'])
    expect(draw.remainingDeck).toHaveLength(49)
    expect(draw.remainingDeck[0]).toBe('5c')
  })

  it('draws the correct burn and board counts for each street', () => {
    const deck = createOrderedDeck()
    const flop = drawStreetCards(deck, 'preflop')

    expect(flop.burnCard).toBe('2c')
    expect(flop.boardCards).toEqual(['3c', '4c', '5c'])

    const turn = drawStreetCards(flop.remainingDeck, 'flop')
    expect(turn.burnCard).toBe('6c')
    expect(turn.boardCards).toEqual(['7c'])

    const river = drawStreetCards(turn.remainingDeck, 'turn')
    expect(river.burnCard).toBe('8c')
    expect(river.boardCards).toEqual(['9c'])
  })
})
