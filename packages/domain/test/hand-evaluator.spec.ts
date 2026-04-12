import { describe, expect, it } from 'vitest'
import { compareEvaluatedHands, evaluateFiveCardHand, evaluateSevenCardHand } from '../src'

describe('hand evaluator', () => {
  it('detects each major five-card hand category with the right tiebreaker', () => {
    expect(evaluateFiveCardHand(['As', 'Ks', 'Qs', 'Js', 'Ts'])).toMatchObject({
      category: 'straight-flush',
      tiebreaker: [14],
    })

    expect(evaluateFiveCardHand(['Ac', 'Ad', 'Ah', 'As', '2d'])).toMatchObject({
      category: 'four-of-a-kind',
      tiebreaker: [14, 2],
    })

    expect(evaluateFiveCardHand(['Kh', 'Kd', 'Kc', '2s', '2h'])).toMatchObject({
      category: 'full-house',
      tiebreaker: [13, 2],
    })

    expect(evaluateFiveCardHand(['Ah', 'Jh', '8h', '4h', '2h'])).toMatchObject({
      category: 'flush',
      tiebreaker: [14, 11, 8, 4, 2],
    })

    expect(evaluateFiveCardHand(['As', '2d', '3c', '4h', '5s'])).toMatchObject({
      category: 'straight',
      tiebreaker: [5],
    })

    expect(evaluateFiveCardHand(['Qc', 'Qd', 'Qs', '9h', '2c'])).toMatchObject({
      category: 'three-of-a-kind',
      tiebreaker: [12, 9, 2],
    })

    expect(evaluateFiveCardHand(['Jc', 'Jd', '4s', '4h', 'Ac'])).toMatchObject({
      category: 'two-pair',
      tiebreaker: [11, 4, 14],
    })

    expect(evaluateFiveCardHand(['9c', '9d', 'As', 'Jh', '4c'])).toMatchObject({
      category: 'one-pair',
      tiebreaker: [9, 14, 11, 4],
    })

    expect(evaluateFiveCardHand(['As', 'Kd', '9h', '5c', '3d'])).toMatchObject({
      category: 'high-card',
      tiebreaker: [14, 13, 9, 5, 3],
    })
  })

  it('compares equal category hands by kicker sequence', () => {
    const strongerPair = evaluateFiveCardHand(['Ac', 'Ad', 'Kh', '9s', '3c'])
    const weakerPair = evaluateFiveCardHand(['As', 'Ah', 'Qd', '9c', '3d'])

    expect(compareEvaluatedHands(strongerPair, weakerPair)).toBe(1)
    expect(compareEvaluatedHands(weakerPair, strongerPair)).toBe(-1)
  })

  it('treats the wheel as lower than a six-high straight', () => {
    const wheel = evaluateFiveCardHand(['As', '2d', '3c', '4h', '5s'])
    const sixHighStraight = evaluateFiveCardHand(['2s', '3d', '4c', '5h', '6s'])

    expect(compareEvaluatedHands(wheel, sixHighStraight)).toBe(-1)
  })

  it('chooses the best five-card combination from seven cards', () => {
    const evaluated = evaluateSevenCardHand(['Ah', 'Ad', 'Ac', 'Ks', 'Kd', 'Qh', 'Qc'])

    expect(evaluated).toMatchObject({
      category: 'full-house',
      tiebreaker: [14, 13],
    })
  })

  it('finds a straight flush from seven cards when available', () => {
    const evaluated = evaluateSevenCardHand(['9s', 'Ts', 'Js', 'Qs', 'Ks', '2d', '2c'])

    expect(evaluated).toMatchObject({
      category: 'straight-flush',
      tiebreaker: [13],
    })
  })

  it('rejects duplicate cards in five-card evaluation', () => {
    expect(() => evaluateFiveCardHand(['As', 'As', 'Kd', 'Qc', 'Jh'])).toThrow(
      'Five-card hand evaluation does not allow duplicate cards: As.',
    )
  })

  it('rejects invalid seven-card input length', () => {
    expect(() => evaluateSevenCardHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '9d'])).toThrow(
      'Seven-card evaluation requires exactly 7 cards, received 6.',
    )
  })
})
