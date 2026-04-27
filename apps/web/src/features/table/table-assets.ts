import type { TableCardCode } from '@openpoker/protocol'

const CARD_SUIT_BY_CODE: Record<string, string> = {
  c: 'clubs',
  d: 'diamonds',
  h: 'hearts',
  s: 'spades',
}

const CARD_RANK_BY_CODE: Record<string, string> = {
  '2': '02',
  '3': '03',
  '4': '04',
  '5': '05',
  '6': '06',
  '7': '07',
  '8': '08',
  '9': '09',
  '10': '10',
  a: 'ace',
  j: 'jack',
  k: 'king',
  q: 'queen',
  t: '10',
}

export const CARD_BACK_ASSET_PATH = '/cards/back01.png'
export const CHIP_ASSET_PATH = '/chips/chips.png'
export const DEALER_BUTTON_ASSET_PATH = '/chips/dealer.png'

export function getCardAssetPath(card: TableCardCode): string | null {
  const normalized = card.trim().toLowerCase()
  const suitCode = normalized.slice(-1)
  const rankCode = normalized.slice(0, -1)
  const suit = CARD_SUIT_BY_CODE[suitCode]
  const rank = CARD_RANK_BY_CODE[rankCode]

  if (!suit || !rank) {
    return null
  }

  return `/cards/${suit}_${rank}.png`
}
