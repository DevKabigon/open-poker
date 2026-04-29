import type {
  PublicShowdownHandEvaluationView,
  PublicTableView,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import { useDisplaySettings } from "../settings/display-settings";
import { ChipValue, PlayingCard } from "./table-primitives";
import {
  formatSeatLabel,
  formatShowdownHandLabel,
  getSeatDisplayName,
  isBoardOnlyBestHand,
} from "./table-utils";

export function TableShowdownSummary(props: { table: PublicTableView }) {
  const displaySettings = useDisplaySettings();
  const summary = createMemo(() => props.table.showdownSummary);
  const payouts = createMemo(() => summary()?.payouts ?? []);
  const netPayouts = createMemo(() => summary()?.netPayouts ?? []);
  const isUncontested = createMemo(
    () => (summary()?.handEvaluations.length ?? 0) === 0,
  );
  const foldedPlayers = createMemo(() =>
    props.table.seats.filter((seat) => seat.hasFolded && seat.isOccupied),
  );
  const totalAwarded = createMemo(() =>
    payouts().reduce((sum, payout) => sum + payout.amount, 0),
  );
  const totalNetWon = createMemo(() => {
    const netEntries = netPayouts();

    if (netEntries.length === 0) {
      return totalAwarded();
    }

    return netEntries
      .filter((payout) => payout.amount > 0)
      .reduce((sum, payout) => sum + payout.amount, 0);
  });
  const primaryEvaluation = createMemo(() => {
    const primaryWinner = [...payouts()].sort(
      (left, right) => right.amount - left.amount,
    )[0];

    if (!primaryWinner) {
      return null;
    }

    return (
      summary()?.handEvaluations.find(
        (evaluation) => evaluation.seatId === primaryWinner.seatId,
      ) ?? null
    );
  });
  const isBoardChop = createMemo(() => {
    const winners = payouts();
    const evaluations = summary()?.handEvaluations ?? [];

    return (
      winners.length > 1 &&
      winners.every((winner) => {
        const evaluation = evaluations.find(
          (entry) => entry.seatId === winner.seatId,
        );

        return isBoardOnlyBestHand(
          props.table.board,
          evaluation?.bestCards ?? null,
        );
      })
    );
  });
  const headline = createMemo(() => {
    const winners = payouts();

    if (winners.length === 0) {
      return "Showdown settled";
    }

    if (isBoardChop()) {
      return "Board chop";
    }

    if (winners.length === 1) {
      return `${getPlayerLabel(props.table, winners[0]!.seatId)} wins`;
    }

    return `${formatWinnerList(props.table, winners.map((winner) => winner.seatId))} split`;
  });

  return (
    <Show when={summary()}>
      <div class="op-result-glow-border">
        <div class="op-result-glow-border__inner flex min-w-0 flex-wrap items-center gap-1.5">
          <span class="rounded-full border border-[rgba(250,204,21,0.22)] bg-[rgba(250,204,21,0.1)] px-2 py-1 font-data text-[0.56rem] font-bold uppercase tracking-[0.1em] text-[#facc15]">
            Result
          </span>
          <span class="truncate text-sm font-semibold text-[var(--op-cream-100)]">
            {headline()}
          </span>
          <Show when={primaryEvaluation()?.bestCards}>
            {(cards) => (
              <div class="flex min-w-0 gap-1">
                <For each={cards()}>
                  {(card) => <PlayingCard card={card} compact />}
                </For>
              </div>
            )}
          </Show>
          <Show when={primaryEvaluation()}>
            {(evaluation) => (
              <HandCategoryPill evaluation={evaluation()} table={props.table} />
            )}
          </Show>
          <Show when={isUncontested() && foldedPlayers().length > 0}>
            <FoldedPlayersPill table={props.table} />
          </Show>
          <ChipValue
            class="text-sm sm:text-base"
            value={`+${displaySettings.formatChipAmount(totalNetWon())}`}
            visible
          />
        </div>
      </div>
    </Show>
  );
}

function FoldedPlayersPill(props: { table: PublicTableView }) {
  const label = createMemo(() => {
    const foldedLabels = props.table.seats
      .filter((seat) => seat.hasFolded && seat.isOccupied)
      .map(getSeatDisplayName);

    if (foldedLabels.length === 0) {
      return "";
    }

    return `Folded: ${formatWinnerListLabels(foldedLabels)}`;
  });

  return (
    <span class="min-w-0 rounded-full border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] px-2 py-1 font-data text-[0.6rem] leading-none text-[var(--op-muted-300)]">
      {label()}
    </span>
  );
}

function HandCategoryPill(props: {
  evaluation: PublicShowdownHandEvaluationView;
  table: PublicTableView;
}) {
  const label = createMemo(() =>
    formatShowdownHandLabel(
      props.evaluation.category,
      props.evaluation.bestCards,
      getRevealedHoleCards(props.table, props.evaluation.seatId),
    ),
  );

  return (
    <span
      class={`rounded-full border px-2 py-1 font-data text-[0.6rem] leading-none ${
        props.evaluation.category === null
          ? "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] text-[var(--op-muted-400)]"
          : "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[var(--op-accent-300)]"
      }`}
    >
      {label()}
    </span>
  );
}

function getPlayerLabel(table: PublicTableView, seatId: number): string {
  const seat = table.seats.find((entry) => entry.seatId === seatId);

  return seat ? getSeatDisplayName(seat) : formatSeatLabel(seatId);
}

function getRevealedHoleCards(table: PublicTableView, seatId: number) {
  return table.seats.find((seat) => seat.seatId === seatId)?.revealedHoleCards ?? null;
}

function formatWinnerList(table: PublicTableView, seatIds: number[]): string {
  const labels = seatIds.map((seatId) => getPlayerLabel(table, seatId));

  return formatWinnerListLabels(labels);
}

function formatWinnerListLabels(labels: string[]): string {
  if (labels.length === 0) {
    return "Players";
  }

  if (labels.length === 1) {
    return labels[0]!;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
