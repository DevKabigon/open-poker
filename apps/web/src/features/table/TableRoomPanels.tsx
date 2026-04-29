import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show } from "solid-js";
import { PlayingCard, SectionTitle } from "./table-primitives";
import {
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

export function BoardInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[0.9rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-2.5 sm:p-3">
      <div class="flex items-center justify-between gap-3">
        <SectionTitle label="Board / Chips" />
        <BoardStat label="Hand" value={`#${props.table.handNumber}`} />
      </div>

      <div class="mt-2 grid gap-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <div class="flex min-w-0 justify-center gap-1.5 sm:justify-start sm:gap-2">
          <For each={normalizeBoardCards(props.table.board)}>
            {(card) => <PlayingCard card={card} size="board" />}
          </For>
        </div>

        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[0.7rem] border border-[rgba(238,246,255,0.07)] bg-[rgba(238,246,255,0.035)] px-2 py-1.5 font-data text-[0.6rem] leading-none text-[var(--op-muted-300)] sm:gap-x-2.5 sm:px-2.5">
          <BoardStat label="Street" value={formatStreetLabel(props.table.street)} />
          <BoardStat
            label="Acting"
            value={
              props.table.actingSeat === null
                ? "-"
                : formatSeatLabel(props.table.actingSeat)
            }
          />
          <BoardStat label="Pot" value={formatPotLabel(props.table)} />
          <BoardStat
            label="Bet"
            value={formatTableChipAmount(props.table.currentBet)}
          />
          <BoardStat
            label={getCallStatLabel(props.privateView)}
            value={formatCallLabel(props.privateView)}
          />
          <Show when={props.privateView?.minBetOrRaiseTo != null}>
            <BoardStat
              label="Min raise"
              value={formatTableChipAmount(props.privateView!.minBetOrRaiseTo!)}
            />
          </Show>
        </div>
      </div>
    </section>
  );
}

function BoardStat(props: { label: string; value: string }) {
  return (
    <span class="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
      <span class="uppercase tracking-[0.1em] text-[var(--op-muted-500)]">
        {props.label}
      </span>
      <span class="truncate font-semibold text-[var(--op-cream-100)]">
        {props.value}
      </span>
    </span>
  );
}

function formatCallLabel(privateView: PrivatePlayerView | null): string {
  if (
    privateView?.callAmount === 0 &&
    privateView.allowedActions.includes("check")
  ) {
    return "Check";
  }

  return formatTableChipAmount(privateView?.callAmount ?? 0);
}

function getCallStatLabel(privateView: PrivatePlayerView | null): string {
  return privateView?.callAmount === 0 &&
    privateView.allowedActions.includes("check")
    ? "Option"
    : "Call";
}
