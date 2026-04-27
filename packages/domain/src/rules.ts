export type GameVariant = 'texas-holdem'
export type BettingStructure = 'no-limit'
export type TableMode = 'cash'

export interface TableConfig {
  variant: GameVariant
  bettingStructure: BettingStructure
  tableMode: TableMode
  maxSeats: number
  smallBlind: number
  bigBlind: number
  minBuyIn: number
  maxBuyIn: number
  autoStartMinPlayers: number
  actionTimeoutMs: number
}

export interface ValidationIssue {
  path: string
  message: string
}

export function createDefaultTableConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    variant: 'texas-holdem',
    bettingStructure: 'no-limit',
    tableMode: 'cash',
    maxSeats: 6,
    smallBlind: 50,
    bigBlind: 100,
    minBuyIn: 5_000,
    maxBuyIn: 20_000,
    autoStartMinPlayers: 2,
    actionTimeoutMs: 30_000,
    ...overrides,
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

export function getTableConfigValidationIssues(config: TableConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (config.variant !== 'texas-holdem') {
    issues.push({ path: 'variant', message: 'Only texas-holdem is currently supported.' })
  }

  if (config.bettingStructure !== 'no-limit') {
    issues.push({ path: 'bettingStructure', message: 'Only no-limit tables are currently supported.' })
  }

  if (config.tableMode !== 'cash') {
    issues.push({ path: 'tableMode', message: 'Only cash games are currently supported.' })
  }

  if (!isPositiveInteger(config.maxSeats) || config.maxSeats < 2) {
    issues.push({ path: 'maxSeats', message: 'maxSeats must be an integer greater than or equal to 2.' })
  }

  if (!isPositiveInteger(config.smallBlind)) {
    issues.push({ path: 'smallBlind', message: 'smallBlind must be a positive integer.' })
  }

  if (!isPositiveInteger(config.bigBlind)) {
    issues.push({ path: 'bigBlind', message: 'bigBlind must be a positive integer.' })
  }

  if (isPositiveInteger(config.smallBlind) && isPositiveInteger(config.bigBlind) && config.bigBlind <= config.smallBlind) {
    issues.push({ path: 'bigBlind', message: 'bigBlind must be strictly greater than smallBlind.' })
  }

  if (!isPositiveInteger(config.minBuyIn)) {
    issues.push({ path: 'minBuyIn', message: 'minBuyIn must be a positive integer.' })
  }

  if (!isPositiveInteger(config.maxBuyIn)) {
    issues.push({ path: 'maxBuyIn', message: 'maxBuyIn must be a positive integer.' })
  }

  if (isPositiveInteger(config.bigBlind) && isPositiveInteger(config.minBuyIn) && config.minBuyIn < config.bigBlind) {
    issues.push({ path: 'minBuyIn', message: 'minBuyIn must be greater than or equal to bigBlind.' })
  }

  if (isPositiveInteger(config.minBuyIn) && isPositiveInteger(config.maxBuyIn) && config.maxBuyIn < config.minBuyIn) {
    issues.push({ path: 'maxBuyIn', message: 'maxBuyIn must be greater than or equal to minBuyIn.' })
  }

  if (!isPositiveInteger(config.autoStartMinPlayers) || config.autoStartMinPlayers < 2) {
    issues.push({
      path: 'autoStartMinPlayers',
      message: 'autoStartMinPlayers must be an integer greater than or equal to 2.',
    })
  }

  if (
    isPositiveInteger(config.maxSeats) &&
    isPositiveInteger(config.autoStartMinPlayers) &&
    config.autoStartMinPlayers > config.maxSeats
  ) {
    issues.push({
      path: 'autoStartMinPlayers',
      message: 'autoStartMinPlayers must not exceed maxSeats.',
    })
  }

  if (!isPositiveInteger(config.actionTimeoutMs)) {
    issues.push({ path: 'actionTimeoutMs', message: 'actionTimeoutMs must be a positive integer.' })
  }

  return issues
}

export function assertValidTableConfig(config: TableConfig): void {
  const issues = getTableConfigValidationIssues(config)

  if (issues.length === 0) {
    return
  }

  const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')
  throw new Error(`Invalid table config: ${summary}`)
}
