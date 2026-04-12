import { describe, expect, it } from 'vitest'
import { createDefaultTableConfig, getTableConfigValidationIssues } from '../src'

describe('table rules', () => {
  it('creates a valid default table config for the MVP', () => {
    const config = createDefaultTableConfig()

    expect(getTableConfigValidationIssues(config)).toEqual([])
    expect(config.maxSeats).toBe(6)
    expect(config.smallBlind).toBeLessThan(config.bigBlind)
    expect(config.autoStartMinPlayers).toBe(2)
  })

  it('rejects blind and buy-in configurations that violate basic cash-game rules', () => {
    const config = createDefaultTableConfig({
      smallBlind: 100,
      bigBlind: 100,
      minBuyIn: 50,
      maxBuyIn: 40,
    })

    const issues = getTableConfigValidationIssues(config)

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'bigBlind' }),
        expect.objectContaining({ path: 'minBuyIn' }),
        expect.objectContaining({ path: 'maxBuyIn' }),
      ]),
    )
  })
})
