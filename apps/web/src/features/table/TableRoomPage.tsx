import type {
  LobbyRoomView,
  PrivatePlayerView,
  PublicSeatView,
  PublicTableView,
  TableCardCode,
} from "@openpoker/protocol";
import { For, Show, createMemo } from "solid-js";
import { formatBlindLabel, formatBuyInRange } from "../lobby/lobby-utils";
import {
  CARD_BACK_ASSET_PATH,
  CHIP_ASSET_PATH,
  DEALER_BUTTON_ASSET_PATH,
  getCardAssetPath,
} from "./table-assets";
import { createTableSkeletonSnapshot } from "./table-fixtures";
import {
  formatActionLabel,
  formatHandStatusLabel,
  formatPotLabel,
  formatSeatLabel,
  formatStreetLabel,
  formatTableChipAmount,
  getSeatBadges,
  getSeatDisplayName,
  getVisibleHoleCards,
  normalizeBoardCards,
} from "./table-utils";

export interface TableRoomPageProps {
  roomId: string;
  room: LobbyRoomView | null;
  onBackToLobby: () => void;
}

export function TableRoomPage(props: TableRoomPageProps) {
  const snapshot = createMemo(() =>
    createTableSkeletonSnapshot(props.roomId, props.room?.roomVersion ?? 0),
  );
  const table = createMemo(() => snapshot().table);
  const privateView = createMemo(() => snapshot().privateView);
  const roomTitle = createMemo(() => props.room?.displayName ?? props.roomId);
  const blindLabel = createMemo(() =>
    props.room
      ? formatBlindLabel(props.room.smallBlind, props.room.bigBlind)
      : "NLH",
  );
  const buyInLabel = createMemo(() =>
    props.room ? formatBuyInRange(props.room) : "Buy-in pending",
  );

  return (
    <main class="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-3 pb-5 pt-3 sm:px-6 lg:px-8">
      <RoomHeader
        blindLabel={blindLabel()}
        buyInLabel={buyInLabel()}
        roomTitle={roomTitle()}
        table={table()}
        onBackToLobby={props.onBackToLobby}
      />

      <BoardInfo table={table()} privateView={privateView()} />
      <SeatGrid table={table()} privateView={privateView()} />
      <BetInfo table={table()} privateView={privateView()} />
    </main>
  );
}

function RoomHeader(props: {
  blindLabel: string;
  buyInLabel: string;
  roomTitle: string;
  table: PublicTableView;
  onBackToLobby: () => void;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.62)] p-3 sm:p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
            {props.blindLabel} · {formatHandStatusLabel(props.table.handStatus)}{" "}
            · Sync v{props.table.roomVersion}
          </p>
          <h1 class="mt-1 truncate font-display text-xl font-semibold tracking-[-0.03em] text-[var(--op-cream-100)]">
            {props.roomTitle}
          </h1>
          <p class="mt-1 font-data text-[0.68rem] text-[var(--op-muted-300)]">
            {props.buyInLabel}
          </p>
        </div>
        <button
          class="op-button op-button-secondary shrink-0 px-3"
          type="button"
          onClick={props.onBackToLobby}
        >
          Lobby
        </button>
      </div>
    </section>
  );
}

function BoardInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-3 sm:p-4">
      <SectionTitle label="Board" />
      <div class="mt-3 grid gap-3 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div class="flex gap-2">
          <For each={normalizeBoardCards(props.table.board)}>
            {(card) => <PlayingCard card={card} />}
          </For>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric
            label="Street"
            value={formatStreetLabel(props.table.street)}
          />
          <Metric
            label="Status"
            value={formatHandStatusLabel(props.table.handStatus)}
          />
          <Metric label="Hand" value={String(props.table.handNumber)} />
          <Metric
            label="Acting"
            value={
              props.table.actingSeat === null
                ? "-"
                : formatSeatLabel(props.table.actingSeat)
            }
          />
        </div>
      </div>
    </section>
  );
}

function SeatGrid(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.5)] p-3 sm:p-4">
      <SectionTitle label="Seats" />
      <div class="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        <For each={props.table.seats}>
          {(seat) => (
            <SeatCard
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
    </article>
  );
}

function BetInfo(props: {
  table: PublicTableView;
  privateView: PrivatePlayerView | null;
}) {
  return (
    <section class="rounded-[1rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(13,30,51,0.72)] p-3 sm:p-4">
      <SectionTitle label="Chips / Bet" />
      <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Pot" value={formatPotLabel(props.table)} chip />
        <Metric
          label="Main"
          value={formatTableChipAmount(props.table.mainPot)}
          chip
        />
        <Metric
          label="Current bet"
          value={formatTableChipAmount(props.table.currentBet)}
          chip
        />
        <Metric label="Side pots" value={String(props.table.sidePots.length)} />
        <Metric
          label="Call"
          value={formatTableChipAmount(props.privateView?.callAmount ?? 0)}
          chip
        />
        <Metric
          label="Min raise"
          value={formatNullableChipAmount(
            props.privateView?.minBetOrRaiseTo ?? null,
          )}
          chip
        />
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <For each={props.privateView?.allowedActions ?? []}>
          {(action) => (
            <Tag
              label={formatActionLabel(action, props.privateView)}
              tone="active"
            />
          )}
        </For>
      </div>
    </section>
  );
}

function SectionTitle(props: { label: string }) {
  return (
    <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-accent-400)]">
      {props.label}
    </p>
  );
}

function Metric(props: { label: string; value: string; chip?: boolean }) {
  return (
    <div class="min-w-0 rounded-[0.75rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.04)] px-2.5 py-2">
      <p class="font-data text-[0.52rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <ChipValue class="mt-1" value={props.value} visible={props.chip} />
    </div>
  );
}

function ValueRow(props: { label: string; value: string; chip?: boolean }) {
  return (
    <div class="flex min-w-0 items-center justify-between gap-2">
      <span class="text-[var(--op-muted-500)]">{props.label}</span>
      <ChipValue value={props.value} visible={props.chip} />
    </div>
  );
}

function Tag(props: { label: string; tone?: "active" }) {
  const isDealer = createMemo(() => props.label === "BTN");

  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-data text-[0.55rem] font-bold uppercase leading-none tracking-[0.06em] ${
        props.tone === "active"
          ? "border-[rgba(96,165,250,0.42)] bg-[rgba(96,165,250,0.14)] text-[var(--op-accent-300)]"
          : "border-[rgba(238,246,255,0.1)] bg-[rgba(238,246,255,0.05)] text-[var(--op-muted-300)]"
      }`}
    >
      <Show when={isDealer()}>
        <img
          class="size-3.5 rounded-full"
          src={DEALER_BUTTON_ASSET_PATH}
          alt=""
          aria-hidden="true"
        />
      </Show>
      {props.label}
    </span>
  );
}

function PlayingCard(props: { card: TableCardCode | null; compact?: boolean }) {
  const assetPath = createMemo(() =>
    props.card ? getCardAssetPath(props.card) : CARD_BACK_ASSET_PATH,
  );
  const sizeClass = createMemo(() =>
    props.compact ? "h-10 w-7" : "h-14 w-10 sm:h-16 sm:w-12",
  );

  return (
    <div
      class={`${sizeClass()} shrink-0 overflow-hidden rounded-[0.45rem] border ${
        props.card
          ? "border-[rgba(238,246,255,0.42)] bg-[var(--op-cream-100)]"
          : "border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.06)] opacity-55"
      }`}
    >
      <Show
        when={assetPath()}
        fallback={
          <div class="grid size-full place-items-center font-data text-[0.6rem] text-[rgba(238,246,255,0.28)]">
            --
          </div>
        }
      >
        {(src) => (
          <img
            class="size-full object-cover"
            src={src()}
            alt={props.card ? `Card ${props.card}` : "Face-down card"}
          />
        )}
      </Show>
    </div>
  );
}

function ChipValue(props: {
  value: string;
  visible?: boolean;
  class?: string;
}) {
  return (
    <span
      class={`flex min-w-0 items-center justify-end gap-1 font-data text-[0.68rem] font-semibold leading-none text-[var(--op-cream-100)] sm:text-xs ${props.class ?? ""}`}
    >
      <Show when={props.visible}>
        <img
          class="size-4 shrink-0"
          src={CHIP_ASSET_PATH}
          alt=""
          aria-hidden="true"
        />
      </Show>
      <span class="truncate">{props.value}</span>
    </span>
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

function formatNullableChipAmount(amount: number | null): string {
  return amount === null ? "-" : formatTableChipAmount(amount);
}
