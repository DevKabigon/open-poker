import { describe, expect, it } from 'vitest'
import { CARD_BACK_ASSET_PATH, CHIP_ASSET_PATH, DEALER_BUTTON_ASSET_PATH, getCardAssetPath } from './table-assets'

describe('table assets', () => {
  it('maps compact card codes to public card asset paths', () => {
    expect(getCardAssetPath('Ah')).toBe('/cards/hearts_ace.png')
    expect(getCardAssetPath('7d')).toBe('/cards/diamonds_07.png')
    expect(getCardAssetPath('2c')).toBe('/cards/clubs_02.png')
    expect(getCardAssetPath('Qs')).toBe('/cards/spades_queen.png')
    expect(getCardAssetPath('10s')).toBe('/cards/spades_10.png')
    expect(getCardAssetPath('Ts')).toBe('/cards/spades_10.png')
  })

  it('exposes chip and fallback card asset paths', () => {
    expect(CARD_BACK_ASSET_PATH).toBe('/cards/back01.png')
    expect(CHIP_ASSET_PATH).toBe('/chips/chips.png')
    expect(DEALER_BUTTON_ASSET_PATH).toBe('/chips/dealer.png')
  })

  it('returns null for unknown card codes', () => {
    expect(getCardAssetPath('')).toBeNull()
    expect(getCardAssetPath('1x')).toBeNull()
  })
})
