import type {
  PrivatePlayerView,
  PublicTableView,
  TableActionType,
} from "@openpoker/protocol";
import { createSignal, onCleanup } from "solid-js";
import {
  formatHandStatusLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
  type ChipAmountFormatter,
} from "./table-utils";

export type WagerActionType = Extract<TableActionType, "bet" | "raise">;

export interface DeadlineProgress {
  percent: number;
  remainingMs: number;
}

export interface TableActionStatus {
  eyebrow: string;
  title: string;
  detail: string;
}

export const NEXT_HAND_DELAY_MS = 10_000;

export function createNowTicker() {
  const [now, setNow] = createSignal(Date.now());

  if (typeof window === "undefined") {
    return now;
  }

  let frameId = 0;
  const tick = () => {
    setNow(Date.now());
    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);

  onCleanup(() => window.cancelAnimationFrame(frameId));

  return now;
}

export function getDeadlineProgress(
  deadlineAt: string | null,
  totalMs: number,
  now: number,
): DeadlineProgress | null {
  if (!deadlineAt) {
    return null;
  }

  const deadline = Date.parse(deadlineAt);

  if (Number.isNaN(deadline) || totalMs <= 0) {
    return null;
  }

  const remainingMs = Math.max(deadline - now, 0);
  const percent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));

  return { percent, remainingMs };
}

export function formatRemainingSeconds(remainingMs: number): string {
  return `${Math.ceil(remainingMs / 1000)}s`;
}

export function getTableStatus(
  table: PublicTableView,
  privateView: PrivatePlayerView | null,
  now: number,
): TableActionStatus {
  if (privateView?.canAct) {
    return {
      eyebrow: "Your turn",
      title: "Choose an action",
      detail: "Act before the timer reaches zero.",
    };
  }

  if (table.handStatus === "showdown") {
    return {
      eyebrow: "Showdown",
      title: "Cards are revealed",
      detail: "Eligible live hands can be shown until the pot is settled.",
    };
  }

  if (table.handStatus === "settled") {
    return {
      eyebrow: "Hand settled",
      title: "Next hand is queued",
      detail: table.nextHandStartAt
        ? `Starts in ${formatRemainingSeconds(Math.max(Date.parse(table.nextHandStartAt) - now, 0))}`
        : "Start the next hand when the result is checked.",
    };
  }

  if (table.actingSeat !== null) {
    return {
      eyebrow: "Waiting",
      title: `Waiting for ${formatSeatLabel(table.actingSeat)}`,
      detail: "The table will update when the action resolves.",
    };
  }

  if (table.handStatus === "waiting") {
    return {
      eyebrow: "Waiting",
      title: "Waiting for players",
      detail: "A hand starts automatically when enough seats are ready.",
    };
  }

  return {
    eyebrow: formatStreetLabel(table.street),
    title: formatHandStatusLabel(table.handStatus),
    detail: "Table state is syncing live.",
  };
}

export function parseDollarInputAsCents(value: string): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function formatDollarInputValue(amountCents: number): string {
  const amount = amountCents / 100;

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function formatNullableChipAmount(
  amount: number | null,
  formatAmount: ChipAmountFormatter = formatTableChipAmount,
): string {
  return amount === null ? "-" : formatAmount(amount);
}
