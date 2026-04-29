import type {
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableActionType,
  TableCardCode,
  TableHandStatus,
  TableStreet,
} from "@openpoker/protocol";

export type SeatTone = "empty" | "occupied" | "acting" | "hero" | "inactive";

const STREET_LABELS: Record<TableStreet, string> = {
  idle: "Idle",
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

const STATUS_LABELS: Record<TableHandStatus, string> = {
  waiting: "Waiting",
  "in-hand": "In hand",
  showdown: "Showdown",
  settled: "Settled",
};

const ACTION_LABELS: Record<TableActionType, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  "all-in": "All in",
};

const CARD_RANK_VALUE: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  t: 10,
  j: 11,
  q: 12,
  k: 13,
  a: 14,
};

export function formatTableChipAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export function formatSeatLabel(seatId: number): string {
  return `Seat ${seatId + 1}`;
}

export function formatStreetLabel(street: TableStreet): string {
  return STREET_LABELS[street];
}

export function formatHandStatusLabel(status: TableHandStatus): string {
  return STATUS_LABELS[status];
}

export function formatActionLabel(
  action: TableActionType,
  privateView: PrivatePlayerView | null,
  amountOverrideCents?: number | null,
): string {
  if (action === "call" && privateView && privateView.callAmount > 0) {
    return `Call ${formatTableChipAmount(privateView.callAmount)}`;
  }

  if (
    (action === "bet" || action === "raise") &&
    amountOverrideCents != null
  ) {
    return `${ACTION_LABELS[action]} ${formatTableChipAmount(amountOverrideCents)}`;
  }

  if (
    (action === "bet" || action === "raise") &&
    privateView?.minBetOrRaiseTo != null
  ) {
    return `${ACTION_LABELS[action]} ${formatTableChipAmount(privateView.minBetOrRaiseTo)}`;
  }

  return ACTION_LABELS[action];
}

export function formatPotLabel(table: PublicTableView): string {
  if (table.sidePots.length === 0) {
    return formatTableChipAmount(table.mainPot);
  }

  return `${formatTableChipAmount(table.totalPot)} total`;
}

export function normalizeBoardCards(
  board: TableCardCode[],
): Array<TableCardCode | null> {
  return Array.from({ length: 5 }, (_, index) => board[index] ?? null);
}

export function getSeatDisplayName(seat: PublicSeatView): string {
  return seat.displayName ?? formatSeatLabel(seat.seatId);
}

export function getSeatTone(
  table: PublicTableView,
  privateView: PrivatePlayerView | null,
  seat: PublicSeatView,
): SeatTone {
  if (!seat.isOccupied) {
    return "empty";
  }

  if (privateView?.seatId === seat.seatId) {
    return "hero";
  }

  if (table.actingSeat === seat.seatId) {
    return "acting";
  }

  if (seat.hasFolded || seat.isSittingOut || seat.isDisconnected) {
    return "inactive";
  }

  return "occupied";
}

export function getSeatBadges(
  table: PublicTableView,
  seat: PublicSeatView,
): string[] {
  const badges: string[] = [];

  if (table.dealerSeat === seat.seatId) {
    badges.push("BTN");
  }

  if (table.smallBlindSeat === seat.seatId) {
    badges.push("SB");
  }

  if (table.bigBlindSeat === seat.seatId) {
    badges.push("BB");
  }

  if (seat.hasFolded) {
    badges.push("Folded");
  }

  if (seat.isAllIn) {
    badges.push("All in");
  }

  if (seat.isSittingOut) {
    badges.push("Sitting out");
  }

  if (seat.isDisconnected) {
    badges.push("Offline");
  }

  return badges;
}

export function getVisibleHoleCards(
  privateView: PrivatePlayerView | null,
  seat: PublicSeatView,
  showRevealedCards = true,
): [TableCardCode, TableCardCode] | null {
  if (privateView?.seatId === seat.seatId) {
    return privateView.holeCards
      ? sortHoleCardsForDisplay(privateView.holeCards)
      : null;
  }

  return showRevealedCards && seat.revealedHoleCards
    ? sortHoleCardsForDisplay(seat.revealedHoleCards)
    : null;
}

function sortHoleCardsForDisplay(
  cards: [TableCardCode, TableCardCode],
): [TableCardCode, TableCardCode] {
  const firstValue = getCardRankValue(cards[0]);
  const secondValue = getCardRankValue(cards[1]);

  return secondValue > firstValue ? [cards[1], cards[0]] : [...cards];
}

function getCardRankValue(card: TableCardCode): number {
  const rank = card.trim().slice(0, -1).toLowerCase();

  return CARD_RANK_VALUE[rank] ?? 0;
}
