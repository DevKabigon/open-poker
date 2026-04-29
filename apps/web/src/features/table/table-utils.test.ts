import { describe, expect, it } from 'vitest'
import { createTableSkeletonSnapshot } from './table-fixtures'
import {
  formatActionLabel,
  formatHandStatusLabel,
  formatPotLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
  getSeatBadges,
  getSeatDisplayName,
  getSeatTone,
  getVisibleHoleCards,
  normalizeBoardCards,
} from './table-utils'

describe('table utilities', () => {
  it('formats table money, seats, streets, and hand statuses', () => {
    expect(formatTableChipAmount(125000)).toBe('$1,250.00')
    expect(formatSeatLabel(0)).toBe('Seat 1')
    expect(formatStreetLabel('flop')).toBe('Flop')
    expect(formatHandStatusLabel('in-hand')).toBe('In hand')
  })

  it('normalizes board cards into a five-card board', () => {
    expect(normalizeBoardCards(['Ah', '7d', '2c'])).toEqual(['Ah', '7d', '2c', null, null])
  })

  it('formats action labels with private action amounts', () => {
    const snapshot = createTableSkeletonSnapshot()

    expect(formatActionLabel('fold', snapshot.privateView)).toBe('Fold')
    expect(formatActionLabel('call', snapshot.privateView)).toBe('Call $8.00')
    expect(formatActionLabel('raise', snapshot.privateView)).toBe('Raise $24.00')
    expect(formatActionLabel('raise', snapshot.privateView, 7_500)).toBe('Raise $75.00')
    expect(formatActionLabel('bet', snapshot.privateView, 1_200)).toBe('Bet $12.00')
  })

  it('summarizes pots with side pot context', () => {
    const { table } = createTableSkeletonSnapshot()

    expect(formatPotLabel(table)).toBe('$48.00 total')
  })

  it('derives display names, seat tones, badges, and visible cards', () => {
    const { table, privateView } = createTableSkeletonSnapshot()
    const dealer = table.seats[0]!
    const foldedSmallBlind = table.seats[1]!
    const allInBigBlind = table.seats[2]!
    const hero = table.seats[4]!
    const empty = table.seats[5]!

    expect(getSeatDisplayName(empty)).toBe('Seat 6')
    expect(getSeatTone(table, privateView, empty)).toBe('empty')
    expect(getSeatTone(table, privateView, hero)).toBe('hero')
    expect(getSeatTone(table, privateView, foldedSmallBlind)).toBe('inactive')
    expect(getSeatBadges(table, dealer)).toEqual(['BTN'])
    expect(getSeatBadges(table, foldedSmallBlind)).toEqual(['SB', 'Folded'])
    expect(getSeatBadges(table, allInBigBlind)).toEqual(['BB', 'All in'])
    expect(getVisibleHoleCards(privateView, hero)).toEqual(['Qs', 'Qh'])
    expect(getVisibleHoleCards(privateView, dealer)).toBeNull()
  })

  it('can hide public showdown cards without hiding the private hero hand', () => {
    const { table, privateView } = createTableSkeletonSnapshot()
    const dealer = {
      ...table.seats[0]!,
      revealedHoleCards: ['As', 'Ah'] as [string, string],
    }
    const hero = table.seats[4]!

    expect(getVisibleHoleCards(privateView, dealer, true)).toEqual(['As', 'Ah'])
    expect(getVisibleHoleCards(privateView, dealer, false)).toBeNull()
    expect(getVisibleHoleCards(privateView, hero, false)).toEqual(['Qs', 'Qh'])
  })

  it('orders visible hole cards with the highest rank first', () => {
    const { table, privateView } = createTableSkeletonSnapshot()
    const hero = table.seats[4]!
    const dealer = {
      ...table.seats[0]!,
      revealedHoleCards: ['4s', 'Ah'] as [string, string],
    }

    expect(
      getVisibleHoleCards(
        privateView ? { ...privateView, holeCards: ['4s', 'Ah'] } : null,
        hero,
      ),
    ).toEqual(['Ah', '4s'])
    expect(getVisibleHoleCards(privateView, dealer)).toEqual(['Ah', '4s'])
    expect(
      getVisibleHoleCards(
        privateView ? { ...privateView, holeCards: ['Qd', 'Ks'] } : null,
        hero,
      ),
    ).toEqual(['Ks', 'Qd'])
  })
})
