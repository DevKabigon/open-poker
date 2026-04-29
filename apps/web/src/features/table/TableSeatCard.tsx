import type {
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableCardCode,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import { useDisplaySettings } from "../settings/display-settings";
import { ChipValue, PlayingCard, Tag } from "./table-primitives";
import {
  formatSeatLabel,
  getSeatDisplayHoleCards,
  getSeatHoleCardStatus,
  getSeatBadges,
  getSeatDisplayName,
  isSeatForcedShowdownReveal,
  isSeatShowdownWinner,
} from "./table-utils";

export function SeatCard(props: {
  claimingSeatId: number | null;
  isSelected: boolean;
  leavingSeatId: number | null;
  onLeaveSeat: () => void;
  onSelectSeat: (seatId: number) => void;
  seat: PublicSeatView;
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  const badges = createMemo(() => getSeatBadges(props.table, props.seat));
  const isHero = createMemo(
    () => props.privateView?.seatId === props.seat.seatId,
  );
  const isActing = createMemo(
    () => props.table.actingSeat === props.seat.seatId,
  );
  const holeCardStatus = createMemo(() =>
    getSeatHoleCardStatus(props.table, props.seat),
  );
  const isForcedShowdownReveal = createMemo(() =>
    isSeatForcedShowdownReveal(props.table, props.seat),
  );
  const isWinner = createMemo(() => isSeatShowdownWinner(props.table, props.seat));
  const canSelectSeat = createMemo(
    () =>
      props.privateView === null &&
      !props.seat.isOccupied &&
      props.claimingSeatId === null &&
      props.table.handStatus !== "in-hand" &&
      props.table.handStatus !== "showdown",
  );
  const isLeaving = createMemo(() => props.leavingSeatId === props.seat.seatId);
  const shouldShowSitButton = createMemo(
    () => !props.seat.isOccupied && props.privateView === null,
  );
  const displayedCards = createMemo<
    [TableCardCode | null, TableCardCode | null] | null
  >(() =>
    getSeatDisplayHoleCards(props.table, props.privateView, props.seat),
  );
  const cardStatusLabel = createMemo(() => {
    return holeCardStatus() === "mucked"
      ? "Mucked"
      : holeCardStatus() === "revealed"
        ? "Revealed"
        : holeCardStatus() === "folded"
          ? "Folded"
          : null;
  });
  const visibleBadges = createMemo(() =>
    cardStatusLabel() === "Folded"
      ? badges().filter((badge) => badge !== "Folded")
      : badges(),
  );
  const hasStatusTags = createMemo(
    () => isActing() || visibleBadges().length > 0,
  );
  const cardStatusClass = createMemo(() => {
    if (holeCardStatus() === "mucked") {
      return "border-[rgba(199,72,60,0.3)] bg-[rgba(199,72,60,0.12)] text-[#ffd7d3]";
    }

    if (holeCardStatus() === "folded") {
      return "border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.05)] text-[var(--op-muted-300)]";
    }

    return "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[var(--op-accent-300)]";
  });
  const cardMotionClass = createMemo(() =>
    holeCardStatus() === "revealed" && !isForcedShowdownReveal()
      ? "op-showdown-card-show"
      : "",
  );
  const hasRightPanel = createMemo(
    () => displayedCards() !== null || shouldShowSitButton(),
  );

  return (
    <article
      class={`relative min-h-[7.75rem] rounded-[0.8rem] border p-2 sm:min-h-36 lg:min-h-[8rem] xl:min-h-[9rem] ${getSeatCardClass(isHero(), isActing(), isWinner())}`}
    >
      <Show when={isWinner()}>
        <span class="op-winning-seat-pulse" aria-hidden="true" />
      </Show>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 sm:gap-2 xl:gap-3">
        <div class="min-w-0 self-stretch">
          <div class="flex min-w-0 items-center gap-1.5">
            <p class="font-data text-[0.55rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
              {formatSeatLabel(props.seat.seatId)}
            </p>
          </div>
          <div class="mt-0.5 flex min-h-4 min-w-0 items-center gap-1.5">
            <h2 class="truncate text-[0.8rem] font-semibold leading-none text-[var(--op-cream-100)] sm:text-[0.84rem] xl:text-[0.95rem]">
              {getSeatDisplayName(props.seat)}
            </h2>
            <Show when={isHero()}>
              <span class="inline-flex h-4 shrink-0 items-center rounded-full border border-[rgba(74,222,128,0.52)] bg-[rgba(34,197,94,0.16)] px-1.5 font-data text-[0.48rem] font-bold uppercase leading-none text-[#86efac]">
                Me
              </span>
            </Show>
            <Show when={isWinner()}>
              <span class="inline-flex h-4 shrink-0 items-center rounded-full border border-[rgba(250,204,21,0.44)] bg-[rgba(250,204,21,0.14)] px-1.5 font-data text-[0.48rem] font-bold uppercase leading-none text-[#fde68a]">
                Win
              </span>
            </Show>
          </div>

          <SeatStats seat={props.seat} />

          <Show when={hasStatusTags()}>
            <div class="mt-2 flex flex-wrap gap-1 overflow-hidden">
              <Show when={isActing()}>
                <Tag label="Acting" tone="active" />
              </Show>
              <For each={visibleBadges()}>
                {(badge) => <Tag label={badge} />}
              </For>
            </div>
          </Show>
        </div>

        <Show when={hasRightPanel()}>
          <div class="flex min-w-[3.35rem] shrink-0 flex-col items-end justify-start gap-1 sm:min-w-[4.7rem] sm:gap-1.5 lg:min-w-[7rem] xl:min-w-[9.5rem] xl:flex-row xl:items-start xl:justify-end xl:gap-2.5">
            <Show when={displayedCards()}>
              {(seatCards) => (
                <div class="flex flex-col items-center gap-1">
                  <div
                    class={`flex gap-0.5 sm:gap-1.5 xl:gap-2 ${cardMotionClass()}`}
                  >
                    <PlayingCard card={seatCards()[0]} size="seat" />
                    <PlayingCard card={seatCards()[1]} size="seat" />
                  </div>
                  <Show when={cardStatusLabel()}>
                    <span
                      class={`inline-flex min-h-5 items-center rounded-full border px-2 font-data text-[0.5rem] font-bold uppercase tracking-[0.1em] ${cardStatusClass()}`}
                    >
                      {cardStatusLabel()}
                    </span>
                  </Show>
                </div>
              )}
            </Show>
            <Show when={shouldShowSitButton()}>
              <button
                class={`op-button min-h-7 px-2 py-1 text-[0.56rem] sm:min-h-8 sm:text-[0.58rem] xl:min-h-9 xl:px-3 ${
                  props.isSelected ? "op-button-primary" : "op-button-secondary"
                }`}
                type="button"
                disabled={!canSelectSeat()}
                onClick={() => props.onSelectSeat(props.seat.seatId)}
              >
                Sit
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <Show when={isHero()}>
        <button
          class="absolute bottom-2 right-2 grid size-5 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(4,9,21,0.72)] text-[var(--op-muted-300)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition hover:border-[rgba(199,72,60,0.48)] hover:bg-[rgba(199,72,60,0.14)] hover:text-[#ffd7d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-red-500)] disabled:cursor-not-allowed disabled:opacity-55 sm:size-6"
          type="button"
          aria-label={isLeaving() ? "Leaving seat" : "Leave seat"}
          title={isLeaving() ? "Leaving seat" : "Leave seat"}
          disabled={props.leavingSeatId !== null}
          onClick={props.onLeaveSeat}
        >
          <LeaveSeatIcon />
        </button>
      </Show>
    </article>
  );
}

function SeatStats(props: { seat: PublicSeatView }) {
  const displaySettings = useDisplaySettings();

  return (
    <div class="mt-1.5 grid max-w-[8rem] gap-1 font-data text-[0.56rem] text-[var(--op-muted-300)] sm:mt-2 sm:max-w-[10rem] sm:text-[0.62rem] xl:max-w-[11rem] xl:text-[0.66rem]">
      <SeatStat
        label="Stack"
        value={
          props.seat.isOccupied
            ? displaySettings.formatChipAmount(props.seat.stack)
            : "Open"
        }
        chip={props.seat.isOccupied}
      />
      <SeatStat
        label="Bet"
        value={displaySettings.formatChipAmount(props.seat.committed)}
        chip
      />
      <SeatStat
        label="Total"
        value={displaySettings.formatChipAmount(props.seat.totalCommitted)}
        chip
      />
    </div>
  );
}

function LeaveSeatIcon() {
  return (
    <svg
      class="size-3"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function SeatStat(props: { label: string; value: string; chip?: boolean }) {
  return (
    <div class="min-w-0">
      <span class="block text-[0.48rem] uppercase leading-none tracking-[0.08em] text-[var(--op-muted-500)] sm:text-[0.52rem] xl:text-[0.54rem]">
        {props.label}
      </span>
      <ChipValue
        class="mt-0.5 justify-start text-[0.56rem] sm:text-[0.62rem] xl:text-[0.68rem]"
        value={props.value}
        visible={props.chip}
      />
    </div>
  );
}

function getSeatCardClass(
  isHero: boolean,
  isActing: boolean,
  isWinner: boolean,
): string {
  if (isWinner) {
    return "border-[rgba(250,204,21,0.46)] bg-[rgba(113,63,18,0.2)]";
  }

  const pulseClass = isActing ? " op-acting-seat-pulse" : "";

  if (isHero) {
    return `border-[rgba(96,165,250,0.42)] bg-[rgba(37,99,235,0.14)]${pulseClass}`;
  }

  if (isActing) {
    return `border-[rgba(96,165,250,0.34)] bg-[rgba(14,165,233,0.12)]${pulseClass}`;
  }

  return "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)]";
}
