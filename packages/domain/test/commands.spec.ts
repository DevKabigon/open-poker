import { describe, expect, it } from 'vitest'
import {
  assertValidDomainCommand,
  getDomainCommandValidationIssues,
  isDomainCommand,
  type DomainCommand,
} from '../src'

describe('domain commands', () => {
  it('accepts a valid start-hand command', () => {
    const command: DomainCommand = {
      type: 'start-hand',
      seed: 'hand-42',
      handId: 'room-1:hand:42',
      timestamp: '2026-04-13T10:00:00.000Z',
    }

    expect(getDomainCommandValidationIssues(command)).toEqual([])
    expect(isDomainCommand(command)).toBe(true)
    expect(() => assertValidDomainCommand(command)).not.toThrow()
  })

  it('accepts a valid act command with a raise request', () => {
    const command: DomainCommand = {
      type: 'act',
      seatId: 3,
      action: {
        type: 'raise',
        amount: 1200,
      },
      timestamp: '2026-04-13T10:01:00.000Z',
    }

    expect(getDomainCommandValidationIssues(command)).toEqual([])
  })

  it('rejects act commands with an invalid seat id and malformed action payload', () => {
    expect(getDomainCommandValidationIssues({
      type: 'act',
      seatId: -1,
      action: {
        type: 'raise',
        amount: 0,
      },
      timestamp: '',
    })).toEqual([
      { path: 'timestamp', message: 'timestamp must be a non-empty string when provided.' },
      { path: 'seatId', message: 'seatId must be a non-negative integer.' },
      { path: 'action.amount', message: 'raise amount must be a positive integer.' },
    ])
  })

  it('rejects malformed timeout and start-hand commands', () => {
    expect(getDomainCommandValidationIssues({
      type: 'timeout',
      seatId: '2',
    })).toEqual([{ path: 'seatId', message: 'seatId must be a non-negative integer.' }])

    expect(getDomainCommandValidationIssues({
      type: 'start-hand',
      seed: '',
      handId: '   ',
    })).toEqual([
      { path: 'seed', message: 'seed must be a finite number or a non-empty string.' },
      { path: 'handId', message: 'handId must be a non-empty string when provided.' },
    ])
  })

  it('rejects unknown command types', () => {
    expect(getDomainCommandValidationIssues({
      type: 'magic',
    })).toEqual([
      {
        path: 'type',
        message: 'type must be one of start-hand, act, timeout, advance-street, or settle-showdown.',
      },
    ])
  })
})
