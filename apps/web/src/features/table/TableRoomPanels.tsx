import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show } from "solid-js";
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
            class="op-button op-button-secondary px-3"
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
