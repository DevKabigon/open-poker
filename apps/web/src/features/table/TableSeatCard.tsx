import type {
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableCardCode,
} from "@openpoker/protocol";
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
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
  seatLifecyclePendingSeatId: number | null;
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
      props.claimingSeatId === null,
  );
  const isLeaving = createMemo(() => props.leavingSeatId === props.seat.seatId);
  const isSeatLifecyclePending = createMemo(
    () => props.seatLifecyclePendingSeatId === props.seat.seatId,
  );
  const shouldShowSitButton = createMemo(
    () => !props.seat.isOccupied && props.privateView === null,
  );
  const shouldShowLeaveButton = createMemo(
    () => isHero() && props.seat.isSittingOut,
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
  const positionBadges = createMemo(() =>
    visibleBadges().filter((badge) => isPositionBadge(badge)),
  );
  const statusBadges = createMemo(() =>
    getVisibleStatusBadges(isActing(), visibleBadges()),
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
  const hasRightPanel = createMemo(() => displayedCards() !== null);

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
          <Show when={props.seat.isOccupied}>
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
            <div class="mt-1 flex min-h-[1.35rem] max-w-full flex-nowrap gap-1 overflow-hidden">
              <For each={positionBadges()}>
                {(badge) => <Tag label={badge} />}
              </For>
            </div>

            <SeatStats seat={props.seat} table={props.table} />
          </Show>
        </div>

        <Show when={!props.seat.isOccupied}>
          <div class="col-span-2 grid min-h-[5.3rem] place-items-center px-2 pb-1 pt-2 sm:min-h-[6.4rem] lg:min-h-[5.5rem] xl:min-h-[6.75rem]">
            <Show
              when={shouldShowSitButton()}
              fallback={
                <span class="select-none rounded-[0.65rem] bg-[rgba(238,246,255,0.026)] px-5 py-2.5 font-data text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[rgba(238,246,255,0.28)] shadow-[inset_0_0_0_1px_rgba(238,246,255,0.035)]">
                  Empty
                </span>
              }
            >
              <button
                class={`op-button min-h-8 px-4 py-1.5 text-[0.58rem] xl:min-h-9 xl:px-5 ${
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
          </div>
        </Show>
        <Show when={props.seat.isOccupied}>
          <div class="col-span-2 mt-1.5 grid min-h-6 grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1.5 overflow-hidden">
            <div class="min-w-0">
              <div class="flex min-w-0 flex-nowrap gap-1 overflow-hidden">
                <For each={statusBadges()}>
                  {(badge) => <Tag label={badge.label} tone={badge.tone} />}
                </For>
              </div>
            </div>
            <div class="grid size-6 place-items-center">
              <Show when={shouldShowLeaveButton()}>
                <button
                  class="grid size-5 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(4,9,21,0.72)] text-[var(--op-muted-300)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition hover:border-[rgba(199,72,60,0.48)] hover:bg-[rgba(199,72,60,0.14)] hover:text-[#ffd7d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-red-500)] disabled:cursor-not-allowed disabled:opacity-55 sm:size-6"
                  type="button"
                  aria-label={isLeaving() ? "Leaving seat" : "Leave seat"}
                  title={isLeaving() ? "Leaving seat" : "Leave seat"}
                  disabled={props.leavingSeatId !== null || isSeatLifecyclePending()}
                  onClick={props.onLeaveSeat}
                >
                  <LeaveSeatIcon />
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </article>
  );
}

const POSITION_BADGES = new Set(["BTN", "SB", "BB"]);
const STATUS_BADGE_PRIORITY = [
  "All in",
  "Folded",
  "Sitting out next",
  "Next hand",
] as const;

interface VisibleStatusBadge {
  label: string;
  tone?: "active";
}

function isPositionBadge(label: string): boolean {
  return POSITION_BADGES.has(label);
}

function getCompactStatusBadgeLabel(label: string): string {
  if (label === "Sitting out") {
    return "Sit out";
  }

  if (label === "Sitting out next") {
    return "Sit out next";
  }

  return label;
}

function getVisibleStatusBadges(
  isActing: boolean,
  visibleBadges: string[],
): VisibleStatusBadge[] {
  if (visibleBadges.includes("Offline")) {
    return [{ label: "Offline" }];
  }

  if (visibleBadges.includes("Sitting out")) {
    return [{ label: "Sit out" }];
  }

  const statusBadges: VisibleStatusBadge[] = [];

  if (isActing) {
    statusBadges.push({ label: "Acting", tone: "active" });
  }

  const secondaryStatus = STATUS_BADGE_PRIORITY.find((label) =>
    visibleBadges.includes(label),
  );

  if (secondaryStatus) {
    statusBadges.push({ label: getCompactStatusBadgeLabel(secondaryStatus) });
  }

  return statusBadges.slice(0, 2);
}

const STACK_SETTLE_DELAY_MS = 1_050;
const STACK_VALUE_UPDATE_MS = 620;
const STACK_FEEDBACK_END_MS = 1_360;

function SeatStats(props: { seat: PublicSeatView; table: PublicTableView }) {
  const displaySettings = useDisplaySettings();
  const [displayedStack, setDisplayedStack] = createSignal(props.seat.stack);
  const [stackDelta, setStackDelta] = createSignal<number | null>(null);
  const [isStackSettling, setIsStackSettling] = createSignal(false);
  let lastActualStack = props.seat.stack;
  let lastAnimationKey: string | null = null;
  let initialized = false;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;

  const positivePayout = createMemo(
    () =>
      props.table.showdownSummary?.payouts.find(
        (payout) => payout.seatId === props.seat.seatId && payout.amount > 0,
      ) ?? null,
  );
  const settlementKey = createMemo(() => {
    const summary = props.table.showdownSummary;

    if (!summary || !positivePayout()) {
      return null;
    }

    return `${summary.handId ?? "hand"}:${summary.handNumber}:${props.seat.seatId}`;
  });

  const clearStackTimers = () => {
    if (startTimer) {
      clearTimeout(startTimer);
    }

    if (updateTimer) {
      clearTimeout(updateTimer);
    }

    if (endTimer) {
      clearTimeout(endTimer);
    }
  };

  createEffect(() => {
    const actualStack = props.seat.stack;

    if (!initialized) {
      initialized = true;
      lastActualStack = actualStack;
      setDisplayedStack(actualStack);
      return;
    }

    if (actualStack === lastActualStack) {
      return;
    }

    const key = settlementKey();
    const didIncrease = actualStack > lastActualStack;
    const animationKey = key === null ? null : `${key}:${lastActualStack}:${actualStack}`;

    if (
      !didIncrease ||
      key === null ||
      animationKey === lastAnimationKey ||
      prefersReducedMotion()
    ) {
      clearStackTimers();
      setDisplayedStack(actualStack);
      setStackDelta(null);
      setIsStackSettling(false);
      lastActualStack = actualStack;
      return;
    }

    const previousStack = lastActualStack;
    const delta = actualStack - previousStack;

    lastAnimationKey = animationKey;
    lastActualStack = actualStack;
    clearStackTimers();
    setDisplayedStack(previousStack);
    setStackDelta(null);
    setIsStackSettling(false);

    startTimer = setTimeout(() => {
      setStackDelta(delta);
      setIsStackSettling(true);

      updateTimer = setTimeout(() => {
        setDisplayedStack(actualStack);
      }, STACK_VALUE_UPDATE_MS);

      endTimer = setTimeout(() => {
        setStackDelta(null);
        setIsStackSettling(false);
      }, STACK_FEEDBACK_END_MS);
    }, STACK_SETTLE_DELAY_MS);
  });

  onCleanup(clearStackTimers);

  return (
    <div class="mt-1.5 grid max-w-[10rem] grid-cols-2 gap-2 font-data text-[0.56rem] text-[var(--op-muted-300)] sm:mt-2 sm:max-w-[11rem] sm:text-[0.62rem] xl:max-w-[12rem] xl:text-[0.66rem]">
      <SeatStat
        label="Stack"
        value={
          props.seat.isOccupied
            ? displaySettings.formatChipAmount(displayedStack())
            : "Open"
        }
        delta={
          stackDelta() === null
            ? null
            : `+${displaySettings.formatChipAmount(stackDelta()!)}`
        }
        isSettling={isStackSettling()}
        chip={props.seat.isOccupied}
      />
      <SeatStat
        label="Bet"
        value={displaySettings.formatChipAmount(props.seat.committed)}
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

function SeatStat(props: {
  label: string;
  value: string;
  chip?: boolean;
  delta?: string | null;
  isSettling?: boolean;
}) {
  return (
    <div class="relative min-w-0">
      <span class="block text-[0.48rem] uppercase leading-none tracking-[0.08em] text-[var(--op-muted-500)] sm:text-[0.52rem] xl:text-[0.54rem]">
        {props.label}
      </span>
      <ChipValue
        class={`mt-0.5 justify-start text-[0.56rem] sm:text-[0.62rem] xl:text-[0.68rem] ${
          props.isSettling ? "op-stack-value-settling" : ""
        }`}
        value={props.value}
        visible={props.chip}
      />
      <Show when={props.delta !== undefined}>
        <span class="op-stack-delta-slot">
          <Show when={props.delta}>
            {(delta) => (
              <span class="op-stack-delta-inline">
                {delta()}
              </span>
            )}
          </Show>
        </span>
      </Show>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
