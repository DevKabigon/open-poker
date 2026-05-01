import { describe, expect, it } from 'vitest'
import { createTableSkeletonSnapshot } from './table-fixtures'
import {
  canLeaveSeatFromTableState,
  getNextHandTimerDurationMs,
  getTableStatus,
  hasEnoughPlayersForNextHand,
  isResultClearTimer,
  NEXT_HAND_DELAY_MS,
  UNCONTESTED_NEXT_HAND_DELAY_MS,
  WAITING_ROOM_START_DELAY_MS,
  wouldSitOutCancelQueuedStart,
} from './table-action-utils'

describe('table action utilities', () => {
  it('shows waiting instead of next hand when sitting-out players leave too few eligible seats', () => {
    const { table } = createTableSkeletonSnapshot()
    const settledTable = {
      ...table,
      handStatus: 'settled' as const,
      nextHandStartAt: null,
      seats: table.seats.map((seat) =>
        seat.seatId === 0
          ? {
              ...seat,
              isOccupied: true,
              stack: 10_000,
              isSittingOut: false,
              isSittingOutNextHand: false,
            }
          : seat.seatId === 1
            ? {
                ...seat,
                isOccupied: true,
                stack: 10_000,
                isSittingOut: true,
                isSittingOutNextHand: false,
              }
            : {
                ...seat,
                playerId: null,
                displayName: null,
                isOccupied: false,
                stack: 0,
                isSittingOut: false,
                isSittingOutNextHand: false,
              },
      ),
    }

    expect(getTableStatus(settledTable, null, Date.parse('2026-04-30T00:00:00.000Z'))).toEqual({
      eyebrow: 'Waiting',
      title: 'Waiting for players',
      detail: 'A hand starts automatically when enough seats are ready.',
    })
  })

  it('shows the showdown clear countdown when the result is visible but too few players can continue', () => {
    const { table } = createTableSkeletonSnapshot()
    const settledTable = {
      ...table,
      handStatus: 'settled' as const,
      street: 'showdown' as const,
      nextHandStartAt: '2026-04-30T00:00:10.000Z',
      nextHandDelayMs: 10_000,
      showdownSummary: {
        handId: 'hand-42',
        handNumber: 42,
        handEvaluations: [
          {
            seatId: 0,
            category: 'one-pair' as const,
            bestCards: ['As', 'Ah', 'Kc', 'Qd', '2s'] as [string, string, string, string, string],
            isRevealed: true,
          },
        ],
        potAwards: [],
        payouts: [],
        netPayouts: [],
        uncalledBetReturn: null,
      },
      seats: table.seats.map((seat) =>
        seat.seatId === 0
          ? {
              ...seat,
              isOccupied: true,
              stack: 10_000,
              isSittingOut: false,
              isSittingOutNextHand: false,
            }
          : seat.seatId === 1
            ? {
                ...seat,
                isOccupied: true,
                stack: 10_000,
                isSittingOut: true,
                isSittingOutNextHand: false,
              }
            : {
                ...seat,
                playerId: null,
                displayName: null,
                isOccupied: false,
                stack: 0,
                isSittingOut: false,
                isSittingOutNextHand: false,
              },
      ),
    }

    expect(isResultClearTimer(settledTable)).toBe(true)
    expect(getNextHandTimerDurationMs(settledTable)).toBe(10_000)
    expect(getTableStatus(settledTable, null, Date.parse('2026-04-30T00:00:01.000Z'))).toEqual({
      eyebrow: 'Showdown',
      title: 'Result is showing',
      detail: 'Clears in 9s',
    })
  })

  it('uses the server-projected next hand delay when available', () => {
    const { table } = createTableSkeletonSnapshot()

    expect(getNextHandTimerDurationMs({ ...table, nextHandDelayMs: 5_000 })).toBe(5_000)
    expect(getNextHandTimerDurationMs({ ...table, nextHandDelayMs: 10_000 })).toBe(10_000)
  })

  it('falls back to the matching next hand delay for waiting, fold, and showdown states', () => {
    const { table } = createTableSkeletonSnapshot()

    expect(getNextHandTimerDurationMs({ ...table, handStatus: 'waiting', nextHandDelayMs: null })).toBe(
      WAITING_ROOM_START_DELAY_MS,
    )
    expect(
      getNextHandTimerDurationMs({
        ...table,
        handStatus: 'settled',
        nextHandDelayMs: null,
        showdownSummary: {
          handId: 'hand-1',
          handNumber: 1,
          handEvaluations: [],
          potAwards: [],
          payouts: [],
          netPayouts: [],
          uncalledBetReturn: null,
        },
      }),
    ).toBe(UNCONTESTED_NEXT_HAND_DELAY_MS)
    expect(
      getNextHandTimerDurationMs({
        ...table,
        handStatus: 'settled',
        nextHandDelayMs: null,
        showdownSummary: {
          handId: 'hand-2',
          handNumber: 2,
          handEvaluations: [
            {
              seatId: 0,
              category: 'one-pair',
              bestCards: ['As', 'Ah', 'Kc', 'Qd', '2s'],
              isRevealed: true,
            },
          ],
          potAwards: [],
          payouts: [],
          netPayouts: [],
          uncalledBetReturn: null,
        },
      }),
    ).toBe(NEXT_HAND_DELAY_MS)
  })

  it('detects when sitting out would cancel a queued waiting-room start', () => {
    const { table } = createTableSkeletonSnapshot()
    const waitingTable = {
      ...table,
      handStatus: 'waiting' as const,
      nextHandStartAt: '2026-04-30T00:00:03.000Z',
      seats: table.seats.map((seat) =>
        seat.seatId < 2
          ? {
              ...seat,
              isOccupied: true,
              stack: 10_000,
              isSittingOut: false,
              isSittingOutNextHand: false,
            }
          : {
              ...seat,
              playerId: null,
              displayName: null,
              isOccupied: false,
              stack: 0,
              isSittingOut: false,
              isSittingOutNextHand: false,
            },
      ),
    }

    expect(wouldSitOutCancelQueuedStart(waitingTable, waitingTable.seats[0]!)).toBe(true)
    expect(canLeaveSeatFromTableState(waitingTable, waitingTable.seats[0]!)).toBe(false)

    const threeEligibleTable = {
      ...waitingTable,
      seats: waitingTable.seats.map((seat) =>
        seat.seatId === 2
          ? {
              ...seat,
              playerId: 'player-2',
              displayName: 'Player 2',
              isOccupied: true,
              stack: 10_000,
            }
          : seat,
      ),
    }

    expect(wouldSitOutCancelQueuedStart(threeEligibleTable, threeEligibleTable.seats[0]!)).toBe(false)
  })

  it('allows leaving a lone waiting seat without requiring a visible sit-out first', () => {
    const { table } = createTableSkeletonSnapshot()
    const waitingTable = {
      ...table,
      handStatus: 'waiting' as const,
      nextHandStartAt: null,
      seats: table.seats.map((seat) =>
        seat.seatId === 4
          ? {
              ...seat,
              isOccupied: true,
              stack: 10_000,
              isSittingOut: false,
              isSittingOutNextHand: false,
              isWaitingForNextHand: false,
            }
          : {
              ...seat,
              playerId: null,
              displayName: null,
              isOccupied: false,
              stack: 0,
              isSittingOut: false,
              isSittingOutNextHand: false,
              isWaitingForNextHand: false,
            },
      ),
    }

    expect(canLeaveSeatFromTableState(waitingTable, waitingTable.seats[4]!)).toBe(true)
  })

  it('blocks leaving an active hand unless the seat is outside the current hand', () => {
    const { table } = createTableSkeletonSnapshot()

    expect(canLeaveSeatFromTableState(table, table.seats[4]!)).toBe(false)

    const waitingForNextHandTable = {
      ...table,
      seats: table.seats.map((seat) =>
        seat.seatId === 4
          ? {
              ...seat,
              isWaitingForNextHand: true,
            }
          : seat,
      ),
    }

    expect(
      canLeaveSeatFromTableState(
        waitingForNextHandTable,
        waitingForNextHandTable.seats[4]!,
      ),
    ).toBe(true)
  })

  it('does not count disconnected seats as ready for the next hand', () => {
    const { table } = createTableSkeletonSnapshot()
    const waitingTable = {
      ...table,
      handStatus: 'waiting' as const,
      seats: table.seats.map((seat) =>
        seat.seatId < 2
          ? {
              ...seat,
              isOccupied: true,
              stack: 10_000,
              isSittingOut: false,
              isSittingOutNextHand: false,
              isDisconnected: seat.seatId === 1,
            }
          : {
              ...seat,
              playerId: null,
              displayName: null,
              isOccupied: false,
              stack: 0,
              isSittingOut: false,
              isSittingOutNextHand: false,
              isDisconnected: false,
            },
      ),
    }

    expect(hasEnoughPlayersForNextHand(waitingTable)).toBe(false)
  })
})
