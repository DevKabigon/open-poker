import type { LobbyRoomView } from "@openpoker/protocol";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";
import {
  type StakeGroup,
  formatBuyInRange,
  formatCompactBuyInRange,
  formatRoomStatus,
  getRoomOccupancyTone,
  groupRoomsByStake,
  summarizeStakeGroup,
} from "./lobby-utils";

export interface LobbyPageProps {
  rooms: LobbyRoomView[];
  isLoading: boolean;
  error: unknown;
  onRefresh: () => void;
  onOpenRoom: (roomId: string) => void;
}

export function LobbyPage(props: LobbyPageProps) {
  const [selectedStakeKey, setSelectedStakeKey] = createSignal<string | null>(
    null,
  );
  const stakeGroups = createMemo(() => groupRoomsByStake(props.rooms));
  const activeGroup = createMemo(() => {
    const groups = stakeGroups();
    const selected = selectedStakeKey();

    return (
      groups.find((group) => group.stakeKey === selected) ?? groups[0] ?? null
    );
  });

  createEffect(() => {
    const groups = stakeGroups();

    if (groups.length === 0) {
      return;
    }

    const selected = selectedStakeKey();

    if (!selected || !groups.some((group) => group.stakeKey === selected)) {
      setSelectedStakeKey(groups[0]!.stakeKey);
    }
  });

  return (
    <main class="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-3 px-3 pb-6 pt-3 sm:gap-5 sm:px-6 sm:pb-8 lg:px-8">
      <Switch>
        <Match when={props.error}>
          <LobbyError error={props.error} onRefresh={props.onRefresh} />
        </Match>

        <Match when={props.isLoading}>
          <LobbyLoading />
        </Match>

        <Match when={stakeGroups().length === 0}>
          <section class="op-panel p-6 text-center">
            <p class="font-data text-xs uppercase tracking-[0.2em] text-[var(--op-muted-300)]">
              No tables
            </p>
            <h2 class="mt-3 font-display text-3xl font-semibold text-[var(--op-cream-100)]">
              No cash tables are available yet.
            </h2>
            <p class="mt-3 text-[var(--op-muted-300)]">
              Refresh the lobby after the Worker catalog is ready.
            </p>
          </section>
        </Match>

        <Match when={activeGroup()}>
          {(group) => (
            <section class="op-panel overflow-hidden">
              <StakeTabs
                groups={stakeGroups()}
                activeStakeKey={group().stakeKey}
                onSelectStake={setSelectedStakeKey}
              />
              <ActiveStakeView group={group()} onOpenRoom={props.onOpenRoom} />
            </section>
          )}
        </Match>
      </Switch>
    </main>
  );
}

function StakeTabs(props: {
  groups: StakeGroup[];
  activeStakeKey: string;
  onSelectStake: (stakeKey: string) => void;
}) {
  return (
    <div class="border-b border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.42)] p-2">
      <div
        class="grid grid-cols-3 gap-2"
        role="tablist"
        aria-label="Cash stakes"
      >
        <For each={props.groups}>
          {(group) => {
            const summary = createMemo(() => summarizeStakeGroup(group));
            const isActive = createMemo(
              () => props.activeStakeKey === group.stakeKey,
            );

            return (
              <button
                class={`rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)] sm:p-4 ${
                  isActive()
                    ? "border-[rgba(96,165,250,0.5)] bg-[rgba(37,99,235,0.16)] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.14)]"
                    : "border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] hover:border-[rgba(96,165,250,0.28)] hover:bg-[rgba(238,246,255,0.055)]"
                }`}
                type="button"
                role="tab"
                aria-selected={isActive()}
                onClick={() => props.onSelectStake(group.stakeKey)}
              >
                <span class="block font-display text-xl font-semibold tracking-[-0.04em] text-[var(--op-cream-100)] sm:text-2xl">
                  {group.compactLabel}
                </span>
                <span class="mt-1 block font-data text-[0.64rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)] sm:text-[0.7rem]">
                  {summary().openTables} open · {summary().occupiedSeats}/
                  {summary().maxSeats}
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function ActiveStakeView(props: {
  group: StakeGroup;
  onOpenRoom: (roomId: string) => void;
}) {
  const summary = createMemo(() => summarizeStakeGroup(props.group));
  const compactBuyInRange = createMemo(() => {
    const firstRoom = props.group.rooms[0];

    return firstRoom ? formatCompactBuyInRange(firstRoom) : "$0-$0";
  });

  return (
    <div class="p-2.5 sm:p-4 lg:p-5">
      <div class="mb-2 overflow-hidden rounded-[1rem] border border-[rgba(96,165,250,0.18)] bg-[linear-gradient(90deg,rgba(37,99,235,0.16),rgba(4,9,21,0.22)_48%,rgba(4,9,21,0.08))] px-2.5 py-2 shadow-[inset_3px_0_0_rgba(96,165,250,0.72)] sm:mb-4 sm:rounded-[1.25rem] sm:px-4 sm:py-3">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="font-data text-[0.54rem] uppercase leading-none tracking-[0.16em] text-[var(--op-accent-300)] sm:text-[0.62rem] sm:tracking-[0.2em]">
              Selected stake
            </p>
            <div class="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 class="font-display text-lg font-semibold leading-none tracking-[-0.045em] text-[var(--op-cream-100)] sm:text-2xl">
                <span class="sm:hidden">NLH {props.group.compactLabel}</span>
                <span class="hidden sm:inline">NLH {summary().blindLabel}</span>
              </h2>
              <span class="hidden font-data text-[0.72rem] text-[var(--op-muted-300)] sm:inline">
                Buy-in {summary().buyInRange} · {summary().activeHands} active
              </span>
            </div>
            <p class="mt-1 font-data text-[0.62rem] leading-none text-[var(--op-muted-300)] sm:hidden">
              Buy-in {compactBuyInRange()} · {summary().activeHands} active
            </p>
          </div>

          <div class="flex flex-wrap gap-1.5 sm:justify-end">
            <StakeMetric label="Open" value={String(summary().openTables)} />
            <StakeMetric
              label="Seated"
              value={`${summary().occupiedSeats}/${summary().maxSeats}`}
            />
            <StakeMetric label="Tables" value={String(summary().tableCount)} />
          </div>
        </div>
      </div>

      <div class="grid gap-2">
        <For each={props.group.rooms}>
          {(room) => <RoomRow room={room} onOpenRoom={props.onOpenRoom} />}
        </For>
      </div>
    </div>
  );
}

function StakeMetric(props: { label: string; value: string }) {
  return (
    <div class="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[rgba(238,246,255,0.09)] bg-[rgba(238,246,255,0.045)] px-2.5 py-1 sm:min-h-8 sm:gap-2 sm:px-3">
      <p class="font-data text-[0.5rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)] sm:text-[0.58rem] sm:tracking-[0.16em]">
        {props.label}
      </p>
      <p class="font-data text-[0.68rem] font-semibold leading-none text-[var(--op-cream-100)] sm:text-xs">
        {props.value}
      </p>
    </div>
  );
}

function RoomRow(props: {
  room: LobbyRoomView;
  onOpenRoom: (roomId: string) => void;
}) {
  const occupancyTone = createMemo(() => getRoomOccupancyTone(props.room));
  const isFull = createMemo(() => occupancyTone() === "full");
  const actionLabel = createMemo(() =>
    isFull() ? "Full" : occupancyTone() === "empty" ? "Open" : "Join",
  );

  return (
    <button
      class="group grid w-full gap-2 rounded-[1rem] border border-[rgba(238,246,255,0.07)] bg-[rgba(4,9,21,0.28)] p-2.5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(96,165,250,0.3)] hover:bg-[rgba(10,24,43,0.74)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 sm:p-4 md:grid-cols-[1.2fr_0.75fr_0.8fr_1fr_auto] md:items-center md:gap-3 md:rounded-[1.1rem]"
      type="button"
      disabled={isFull()}
      onClick={() => props.onOpenRoom(props.room.roomId)}
    >
      <div class="flex min-w-0 items-start justify-between gap-3 md:block">
        <div class="min-w-0">
          <p class="font-data text-[0.58rem] uppercase tracking-[0.14em] text-[var(--op-muted-500)] sm:text-[0.65rem] sm:tracking-[0.18em]">
            Table {String(props.room.tableNumber).padStart(2, "0")}
            <span class="md:hidden"> · v{props.room.roomVersion}</span>
          </p>
          <h3 class="mt-0.5 truncate text-[0.95rem] font-semibold leading-tight text-[var(--op-cream-100)] sm:mt-1 sm:text-base">
            {props.room.displayName}
          </h3>
        </div>
        <span class="shrink-0 rounded-full border border-[rgba(96,165,250,0.26)] px-2.5 py-1 font-data text-[0.62rem] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--op-accent-400)] group-hover:border-[rgba(96,165,250,0.48)] group-hover:text-[var(--op-accent-300)] md:hidden">
          {actionLabel()}
        </span>
      </div>

      <div class="grid grid-cols-[0.7fr_0.9fr_1.35fr] overflow-hidden rounded-[0.85rem] border border-[rgba(238,246,255,0.08)] bg-[rgba(238,246,255,0.035)] md:hidden">
        <CompactRoomData
          label="Seats"
          value={`${props.room.occupiedSeatCount}/${props.room.maxSeats}`}
          tone={occupancyTone()}
        />
        <CompactRoomData
          class="border-l border-[rgba(238,246,255,0.07)]"
          label="Status"
          value={formatRoomStatus(props.room)}
        />
        <CompactRoomData
          class="border-l border-[rgba(238,246,255,0.07)]"
          label="Buy-in"
          value={formatCompactBuyInRange(props.room)}
        />
      </div>

      <RoomData
        class="hidden md:block"
        label="Seats"
        value={`${props.room.occupiedSeatCount}/${props.room.maxSeats}`}
        tone={occupancyTone()}
      />
      <RoomData
        class="hidden md:block"
        label="Status"
        value={formatRoomStatus(props.room)}
      />
      <RoomData
        class="hidden md:block"
        label="Buy-in"
        value={formatBuyInRange(props.room)}
      />

      <div class="hidden items-center justify-between gap-3 border-t border-[rgba(238,246,255,0.08)] pt-3 md:flex md:justify-end md:border-t-0 md:pt-0">
        <span class="font-data text-[0.65rem] text-[var(--op-muted-500)]">
          v{props.room.roomVersion}
        </span>
        <span class="rounded-full border border-[rgba(96,165,250,0.26)] px-3 py-1.5 font-data text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--op-accent-400)] group-hover:border-[rgba(96,165,250,0.48)] group-hover:text-[var(--op-accent-300)]">
          {actionLabel()}
        </span>
      </div>
    </button>
  );
}

function CompactRoomData(props: {
  label: string;
  value: string;
  tone?: "empty" | "open" | "full";
  class?: string;
}) {
  return (
    <div class={`min-w-0 px-2 py-1.5 ${props.class ?? ""}`}>
      <p class="font-data text-[0.52rem] uppercase leading-none tracking-[0.12em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <p
        class={`mt-1 truncate font-data text-[0.68rem] font-semibold leading-none ${getRoomDataToneClass(props.tone)}`}
      >
        {props.value}
      </p>
    </div>
  );
}

function RoomData(props: {
  label: string;
  value: string;
  tone?: "empty" | "open" | "full";
  class?: string;
}) {
  return (
    <div class={props.class}>
      <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <p
        class={`mt-1 truncate text-sm font-medium ${getRoomDataToneClass(props.tone)}`}
      >
        {props.value}
      </p>
    </div>
  );
}

function LobbyLoading() {
  return (
    <section class="op-panel overflow-hidden">
      <div class="grid grid-cols-3 gap-2 border-b border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.42)] p-2">
        <For each={[0, 1, 2]}>
          {() => (
            <div class="h-20 animate-pulse rounded-2xl bg-[rgba(238,246,255,0.06)]" />
          )}
        </For>
      </div>
      <div class="grid gap-2 p-3 sm:p-4 lg:p-5">
        <For each={[0, 1, 2, 3, 4, 5]}>
          {() => (
            <div class="h-24 animate-pulse rounded-[1.1rem] bg-[rgba(238,246,255,0.05)] md:h-20" />
          )}
        </For>
      </div>
    </section>
  );
}

function LobbyError(props: { error: unknown; onRefresh: () => void }) {
  return (
    <section class="op-panel mx-auto max-w-2xl p-6 text-center">
      <p class="font-data text-xs uppercase tracking-[0.2em] text-[var(--op-red-500)]">
        Worker offline
      </p>
      <h2 class="mt-3 font-display text-3xl font-semibold text-[var(--op-cream-100)]">
        The lobby could not reach the table server.
      </h2>
      <p class="mt-3 text-[var(--op-muted-300)]">
        Start the Worker with <code class="op-code">pnpm dev:worker</code>, then
        refresh the lobby.
      </p>
      <Show when={getErrorMessage(props.error)}>
        {(message) => (
          <p class="mx-auto mt-3 max-w-xl font-data text-xs text-[var(--op-muted-500)]">
            {message()}
          </p>
        )}
      </Show>
      <button
        class="op-button op-button-primary mx-auto mt-6"
        type="button"
        onClick={props.onRefresh}
      >
        Try again
      </button>
    </section>
  );
}

function getRoomDataToneClass(
  tone: "empty" | "open" | "full" | undefined,
): string {
  if (tone === "empty") {
    return "text-[var(--op-accent-400)]";
  }

  if (tone === "open") {
    return "text-[var(--op-green-500)]";
  }

  if (tone === "full") {
    return "text-[var(--op-red-500)]";
  }

  return "text-[rgba(238,246,255,0.84)]";
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  return null;
}
