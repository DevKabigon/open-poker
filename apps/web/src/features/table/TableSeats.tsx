import type {
  LobbyRoomView,
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import { PlayingCard, SectionTitle, Tag, ValueRow } from "./table-primitives";
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
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.5)] p-3 sm:p-4">
      <SectionTitle label="Seats" />
      <div class="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
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
  const seatButtonLabel = createMemo(() => {
    if (props.claimingSeatId === props.seat.seatId) {
      return "Claiming";
    }

    if (props.privateView !== null) {
      return "Seated";
    }

    return props.isSelected ? "Selected" : "Sit";
  });
  const isLeaving = createMemo(() => props.leavingSeatId === props.seat.seatId);

  return (
    <article
      class={`min-h-36 rounded-[0.9rem] border p-2 sm:min-h-40 sm:p-3 ${getSeatCardClass(isHero(), isActing())}`}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
            {formatSeatLabel(props.seat.seatId)}
          </p>
          <h2 class="mt-1 truncate text-sm font-semibold text-[var(--op-cream-100)]">
            {getSeatDisplayName(props.seat)}
          </h2>
        </div>
        <Show when={isHero()}>
          <span class="rounded-full border border-[rgba(96,165,250,0.35)] px-2 py-1 font-data text-[0.52rem] font-bold uppercase text-[var(--op-accent-300)]">
            You
          </span>
        </Show>
      </div>

      <div class="mt-3 grid gap-1.5 font-data text-[0.64rem] text-[var(--op-muted-300)]">
        <ValueRow
          label="Stack"
          value={
            props.seat.isOccupied
              ? formatTableChipAmount(props.seat.stack)
              : "Open"
          }
          chip={props.seat.isOccupied}
        />
        <ValueRow
          label="Bet"
          value={formatTableChipAmount(props.seat.committed)}
          chip
        />
        <ValueRow
          label="Total"
          value={formatTableChipAmount(props.seat.totalCommitted)}
          chip
        />
      </div>

      <Show when={cards()}>
        {(visibleCards) => (
          <div class="mt-3 flex gap-1.5">
            <PlayingCard card={visibleCards()[0]} compact />
            <PlayingCard card={visibleCards()[1]} compact />
          </div>
        )}
      </Show>

      <div class="mt-3 flex flex-wrap gap-1">
        <Show when={isActing()}>
          <Tag label="Acting" tone="active" />
        </Show>
        <For each={badges()}>{(badge) => <Tag label={badge} />}</For>
      </div>

      <Show when={!props.seat.isOccupied}>
        <button
          class={`op-button mt-3 min-h-8 w-full px-2 py-1 text-[0.58rem] ${
            props.isSelected ? "op-button-primary" : "op-button-secondary"
          }`}
          type="button"
          disabled={!canSelectSeat()}
          onClick={() => props.onSelectSeat(props.seat.seatId)}
        >
          {seatButtonLabel()}
        </button>
      </Show>
      <Show when={isHero()}>
        <button
          class="op-button op-button-secondary mt-3 min-h-8 w-full px-2 py-1 text-[0.58rem]"
          type="button"
          disabled={props.leavingSeatId !== null}
          onClick={props.onLeaveSeat}
        >
          {isLeaving() ? "Leaving" : "Leave seat"}
        </button>
      </Show>
    </article>
  );
}

export function ClaimSeatPanel(props: {
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
    <section class="rounded-[1rem] border border-[rgba(96,165,250,0.22)] bg-[rgba(13,30,51,0.72)] p-3 sm:p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div class="min-w-0">
          <SectionTitle label={`Claim ${formatSeatLabel(props.seat.seatId)}`} />
          <Show when={props.room}>
            {(room) => (
              <p class="mt-2 font-data text-[0.68rem] text-[var(--op-muted-500)]">
                Range {formatTableChipAmount(room().minBuyIn)} -{" "}
                {formatTableChipAmount(room().maxBuyIn)}
              </p>
            )}
          </Show>
        </div>

        <div class="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_auto_auto] sm:items-end lg:min-w-[34rem]">
          <label class="grid gap-1">
            <span class="font-data text-[0.55rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
              Name
            </span>
            <input
              class="min-h-10 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
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
              class="min-h-10 rounded-[0.75rem] border border-[rgba(238,246,255,0.1)] bg-[rgba(4,9,21,0.5)] px-3 font-data text-sm text-[var(--op-cream-100)] outline-none focus:border-[rgba(96,165,250,0.45)]"
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

          <button
            class="op-button op-button-primary min-h-10 px-3"
            type="button"
            disabled={props.isClaiming || !props.room}
            onClick={props.onClaim}
          >
            {props.isClaiming ? "Claiming" : "Claim"}
          </button>

          <button
            class="op-button op-button-secondary min-h-10 px-3"
            type="button"
            disabled={props.isClaiming}
            onClick={props.onCancel}
          >
            Cancel
          </button>
        </div>
      </div>

      <Show when={props.claimError}>
        {(error) => (
          <p class="mt-3 font-data text-xs text-[var(--op-red-500)]">
            {error()}
          </p>
        )}
      </Show>
    </section>
  );
}

function getSeatCardClass(isHero: boolean, isActing: boolean): string {
  if (isHero) {
    return "border-[rgba(96,165,250,0.42)] bg-[rgba(37,99,235,0.14)]";
  }

  if (isActing) {
    return "border-[rgba(96,165,250,0.34)] bg-[rgba(14,165,233,0.12)]";
  }

  return "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)]";
}
