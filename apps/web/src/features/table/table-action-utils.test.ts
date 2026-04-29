import { describe, expect, it } from 'vitest'
import { createTableSkeletonSnapshot } from './table-fixtures'
import {
  getNextHandTimerDurationMs,
  getTableStatus,
  NEXT_HAND_DELAY_MS,
  UNCONTESTED_NEXT_HAND_DELAY_MS,
  WAITING_ROOM_START_DELAY_MS,
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
})
