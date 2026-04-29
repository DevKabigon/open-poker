import { describe, expect, it } from 'vitest'
import { createTableSkeletonSnapshot } from './table-fixtures'
import {
  formatActionLabel,
  formatHandStatusLabel,
  formatPotLabel,
  formatSeatLabel,
  formatShowdownHandLabel,
  formatStreetLabel,
  formatTableChipAmount,
  getSeatBadges,
  getSeatDisplayName,
  getSeatHoleCardStatus,
  getSeatTone,
  getVisibleHoleCards,
  isBoardOnlyBestHand,
  isSeatForcedShowdownReveal,
  isSeatMuckedAtShowdown,
  isSeatShowdownWinner,
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

  it('formats detailed showdown hand labels', () => {
    expect(formatShowdownHandLabel('high-card', ['As', 'Kh', 'Qd', 'Jc', '9h'], ['Kh', '9h'])).toBe('Ace-high, King and Nine kickers')
    expect(formatShowdownHandLabel('one-pair', ['6s', '6h', 'Ad', 'Jc', '9h'], ['6s', 'Ad'])).toBe('Pair of Sixes, Ace kicker')
    expect(formatShowdownHandLabel('one-pair', ['6s', '6h', 'Ad', 'Jc', '9h'], ['6s', '6h'])).toBe('Pair of Sixes')
    expect(formatShowdownHandLabel('two-pair', ['Ks', 'Kh', 'Td', 'Tc', '2h'], ['Ks', 'Td'])).toBe('Two pair, Kings and Tens')
    expect(formatShowdownHandLabel('two-pair', ['Ks', 'Kh', 'Td', 'Tc', 'Ah'], ['Ah', '2h'])).toBe('Two pair, Kings and Tens, Ace kicker')
    expect(formatShowdownHandLabel('three-of-a-kind', ['6s', '6h', '6d', 'Ac', 'Kh'], ['Ac', 'Kh'])).toBe('Three of a kind, Sixes, Ace and King kickers')
    expect(formatShowdownHandLabel('straight', ['As', '2d', '3c', '4h', '5s'])).toBe('Five-high straight')
    expect(formatShowdownHandLabel('flush', ['As', 'Ts', '7s', '5s', '2s'])).toBe('Ace-high flush')
    expect(formatShowdownHandLabel('full-house', ['Jh', 'Jd', 'Jc', '4s', '4d'])).toBe('Full house, Jacks full of Fours')
    expect(formatShowdownHandLabel('four-of-a-kind', ['9h', '9d', '9c', '9s', 'Ad'], ['Ad', '2h'])).toBe('Four of a kind, Nines, Ace kicker')
    expect(formatShowdownHandLabel('straight-flush', ['Ah', 'Kh', 'Qh', 'Jh', 'Th'])).toBe('Ace-high straight flush')
    expect(formatShowdownHandLabel(null, null)).toBe('Mucked')
  })

  it('detects when the best showdown hand only uses the board', () => {
    const board = ['As', 'Ks', 'Qs', 'Js', 'Ts']

    expect(isBoardOnlyBestHand(board, ['As', 'Ks', 'Qs', 'Js', 'Ts'])).toBe(true)
    expect(isBoardOnlyBestHand(board, ['As', 'Ks', 'Qs', 'Js', '9h'])).toBe(false)
    expect(isBoardOnlyBestHand(board.slice(0, 4), ['As', 'Ks', 'Qs', 'Js', 'Ts'])).toBe(false)
    expect(isBoardOnlyBestHand(board, null)).toBe(false)
  })

  it('detects mucked showdown seats', () => {
    const { table } = createTableSkeletonSnapshot()
    const showdownTable = {
      ...table,
      showdownSummary: {
        handId: table.handId,
        handNumber: table.handNumber,
        handEvaluations: [
          {
            seatId: 0,
            category: null,
            bestCards: null,
            isRevealed: false,
          },
          {
            seatId: 2,
            category: 'one-pair' as const,
            bestCards: ['As', 'Ah', 'Kd', 'Qc', 'Js'] as [string, string, string, string, string],
            isRevealed: true,
          },
        ],
        potAwards: [],
        payouts: [],
        uncalledBetReturn: null,
      },
    }

    expect(isSeatMuckedAtShowdown(showdownTable, showdownTable.seats[0]!)).toBe(true)
    expect(getSeatHoleCardStatus(showdownTable, showdownTable.seats[0]!)).toBe('mucked')
    expect(isSeatMuckedAtShowdown(showdownTable, showdownTable.seats[2]!)).toBe(false)
    expect(getSeatHoleCardStatus(showdownTable, showdownTable.seats[2]!)).toBe('revealed')
    expect(isSeatMuckedAtShowdown(table, table.seats[0]!)).toBe(false)
    expect(getSeatHoleCardStatus(table, table.seats[0]!)).toBeNull()
  })

  it('detects showdown winners separately from reveal status', () => {
    const { table } = createTableSkeletonSnapshot()
    const showdownTable = {
      ...table,
      showdownSummary: {
        handId: table.handId,
        handNumber: table.handNumber,
        handEvaluations: [
          {
            seatId: 0,
            category: 'one-pair' as const,
            bestCards: ['As', 'Ah', 'Kd', 'Qc', 'Js'] as [string, string, string, string, string],
            isRevealed: true,
          },
          {
            seatId: 2,
            category: 'one-pair' as const,
            bestCards: ['Ks', 'Kh', 'Ad', 'Qc', 'Js'] as [string, string, string, string, string],
            isRevealed: true,
          },
        ],
        potAwards: [
          {
            potIndex: 0,
            amount: 4800,
            eligibleSeatIds: [0, 2],
            winnerSeatIds: [2],
            shares: [{ seatId: 2, amount: 4800 }],
          },
        ],
        payouts: [{ seatId: 2, amount: 4800 }],
        uncalledBetReturn: null,
      },
    }

    expect(getSeatHoleCardStatus(showdownTable, showdownTable.seats[0]!)).toBe('revealed')
    expect(isSeatShowdownWinner(showdownTable, showdownTable.seats[0]!)).toBe(false)
    expect(isSeatForcedShowdownReveal(showdownTable, showdownTable.seats[0]!)).toBe(false)
    expect(getSeatHoleCardStatus(showdownTable, showdownTable.seats[2]!)).toBe('revealed')
    expect(isSeatShowdownWinner(showdownTable, showdownTable.seats[2]!)).toBe(true)
    expect(isSeatForcedShowdownReveal(showdownTable, showdownTable.seats[2]!)).toBe(true)
  })

  it('labels hidden folded hands without treating them as mucked', () => {
    const { table } = createTableSkeletonSnapshot()
    const foldedTable = {
      ...table,
      handStatus: 'settled' as const,
      showdownSummary: {
        handId: table.handId,
        handNumber: table.handNumber,
        handEvaluations: [],
        potAwards: [
          {
            potIndex: 0,
            amount: 4800,
            eligibleSeatIds: [0],
            winnerSeatIds: [0],
            shares: [{ seatId: 0, amount: 4800 }],
          },
        ],
        payouts: [{ seatId: 0, amount: 4800 }],
        uncalledBetReturn: null,
      },
      seats: table.seats.map((seat) =>
        seat.seatId === 2
          ? { ...seat, hasFolded: true, revealedHoleCards: null }
          : seat.seatId === 4
            ? {
                ...seat,
                hasFolded: true,
                revealedHoleCards: ['Qs', 'Qh'] as [string, string],
              }
            : seat,
      ),
    }

    expect(getSeatHoleCardStatus(foldedTable, foldedTable.seats[2]!)).toBe('folded')
    expect(isSeatMuckedAtShowdown(foldedTable, foldedTable.seats[2]!)).toBe(false)
    expect(getSeatHoleCardStatus(foldedTable, foldedTable.seats[4]!)).toBe('revealed')
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
