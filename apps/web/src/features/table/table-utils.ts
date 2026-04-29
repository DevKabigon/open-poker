import type {
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableActionType,
  TableCardCode,
  TableHandCategory,
  TableHandStatus,
  TableStreet,
} from "@openpoker/protocol";

export type SeatTone = "empty" | "occupied" | "acting" | "hero" | "inactive";
export type SeatHoleCardStatus = "revealed" | "mucked" | "folded";

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

const RANK_SINGULAR_LABEL: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};

const RANK_PLURAL_LABEL: Record<number, string> = {
  2: "Twos",
  3: "Threes",
  4: "Fours",
  5: "Fives",
  6: "Sixes",
  7: "Sevens",
  8: "Eights",
  9: "Nines",
  10: "Tens",
  11: "Jacks",
  12: "Queens",
  13: "Kings",
  14: "Aces",
};

const HAND_CATEGORY_LABELS: Record<TableHandCategory, string> = {
  "high-card": "High card",
  "one-pair": "One pair",
  "two-pair": "Two pair",
  "three-of-a-kind": "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  "full-house": "Full house",
  "four-of-a-kind": "Four of a kind",
  "straight-flush": "Straight flush",
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

export function isBoardOnlyBestHand(
  board: TableCardCode[],
  bestCards: TableCardCode[] | null,
): boolean {
  if (board.length < 5 || !bestCards || bestCards.length !== 5) {
    return false;
  }

  const boardCards = new Set(board);

  return bestCards.every((card) => boardCards.has(card));
}

export function isSeatMuckedAtShowdown(
  table: PublicTableView,
  seat: PublicSeatView,
): boolean {
  return getSeatHoleCardStatus(table, seat) === "mucked";
}

export function isSeatShowdownWinner(
  table: PublicTableView,
  seat: PublicSeatView,
): boolean {
  return (
    table.showdownSummary?.potAwards.some((award) =>
      award.winnerSeatIds.includes(seat.seatId),
    ) ?? false
  );
}

export function isSeatForcedShowdownReveal(
  table: PublicTableView,
  seat: PublicSeatView,
): boolean {
  const evaluation = table.showdownSummary?.handEvaluations.find(
    (entry) => entry.seatId === seat.seatId,
  );

  return evaluation !== undefined && isSeatShowdownWinner(table, seat);
}

export function getSeatHoleCardStatus(
  table: PublicTableView,
  seat: PublicSeatView,
): SeatHoleCardStatus | null {
  if (!seat.isOccupied) {
    return null;
  }

  const evaluation = table.showdownSummary?.handEvaluations.find(
    (entry) => entry.seatId === seat.seatId,
  );

  if (evaluation) {
    return evaluation.isRevealed ? "revealed" : "mucked";
  }

  if (seat.revealedHoleCards !== null) {
    return "revealed";
  }

  if (table.handStatus === "settled" && seat.hasFolded) {
    return "folded";
  }

  return null;
}

export function formatShowdownHandLabel(
  category: TableHandCategory | null,
  bestCards: TableCardCode[] | null,
  holeCards: [TableCardCode, TableCardCode] | null = null,
): string {
  if (category === null) {
    return "Mucked";
  }

  if (!bestCards || bestCards.length === 0) {
    return HAND_CATEGORY_LABELS[category];
  }

  const rankCounts = getRankCounts(bestCards);
  const highRank = getStraightHighRank(bestCards);

  switch (category) {
    case "high-card":
      return formatHighCardLabel(bestCards, holeCards);
    case "one-pair": {
      const pair = getRanksByCount(rankCounts, 2)[0];
      const kickers = getHoleCardKickerRanks(bestCards, holeCards, [pair]);
      return `Pair of ${getPluralRankLabel(pair)}${formatKickerSuffix(kickers)}`;
    }
    case "two-pair": {
      const pairs = getRanksByCount(rankCounts, 2).slice(0, 2);
      const kickers = getHoleCardKickerRanks(bestCards, holeCards, pairs);
      return `Two pair, ${getPluralRankLabel(pairs[0])} and ${getPluralRankLabel(pairs[1])}${formatKickerSuffix(kickers)}`;
    }
    case "three-of-a-kind": {
      const trip = getRanksByCount(rankCounts, 3)[0];
      return `Three of a kind, ${getPluralRankLabel(trip)}${formatKickerSuffix(getHoleCardKickerRanks(bestCards, holeCards, [trip]))}`;
    }
    case "straight":
      return `${getSingularRankLabel(highRank)}-high straight`;
    case "flush":
      return `${getSingularRankLabel(getHighestRank(bestCards))}-high flush`;
    case "full-house": {
      const trip = getRanksByCount(rankCounts, 3)[0];
      const pair = getRanksByCount(rankCounts, 2)[0];
      return `Full house, ${getPluralRankLabel(trip)} full of ${getPluralRankLabel(pair)}`;
    }
    case "four-of-a-kind": {
      const quads = getRanksByCount(rankCounts, 4)[0];
      return `Four of a kind, ${getPluralRankLabel(quads)}${formatKickerSuffix(getHoleCardKickerRanks(bestCards, holeCards, [quads]))}`;
    }
    case "straight-flush":
      return `${getSingularRankLabel(highRank)}-high straight flush`;
  }
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

function getRankCounts(cards: TableCardCode[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const card of cards) {
    const rank = getCardRankValue(card);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  return counts;
}

function getRanksByCount(counts: Map<number, number>, count: number): number[] {
  return [...counts.entries()]
    .filter(([, rankCount]) => rankCount === count)
    .map(([rank]) => rank)
    .sort((left, right) => right - left);
}

function getHighestRank(cards: TableCardCode[]): number {
  return Math.max(...cards.map(getCardRankValue));
}

function formatHighCardLabel(
  cards: TableCardCode[],
  holeCards: [TableCardCode, TableCardCode] | null,
): string {
  const ranks = [...new Set(cards.map(getCardRankValue))].sort(
    (left, right) => right - left,
  );
  const highRank = ranks[0];
  const kickers = getHoleCardKickerRanks(cards, holeCards, [highRank]);

  return `${getSingularRankLabel(highRank)}-high${formatKickerSuffix(kickers)}`;
}

function getHoleCardKickerRanks(
  cards: TableCardCode[],
  holeCards: [TableCardCode, TableCardCode] | null,
  madeHandRanks: Array<number | undefined>,
): number[] {
  if (!holeCards) {
    return [];
  }

  const ignoredRanks = new Set(
    madeHandRanks.filter((rank): rank is number => rank !== undefined),
  );
  const bestCardSet = new Set(cards);

  return [...new Set(holeCards.filter((card) => bestCardSet.has(card)).map(getCardRankValue))]
    .filter((rank) => !ignoredRanks.has(rank))
    .sort((left, right) => right - left);
}

function getStraightHighRank(cards: TableCardCode[]): number {
  const ranks = [...new Set(cards.map(getCardRankValue))].sort(
    (left, right) => right - left,
  );

  return ranks.includes(14) && ranks.includes(5) ? 5 : ranks[0] ?? 0;
}

function getSingularRankLabel(rank: number | undefined): string {
  return RANK_SINGULAR_LABEL[rank ?? 0] ?? "Unknown";
}

function getPluralRankLabel(rank: number | undefined): string {
  return RANK_PLURAL_LABEL[rank ?? 0] ?? "Unknown";
}

function formatKickerSuffix(ranks: number | number[] | undefined): string {
  const kickerRanks = Array.isArray(ranks)
    ? ranks.filter((rank) => rank !== undefined)
    : ranks === undefined
      ? []
      : [ranks];

  if (kickerRanks.length === 0) {
    return "";
  }

  if (kickerRanks.length === 1) {
    return `, ${getSingularRankLabel(kickerRanks[0])} kicker`;
  }

  return `, ${formatRankList(kickerRanks)} kickers`;
}

function formatRankList(ranks: number[]): string {
  const labels = ranks.map(getSingularRankLabel);

  if (labels.length === 1) {
    return labels[0]!;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
