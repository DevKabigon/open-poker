import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import {
  Metric,
  PlayingCard,
  SectionTitle,
  Tag,
} from "./table-primitives";
import {
  formatActionLabel,
  formatHandStatusLabel,
  formatPotLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
  normalizeBoardCards,
} from "./table-utils";

const NEXT_HAND_DELAY_MS = 3_000;

export function RoomHeader(props: {
  blindLabel: string;
  buyInLabel: string;
  canLeaveSeat: boolean;
  isRefreshing: boolean;
  isLeavingSeat: boolean;
  isResettingRoom: boolean;
  leaveSeatLabel: string;
  roomTitle: string;
  table: PublicTableView;
  onBackToLobby: () => void;
  onLeaveSeat: () => void;
  onRefresh: () => void;
  onResetRoom: () => void;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.62)] p-3 sm:p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
            {props.blindLabel} · {formatHandStatusLabel(props.table.handStatus)}{" "}
            · Sync v{props.table.roomVersion}
            <Show when={props.isRefreshing}> · Updating</Show>
          </p>
          <h1 class="mt-1 truncate font-display text-xl font-semibold tracking-[-0.03em] text-[var(--op-cream-100)]">
            {props.roomTitle}
          </h1>
          <p class="mt-1 font-data text-[0.68rem] text-[var(--op-muted-300)]">
            {props.buyInLabel}
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Show when={props.canLeaveSeat}>
            <button
              class="op-button op-button-primary px-3"
              type="button"
              disabled={props.isLeavingSeat}
              onClick={props.onLeaveSeat}
            >
              {props.isLeavingSeat ? "Leaving" : props.leaveSeatLabel}
            </button>
          </Show>
          <button
            class="op-button op-button-secondary px-3"
            type="button"
            disabled={props.isRefreshing}
            onClick={props.onRefresh}
          >
            Refresh
          </button>
          <button
            class="op-button op-button-danger px-3"
            type="button"
            disabled={props.isResettingRoom}
            onClick={props.onResetRoom}
          >
            {props.isResettingRoom ? "Resetting" : "Reset room"}
          </button>
          <button
            class="op-button op-button-secondary px-3"
            type="button"
            onClick={props.onBackToLobby}
          >
            Lobby
          </button>
        </div>
      </div>
    </section>
  );
}

export function TableStatePanel(props: {
  eyebrow: string;
  title: string;
  detail: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onBackToLobby: () => void;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.62)] p-4 sm:p-6">
      <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-accent-400)]">
        {props.eyebrow}
      </p>
      <h1 class="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-[var(--op-cream-100)]">
        {props.title}
      </h1>
      <Show when={props.detail}>
        {(detail) => (
          <p class="mt-2 font-data text-xs text-[var(--op-muted-300)]">
            {detail()}
          </p>
        )}
      </Show>
      <div class="mt-4 flex flex-wrap gap-2">
        <Show when={props.actionLabel && props.onAction ? { label: props.actionLabel, handler: props.onAction } : null}>
          {(action) => (
            <button
              class="op-button op-button-primary px-3"
              type="button"
              onClick={action().handler}
            >
              {action().label}
            </button>
          )}
        </Show>
        <button
          class="op-button op-button-secondary px-3"
          type="button"
          onClick={props.onBackToLobby}
        >
          Lobby
        </button>
      </div>
    </section>
  );
}

export function TableStatusPanel(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
  isSettingShowdownReveal: boolean;
  showCardsAtShowdown: boolean;
  onShowCardsAtShowdownChange: (value: boolean) => void;
}) {
  const now = createNowTicker();
  const status = createMemo(() =>
    getTableStatus(props.table, props.privateView, now()),
  );
  const actionTimer = createMemo(() =>
    props.privateView?.canAct
      ? getDeadlineProgress(
          props.privateView.actionDeadlineAt,
          props.table.actionTimeoutMs,
          now(),
        )
      : null,
  );
  const nextHandTimer = createMemo(() =>
    getDeadlineProgress(props.table.nextHandStartAt, NEXT_HAND_DELAY_MS, now()),
  );

  return (
    <section class="rounded-[0.85rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.46)] p-2.5 sm:p-3">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <p class="font-data text-[0.58rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
            {status().eyebrow}
          </p>
          <div class="mt-1 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <h2 class="truncate font-display text-sm font-semibold tracking-[-0.02em] text-[var(--op-cream-100)]">
              {status().title}
            </h2>
            <p class="font-data text-[0.66rem] text-[var(--op-muted-300)]">
              {status().detail}
            </p>
          </div>
        </div>

        <label class="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.045)] px-3 py-1.5 font-data text-[0.6rem] font-bold uppercase tracking-[0.06em] text-[var(--op-muted-300)]">
          <input
            class="size-4 accent-[var(--op-accent-400)]"
            type="checkbox"
            checked={props.showCardsAtShowdown}
            disabled={!props.privateView || props.isSettingShowdownReveal}
            onChange={(event) =>
              props.onShowCardsAtShowdownChange(event.currentTarget.checked)
            }
          />
          Reveal my hand
        </label>
      </div>

      <Show when={actionTimer()}>
        {(timer) => (
          <TimerProgress
            label="Action timer"
            remainingLabel={formatRemainingSeconds(timer().remainingMs)}
            percent={timer().percent}
            remainingMs={timer().remainingMs}
            tone="action"
          />
        )}
      </Show>

      <Show when={!actionTimer() && nextHandTimer()}>
        {(timer) => (
          <TimerProgress
            label="Next hand"
            remainingLabel={formatRemainingSeconds(timer().remainingMs)}
            percent={timer().percent}
            remainingMs={timer().remainingMs}
            tone="next"
          />
        )}
      </Show>
    </section>
  );
}

function TimerProgress(props: {
  label: string;
  remainingLabel: string;
  percent: number;
  remainingMs: number;
  tone: "action" | "next";
}) {
  return (
    <div class="mt-2">
      <div class="flex items-center justify-between gap-3 font-data text-[0.62rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
        <span>{props.label}</span>
        <span>{props.remainingLabel}</span>
      </div>
      <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[rgba(238,246,255,0.08)]">
        <div
          class="op-timer-fill h-full origin-left rounded-full"
          style={`${getTimerColorStyle(props.remainingMs, props.tone)} transform: scaleX(${props.percent / 100})`}
        />
      </div>
    </div>
  );
}

function getTimerColorStyle(
  remainingMs: number,
  tone: "action" | "next",
): string {
  if (tone === "next") {
    return [
      "--op-timer-start: var(--op-blue-500);",
      "--op-timer-end: var(--op-accent-300);",
      "--op-timer-glow: rgba(96, 165, 250, 0.34);",
      "--op-timer-glow-warm: rgba(56, 189, 248, 0.16);",
    ].join(" ");
  }

  const seconds = Math.max(0, Math.min(30, remainingMs / 1000));
  const hue =
    seconds <= 10
      ? interpolate(2, 30, seconds / 10)
      : seconds <= 20
        ? interpolate(30, 42, (seconds - 10) / 10)
        : interpolate(42, 145, (seconds - 20) / 10);
  const endHue = Math.min(hue + 12, 155);
  const glow = `hsla(${hue}, 92%, 62%, 0.38)`;
  const warmGlow = `hsla(${endHue}, 92%, 58%, 0.18)`;

  return [
    `--op-timer-start: hsl(${hue}, 88%, 58%);`,
    `--op-timer-end: hsl(${endHue}, 92%, 66%);`,
    `--op-timer-glow: ${glow};`,
    `--op-timer-glow-warm: ${warmGlow};`,
  ].join(" ");
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, progress));
}

function createNowTicker() {
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

function getDeadlineProgress(
  deadlineAt: string | null,
  totalMs: number,
  now: number,
): { percent: number; remainingMs: number } | null {
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

function formatRemainingSeconds(remainingMs: number): string {
  return `${Math.ceil(remainingMs / 1000)}s`;
}

function getTableStatus(
  table: PublicTableView,
  privateView: PrivatePlayerView | null,
  now: number,
): { eyebrow: string; title: string; detail: string } {
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
        : "Waiting for the next hand.",
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

export function BoardInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-3 sm:p-4">
      <SectionTitle label="Board" />
      <div class="mt-3 grid gap-3 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div class="flex gap-2">
          <For each={normalizeBoardCards(props.table.board)}>
            {(card) => <PlayingCard card={card} />}
          </For>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Street"
            value={formatStreetLabel(props.table.street)}
          />
          <Metric
            label="Status"
            value={formatHandStatusLabel(props.table.handStatus)}
          />
          <Metric label="Hand" value={String(props.table.handNumber)} />
          <Metric
            label="Acting"
            value={
              props.table.actingSeat === null
                ? "-"
                : formatSeatLabel(props.table.actingSeat)
            }
          />
        </div>
      </div>
    </section>
  );
}

export function BetInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-3 sm:p-4">
      <SectionTitle label="Chips / Bet" />
      <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Pot" value={formatPotLabel(props.table)} chip />
        <Metric
          label="Main"
          value={formatTableChipAmount(props.table.mainPot)}
          chip
        />
        <Metric
          label="Current bet"
          value={formatTableChipAmount(props.table.currentBet)}
          chip
        />
        <Metric label="Side pots" value={String(props.table.sidePots.length)} />
        <Metric
          label="Call"
          value={formatTableChipAmount(props.privateView?.callAmount ?? 0)}
          chip
        />
        <Metric
          label="Min raise"
          value={formatNullableChipAmount(
            props.privateView?.minBetOrRaiseTo ?? null,
          )}
          chip
        />
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <For each={props.privateView?.allowedActions ?? []}>
          {(action) => (
            <Tag
              label={formatActionLabel(action, props.privateView)}
              tone="active"
            />
          )}
        </For>
      </div>
    </section>
  );
}

function formatNullableChipAmount(amount: number | null): string {
  return amount === null ? "-" : formatTableChipAmount(amount);
}
