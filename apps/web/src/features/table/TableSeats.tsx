import type {
  LobbyRoomView,
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableCardCode,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import {
  ChipValue,
  PlayingCard,
  SectionTitle,
  Tag,
} from "./table-primitives";
import {
  formatSeatLabel,
  formatTableChipAmount,
  getSeatBadges,
  getSeatDisplayName,
  getVisibleHoleCards,
} from "./table-utils";

export function SeatGrid(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
  claimingSeatId: number | null;
  leavingSeatId: number | null;
  selectedSeatId: number | null;
  onLeaveSeat: () => void;
  onSelectSeat: (seatId: number) => void;
}) {
  return (
    <section class="rounded-[0.9rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.5)] p-2.5 sm:p-3">
      <SectionTitle label="Seats" />
      <div class="mt-2 grid grid-cols-3 gap-2 xl:grid-cols-6">
        <For each={props.table.seats}>
          {(seat) => (
            <SeatCard
              claimingSeatId={props.claimingSeatId}
              isSelected={props.selectedSeatId === seat.seatId}
              leavingSeatId={props.leavingSeatId}
              onLeaveSeat={props.onLeaveSeat}
              onSelectSeat={props.onSelectSeat}
              seat={seat}
              table={props.table}
              privateView={props.privateView}
            />
          )}
        </For>
      </div>
    </section>
  );
}

function SeatCard(props: {
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
  const cards = createMemo(() =>
    getVisibleHoleCards(props.privateView, props.seat),
  );
  const isHero = createMemo(
    () => props.privateView?.seatId === props.seat.seatId,
  );
  const isActing = createMemo(
    () => props.table.actingSeat === props.seat.seatId,
  );
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
  const shouldShowCardBacks = createMemo(
    () =>
      !isHero() &&
      props.seat.isOccupied &&
      !props.seat.hasFolded &&
      props.table.handStatus !== "waiting" &&
      props.table.street !== "idle",
  );
  const displayedCards = createMemo<
    [TableCardCode | null, TableCardCode | null] | null
  >(() => cards() ?? (shouldShowCardBacks() ? [null, null] : null));

  return (
    <article
      class={`relative min-h-32 rounded-[0.8rem] border p-2 sm:min-h-36 xl:min-h-0 ${getSeatCardClass(isHero(), isActing())}`}
    >
      <div class="flex min-h-10 items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <p class="font-data text-[0.55rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
              {formatSeatLabel(props.seat.seatId)}
            </p>
          </div>
          <div class="mt-0.5 flex min-h-4 min-w-0 items-center gap-1.5">
            <h2 class="truncate text-[0.82rem] font-semibold leading-none text-[var(--op-cream-100)]">
              {getSeatDisplayName(props.seat)}
            </h2>
            <Show when={isHero()}>
              <span class="inline-flex h-4 shrink-0 items-center rounded-full border border-[rgba(74,222,128,0.52)] bg-[rgba(34,197,94,0.16)] px-1.5 font-data text-[0.48rem] font-bold uppercase leading-none text-[#86efac]">
                Me
              </span>
            </Show>
          </div>
        </div>
        <div class="flex shrink-0 items-start gap-1.5">
          <Show when={displayedCards()}>
            {(seatCards) => (
              <div class="flex gap-1">
                <PlayingCard card={seatCards()[0]} compact />
                <PlayingCard card={seatCards()[1]} compact />
              </div>
            )}
          </Show>
        </div>
      </div>

      <div class="mt-2 grid gap-1 font-data text-[0.62rem] text-[var(--op-muted-300)] sm:gap-1.5 xl:grid-cols-3 xl:gap-1">
        <SeatStat
          label="Stack"
          value={
            props.seat.isOccupied
              ? formatTableChipAmount(props.seat.stack)
              : "Open"
          }
          chip={props.seat.isOccupied}
        />
        <SeatStat
          label="Bet"
          value={formatTableChipAmount(props.seat.committed)}
          chip
        />
        <SeatStat
          label="Total"
          value={formatTableChipAmount(props.seat.totalCommitted)}
          chip
        />
      </div>

      <div class="mt-2 flex min-h-5 flex-wrap gap-1 overflow-hidden">
        <Show when={isActing()}>
          <Tag label="Acting" tone="active" />
        </Show>
        <Show when={!isHero() && props.seat.revealedHoleCards}>
          <Tag label="Revealed" />
        </Show>
        <For each={badges()}>{(badge) => <Tag label={badge} />}</For>
      </div>

      <Show when={shouldShowSitButton()}>
        <button
          class={`op-button mt-2 min-h-8 w-full px-2 py-1 text-[0.58rem] xl:min-h-7 ${
            props.isSelected ? "op-button-primary" : "op-button-secondary"
          }`}
          type="button"
          disabled={!canSelectSeat()}
          onClick={() => props.onSelectSeat(props.seat.seatId)}
        >
          Sit
        </button>
      </Show>
      <Show when={isHero()}>
        <button
          class="absolute bottom-2 right-2 grid size-5 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(4,9,21,0.58)] text-[var(--op-muted-300)] transition hover:border-[rgba(199,72,60,0.48)] hover:bg-[rgba(199,72,60,0.14)] hover:text-[#ffd7d3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-red-500)] disabled:cursor-not-allowed disabled:opacity-55"
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
    <div class="flex min-w-0 items-center justify-between gap-2 xl:block">
      <span class="text-[var(--op-muted-500)] xl:block xl:text-[0.48rem] xl:uppercase xl:tracking-[0.08em]">
        {props.label}
      </span>
      <ChipValue
        class="xl:mt-1 xl:justify-start xl:text-[0.62rem]"
        value={props.value}
        visible={props.chip}
      />
    </div>
  );
}

export function ClaimSeatDialog(props: {
  buyInDraft: string;
  claimError: string | null;
  displayNameDraft: string;
  isClaiming: boolean;
  room: LobbyRoomView | null;
  seat: PublicSeatView;
  onBuyInInput: (value: string) => void;
  onCancel: () => void;
  onClaim: () => void;
  onDisplayNameInput: (value: string) => void;
}) {
  return (
    <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(4,9,21,0.72)] px-3 pb-6 pt-[calc(env(safe-area-inset-top)+4.5rem)] backdrop-blur-sm sm:items-center sm:px-6 sm:py-8">
      <section
        aria-labelledby="claim-seat-title"
        aria-modal="true"
        class="w-full max-w-[34rem] rounded-[1rem] border border-[rgba(96,165,250,0.22)] bg-[rgba(13,30,51,0.96)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-4"
        role="dialog"
      >
        <form
          class="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            props.onClaim();
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div id="claim-seat-title" class="min-w-0">
              <SectionTitle
                label={`Claim ${formatSeatLabel(props.seat.seatId)}`}
              />
              <Show when={props.room}>
                {(room) => (
                  <p class="mt-2 font-data text-[0.68rem] text-[var(--op-muted-500)]">
                    Range {formatTableChipAmount(room().minBuyIn)} -{" "}
                    {formatTableChipAmount(room().maxBuyIn)}
                  </p>
                )}
              </Show>
            </div>

            <button
              class="op-button op-button-secondary min-h-9 px-3 text-[0.6rem]"
              type="button"
              disabled={props.isClaiming}
              onClick={props.onCancel}
            >
              Cancel
            </button>
          </div>

          <label class="grid gap-1">
            <span class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
              Name
            </span>
            <input
              class="min-h-11 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
              value={props.displayNameDraft}
              disabled={props.isClaiming}
              onInput={(event) =>
                props.onDisplayNameInput(event.currentTarget.value)
              }
            />
          </label>

          <label class="grid gap-1">
            <span class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
              Buy-in $
            </span>
            <input
              class="min-h-11 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
              type="number"
              inputmode="decimal"
              min={props.room ? props.room.minBuyIn / 100 : undefined}
              max={props.room ? props.room.maxBuyIn / 100 : undefined}
              step="1"
              value={props.buyInDraft}
              disabled={props.isClaiming}
              onInput={(event) => props.onBuyInInput(event.currentTarget.value)}
            />
          </label>

          <Show when={props.claimError}>
            {(error) => (
              <p class="font-data text-xs text-[var(--op-red-500)]">
                {error()}
              </p>
            )}
          </Show>

          <button
            class="op-button op-button-primary min-h-11 w-full px-3"
            type="submit"
            disabled={props.isClaiming || !props.room}
          >
            {props.isClaiming ? "Claiming" : "Claim"}
          </button>
        </form>
      </section>
    </div>
  );
}

function getSeatCardClass(isHero: boolean, isActing: boolean): string {
  const pulseClass = isActing ? " op-acting-seat-pulse" : "";

  if (isHero) {
    return `border-[rgba(96,165,250,0.42)] bg-[rgba(37,99,235,0.14)]${pulseClass}`;
  }

  if (isActing) {
    return `border-[rgba(96,165,250,0.34)] bg-[rgba(14,165,233,0.12)]${pulseClass}`;
  }

  return "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)]";
}
