import type {
  PublicShowdownHandEvaluationView,
  PublicTableView,
  TableHandCategory,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import { ChipValue, PlayingCard } from "./table-primitives";
import { formatSeatLabel, formatTableChipAmount } from "./table-utils";

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

export function TableShowdownSummary(props: { table: PublicTableView }) {
  const summary = createMemo(() => props.table.showdownSummary);
  const payouts = createMemo(() => summary()?.payouts ?? []);
  const totalAwarded = createMemo(() =>
    payouts().reduce((sum, payout) => sum + payout.amount, 0),
  );
  const headline = createMemo(() => {
    const winners = payouts();

    if (winners.length === 0) {
      return "Showdown settled";
    }

    if (winners.length === 1) {
      return `${formatSeatLabel(winners[0]!.seatId)} wins`;
    }

    return "Split pot";
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

  return (
    <Show when={summary()}>
      <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
          <span class="rounded-full border border-[rgba(250,204,21,0.22)] bg-[rgba(250,204,21,0.1)] px-2 py-1 font-data text-[0.56rem] font-bold uppercase tracking-[0.1em] text-[#facc15]">
            Result
          </span>
          <span class="truncate text-sm font-semibold text-[var(--op-cream-100)]">
            {headline()}
          </span>
          <Show when={primaryEvaluation()}>
            {(evaluation) => <HandCategoryPill evaluation={evaluation()} />}
          </Show>
        </div>

        <div class="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
          <Show when={primaryEvaluation()?.bestCards}>
            {(cards) => (
              <div class="hidden min-w-0 gap-1 sm:flex">
                <For each={cards()}>
                  {(card) => <PlayingCard card={card} compact />}
                </For>
              </div>
            )}
          </Show>
          <ChipValue
            class="text-sm sm:text-base"
            value={`+${formatTableChipAmount(totalAwarded())}`}
            visible
          />
        </div>
      </div>
    </Show>
  );
}

function HandCategoryPill(props: {
  evaluation: PublicShowdownHandEvaluationView;
}) {
  const label = createMemo(() =>
    props.evaluation.category === null
      ? "Mucked"
      : HAND_CATEGORY_LABELS[props.evaluation.category],
  );

  return (
    <span
      class={`rounded-full border px-2 py-1 font-data text-[0.56rem] uppercase tracking-[0.1em] ${
        props.evaluation.category === null
          ? "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] text-[var(--op-muted-400)]"
          : "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[var(--op-accent-300)]"
      }`}
    >
      {label()}
    </span>
  );
}
