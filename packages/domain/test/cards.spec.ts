import { describe, expect, it } from 'vitest'
import { assertCardCode, createCardCode, formatCard, isCardCode, parseCardCode } from '../src'

describe('cards', () => {
  it('creates and parses canonical card codes', () => {
    const code = createCardCode('A', 's')

    expect(code).toBe('As')
    expect(parseCardCode(code)).toEqual({
      rank: 'A',
      suit: 's',
      code: 'As',
    })
    expect(formatCard({ rank: 'T', suit: 'd' })).toBe('Td')
  })

  it('recognizes valid and invalid card codes', () => {
    expect(isCardCode('2c')).toBe(true)
    expect(isCardCode('As')).toBe(true)
    expect(isCardCode('1s')).toBe(false)
    expect(isCardCode('Acx')).toBe(false)

    expect(() => assertCardCode('Kd')).not.toThrow()
    expect(() => assertCardCode('ZZ')).toThrow('Invalid card code')
  })
})
