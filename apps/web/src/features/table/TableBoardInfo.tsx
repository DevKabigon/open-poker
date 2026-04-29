import type { PrivatePlayerView, PublicTableView } from "@openpoker/protocol";
import { For, Show } from "solid-js";
import { PlayingCard, SectionTitle } from "./table-primitives";
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
        <BoardStat label="Hand" value={`#${props.table.handNumber}`} />
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
