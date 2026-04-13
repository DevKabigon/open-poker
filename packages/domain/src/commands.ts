import { type ActionRequest } from './action-validation'
import { type ValidationIssue } from './rules'
import { type SeatId } from './state'

export interface StartHandCommand {
  type: 'start-hand'
  seed: number | string
  handId?: string
  timestamp?: string
}

export interface ActCommand {
  type: 'act'
  seatId: SeatId
  action: ActionRequest
  timestamp?: string
}

export interface TimeoutCommand {
  type: 'timeout'
  seatId: SeatId
  timestamp?: string
}

export interface AdvanceStreetCommand {
  type: 'advance-street'
  timestamp?: string
}

export interface SettleShowdownCommand {
  type: 'settle-showdown'
  timestamp?: string
}

export type DomainCommand =
  | StartHandCommand
  | ActCommand
  | TimeoutCommand
  | AdvanceStreetCommand
  | SettleShowdownCommand

function issue(path: string, message: string): ValidationIssue {
  return { path, message }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateOptionalTimestamp(target: ValidationIssue[], path: string, value: unknown): void {
  if (value === undefined) {
    return
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    target.push(issue(path, 'timestamp must be a non-empty string when provided.'))
  }
}

function validateSeatId(target: ValidationIssue[], path: string, value: unknown): void {
  if (!isNonNegativeInteger(value)) {
    target.push(issue(path, 'seatId must be a non-negative integer.'))
  }
}

export function getActionRequestShapeValidationIssues(action: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPlainObject(action)) {
    return [issue('action', 'action must be an object.')]
  }

  const type = action.type

  if (type !== 'fold' && type !== 'check' && type !== 'call' && type !== 'bet' && type !== 'raise' && type !== 'all-in') {
    issues.push(issue('action.type', 'action.type must be one of fold, check, call, bet, raise, or all-in.'))
    return issues
  }

  if ((type === 'bet' || type === 'raise') && !isPositiveInteger(action.amount)) {
    issues.push(issue('action.amount', `${type} amount must be a positive integer.`))
  }

  if ((type === 'fold' || type === 'check' || type === 'call' || type === 'all-in') && 'amount' in action && action.amount !== undefined) {
    issues.push(issue('action.amount', `${type} must not include an amount.`))
  }

  return issues
}

export function getDomainCommandValidationIssues(command: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!isPlainObject(command)) {
    return [issue('command', 'command must be an object.')]
  }

  const type = command.type

  if (
    type !== 'start-hand' &&
    type !== 'act' &&
    type !== 'timeout' &&
    type !== 'advance-street' &&
    type !== 'settle-showdown'
  ) {
    issues.push(
      issue(
        'type',
        'type must be one of start-hand, act, timeout, advance-street, or settle-showdown.',
      ),
    )
    return issues
  }

  validateOptionalTimestamp(issues, 'timestamp', command.timestamp)

  switch (type) {
    case 'start-hand':
      if (
        !(
          (typeof command.seed === 'number' && Number.isFinite(command.seed)) ||
          (typeof command.seed === 'string' && command.seed.trim().length > 0)
        )
      ) {
        issues.push(issue('seed', 'seed must be a finite number or a non-empty string.'))
      }

      if (command.handId !== undefined && (typeof command.handId !== 'string' || command.handId.trim().length === 0)) {
        issues.push(issue('handId', 'handId must be a non-empty string when provided.'))
      }
      break

    case 'act':
      validateSeatId(issues, 'seatId', command.seatId)
      issues.push(...getActionRequestShapeValidationIssues(command.action))
      break

    case 'timeout':
      validateSeatId(issues, 'seatId', command.seatId)
      break

    case 'advance-street':
    case 'settle-showdown':
      break
  }

  return issues
}

export function assertValidDomainCommand(command: unknown): asserts command is DomainCommand {
  const issues = getDomainCommandValidationIssues(command)

  if (issues.length === 0) {
    return
  }

  throw new Error(`Invalid domain command: ${issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`)
}

export function isDomainCommand(command: unknown): command is DomainCommand {
  return getDomainCommandValidationIssues(command).length === 0
}
