import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show } from "solid-js";
import { ChipValue, PlayingCard, SectionTitle } from "./table-primitives";
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

      <div class="mt-2 grid gap-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
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
    <div class="min-w-0 rounded-[0.7rem] bg-[rgba(238,246,255,0.035)] px-2.5 py-2 font-data leading-none sm:px-3">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <BoardStatePill label={formatStreetLabel(props.table.street)} />
          <BoardStatePill
            label={
              props.table.actingSeat === null
                ? "No action"
                : `Acting ${formatSeatLabel(props.table.actingSeat)}`
            }
            tone={props.table.actingSeat === null ? "muted" : "active"}
          />
        </div>
        <span class="shrink-0 text-[0.56rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
          Hand #{props.table.handNumber}
        </span>
      </div>

      <div class="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[rgba(238,246,255,0.07)] pt-2 text-[0.62rem] text-[var(--op-muted-300)] sm:gap-x-4">
        <BoardMoneyStat label="Pot" value={formatPotLabel(props.table)} chip />
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
