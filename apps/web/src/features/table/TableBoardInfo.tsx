import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show } from "solid-js";
import { ChipValue, PlayingCard, SectionTitle } from "./table-primitives";
import { TableShowdownSummary } from "./TableShowdownSummary";
import {
  formatPotLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
  normalizeBoardCards,
} from "./table-utils";

export function BoardInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[0.9rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-2.5 sm:p-3">
      <div class="flex items-center justify-between gap-3">
        <SectionTitle label="Board / Chips" />
      </div>

      <div class="mt-2 grid gap-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <BoardCards table={props.table} />
        <BoardMetricRail
          table={props.table}
          privateView={props.privateView}
        />
      </div>
    </section>
  );
}

function BoardCards(props: { table: PublicTableView }) {
  return (
    <div class="flex min-w-0 justify-center gap-1.5 sm:justify-start sm:gap-2">
      <For each={normalizeBoardCards(props.table.board)}>
        {(card) => <PlayingCard card={card} size="board" />}
      </For>
    </div>
  );
}

function BoardMetricRail(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <div class="min-w-0 rounded-[0.7rem] bg-[rgba(238,246,255,0.035)] px-2.5 py-2 font-data leading-none sm:px-3 md:contents lg:block lg:rounded-[0.7rem] lg:bg-[rgba(238,246,255,0.035)] lg:px-3 lg:py-2">
      <div class="grid min-w-0 gap-2 md:rounded-[0.7rem] md:bg-[rgba(238,246,255,0.035)] md:px-3 md:py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:rounded-none lg:bg-transparent lg:p-0">
        <PotDisplay table={props.table} />
        <div class="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:max-w-[17rem] sm:justify-end">
          <BoardStatePill label={formatStreetLabel(props.table.street)} />
          <BoardStatePill
            label={
              props.table.actingSeat === null
                ? "No action"
                : `Acting ${formatSeatLabel(props.table.actingSeat)}`
            }
            tone={props.table.actingSeat === null ? "muted" : "active"}
          />
          <span class="inline-flex min-h-6 items-center rounded-full border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] px-2.5 text-[0.56rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
            Hand #{props.table.handNumber}
          </span>
        </div>
      </div>

      <div class="mt-2 min-h-[2.75rem] border-t border-[rgba(238,246,255,0.07)] pt-2 md:col-span-2 md:mt-0 md:rounded-[0.7rem] md:border-t-0 md:bg-[rgba(238,246,255,0.035)] md:px-3 md:py-2 lg:mt-2 lg:rounded-none lg:border-t lg:border-[rgba(238,246,255,0.07)] lg:bg-transparent lg:px-0 lg:pt-2 lg:pb-0">
        <Show
          when={props.table.showdownSummary}
          fallback={
            <BoardMoneyStats
              table={props.table}
              privateView={props.privateView}
            />
          }
        >
          <TableShowdownSummary table={props.table} />
        </Show>
      </div>
    </div>
  );
}

function BoardMoneyStats(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.62rem] text-[var(--op-muted-300)] sm:gap-x-4">
      <BoardMoneyStat
        label="Bet"
        value={formatTableChipAmount(props.table.currentBet)}
        chip
      />
      <BoardMoneyStat
        label={getCallStatLabel(props.privateView)}
        value={formatCallLabel(props.privateView)}
        chip={formatCallLabel(props.privateView) !== "Check"}
      />
      <Show when={props.privateView?.minBetOrRaiseTo != null}>
        <BoardMoneyStat
          label="Min raise"
          value={formatTableChipAmount(props.privateView!.minBetOrRaiseTo!)}
          chip
        />
      </Show>
    </div>
  );
}

function PotDisplay(props: { table: PublicTableView }) {
  const sidePotLabel =
    props.table.sidePots.length === 0
      ? "Main pot"
      : `${props.table.sidePots.length} side ${props.table.sidePots.length === 1 ? "pot" : "pots"}`;

  return (
    <div class="min-w-0 rounded-[0.65rem] border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.1)] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="rounded-full bg-[rgba(245,158,11,0.16)] px-2 py-1 text-[0.56rem] font-bold uppercase tracking-[0.12em] text-[#facc15]">
          Pot
        </span>
        <span class="truncate text-[0.56rem] uppercase tracking-[0.1em] text-[rgba(254,243,199,0.72)]">
          {sidePotLabel}
        </span>
      </div>
      <ChipValue
        class="mt-1 justify-start text-base sm:text-lg"
        value={formatPotLabel(props.table)}
        visible
      />
    </div>
  );
}

function BoardStatePill(props: { label: string; tone?: "active" | "muted" }) {
  return (
    <span
      class={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] ${
        props.tone === "active"
          ? "border-[rgba(96,165,250,0.38)] bg-[rgba(96,165,250,0.14)] text-[var(--op-accent-300)]"
          : props.tone === "muted"
            ? "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] text-[var(--op-muted-400)]"
            : "border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.06)] text-[var(--op-cream-100)]"
      }`}
    >
      {props.label}
    </span>
  );
}

function BoardMoneyStat(props: {
  label: string;
  value: string;
  chip?: boolean;
}) {
  return (
    <span class="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span class="text-[0.55rem] uppercase tracking-[0.1em] text-[var(--op-muted-500)]">
        {props.label}
      </span>
      <ChipValue
        class="justify-start text-[0.66rem]"
        value={props.value}
        visible={props.chip}
      />
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
