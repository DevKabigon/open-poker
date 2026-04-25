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
import type { StoredRoomSession } from "../../lib";
import {
  type StakeGroup,
  formatBuyInRange,
  formatRoomStatus,
  getRoomOccupancyTone,
  groupRoomsByStake,
  summarizeStakeGroup,
} from "./lobby-utils";

export interface LobbyPageProps {
  rooms: LobbyRoomView[];
  isLoading: boolean;
  error: unknown;
  storedSession: StoredRoomSession | null;
  onRefresh: () => void;
  onOpenRoom: (roomId: string) => void;
  onResumeRoom: (roomId: string) => void;
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
      <LobbyCommandHeader
        storedSession={props.storedSession}
        onRefresh={props.onRefresh}
        onResumeRoom={props.onResumeRoom}
      />

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

function LobbyCommandHeader(props: {
  storedSession: StoredRoomSession | null;
  onRefresh: () => void;
  onResumeRoom: (roomId: string) => void;
}) {
  return (
    <section class="relative overflow-hidden rounded-[1rem] border border-[rgba(232,199,109,0.14)] bg-[linear-gradient(135deg,rgba(16,83,52,0.34),rgba(7,8,6,0.9)_52%,rgba(76,48,27,0.22))] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.24)] sm:rounded-[1.5rem] sm:p-5">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(232,199,109,0.16),transparent_24%),radial-gradient(circle_at_88%_18%,rgba(67,165,109,0.14),transparent_26%)]" />
      <div class="relative grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p class="font-data text-[0.62rem] uppercase tracking-[0.2em] text-[var(--op-gold-400)] sm:text-[0.68rem] sm:tracking-[0.24em]">
            Cash lobby
          </p>
          <div class="mt-1 flex items-center justify-between gap-3 sm:mt-2 lg:items-end lg:justify-start lg:gap-4">
            <h1 class="font-display text-2xl font-semibold leading-none tracking-[-0.055em] text-[var(--op-cream-100)] sm:text-4xl lg:text-5xl">
              Pick a seat.
            </h1>
            <p class="hidden max-w-2xl text-sm leading-6 text-[rgba(246,236,214,0.68)] sm:block sm:text-base">
              Stakes first, table second. Live room health comes from the Worker
              and every table maps to one authoritative Durable Object.
            </p>
            <span class="sm:hidden">
              <button
                class="op-button op-button-primary min-h-9 px-3 py-2 text-[0.68rem]"
                type="button"
                onClick={props.onRefresh}
              >
                Refresh
              </button>
            </span>
          </div>
        </div>

        <div class="hidden items-center gap-2 sm:flex sm:gap-3 lg:justify-end">
          <Show when={props.storedSession}>
            {(session) => (
              <button
                class="op-button op-button-secondary min-h-9 px-3 py-2 text-[0.68rem] sm:min-h-10 sm:px-4 sm:py-2.5 sm:text-xs"
                type="button"
                onClick={() => props.onResumeRoom(session().roomId)}
              >
                Resume table
              </button>
            )}
          </Show>

          <button
            class="op-button op-button-primary min-h-9 px-3 py-2 text-[0.68rem] sm:min-h-10 sm:px-4 sm:py-2.5 sm:text-xs"
            type="button"
            onClick={props.onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
    </section>
  );
}

function StakeTabs(props: {
  groups: StakeGroup[];
  activeStakeKey: string;
  onSelectStake: (stakeKey: string) => void;
}) {
  return (
    <div class="border-b border-[rgba(246,236,214,0.08)] bg-[rgba(7,8,6,0.38)] p-2">
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
                class={`rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-gold-400)] sm:p-4 ${
                  isActive()
                    ? "border-[rgba(232,199,109,0.46)] bg-[rgba(214,168,79,0.14)] shadow-[inset_0_0_0_1px_rgba(232,199,109,0.12)]"
                    : "border-[rgba(246,236,214,0.08)] bg-[rgba(246,236,214,0.035)] hover:border-[rgba(232,199,109,0.24)] hover:bg-[rgba(246,236,214,0.055)]"
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

  return (
    <div class="p-3 sm:p-4 lg:p-5">
      <div class="mb-4 grid gap-4 rounded-[1.25rem] border border-[rgba(246,236,214,0.08)] bg-[rgba(7,8,6,0.3)] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p class="font-data text-[0.68rem] uppercase tracking-[0.2em] text-[var(--op-muted-500)]">
            Selected blind
          </p>
          <h2 class="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[var(--op-cream-100)] sm:text-4xl">
            NLH {summary().blindLabel}
          </h2>
          <p class="mt-2 text-sm text-[var(--op-muted-300)]">
            Buy-in {summary().buyInRange}. {summary().activeHands} active hands
            across {summary().tableCount} fixed tables.
          </p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <StakeMetric label="Open" value={String(summary().openTables)} />
          <StakeMetric
            label="Seated"
            value={`${summary().occupiedSeats}/${summary().maxSeats}`}
          />
          <StakeMetric label="Tables" value={String(summary().tableCount)} />
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
    <div class="rounded-2xl border border-[rgba(246,236,214,0.08)] bg-[rgba(246,236,214,0.04)] px-3 py-2">
      <p class="font-data text-[0.62rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">
        {props.label}
      </p>
      <p class="mt-1 font-data text-sm font-semibold text-[var(--op-cream-100)] sm:text-base">
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

  return (
    <button
      class="group grid w-full gap-3 rounded-[1.1rem] border border-[rgba(246,236,214,0.07)] bg-[rgba(7,8,6,0.26)] p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(232,199,109,0.28)] hover:bg-[rgba(17,23,17,0.72)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-gold-400)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 sm:p-4 md:grid-cols-[1.2fr_0.75fr_0.8fr_1fr_auto] md:items-center"
      type="button"
      disabled={isFull()}
      onClick={() => props.onOpenRoom(props.room.roomId)}
    >
      <div class="min-w-0">
        <p class="font-data text-[0.65rem] uppercase tracking-[0.18em] text-[var(--op-muted-500)]">
          Table {String(props.room.tableNumber).padStart(2, "0")}
        </p>
        <h3 class="mt-1 truncate text-base font-semibold text-[var(--op-cream-100)]">
          {props.room.displayName}
        </h3>
      </div>

      <div class="grid grid-cols-2 gap-2 md:block">
        <RoomData
          label="Seats"
          value={`${props.room.occupiedSeatCount}/${props.room.maxSeats}`}
          tone={occupancyTone()}
        />
        <RoomData
          class="md:hidden"
          label="Status"
          value={formatRoomStatus(props.room)}
        />
      </div>

      <RoomData
        class="hidden md:block"
        label="Status"
        value={formatRoomStatus(props.room)}
      />
      <RoomData label="Buy-in" value={formatBuyInRange(props.room)} />

      <div class="flex items-center justify-between gap-3 border-t border-[rgba(246,236,214,0.08)] pt-3 md:justify-end md:border-t-0 md:pt-0">
        <span class="font-data text-[0.65rem] text-[var(--op-muted-500)]">
          v{props.room.roomVersion}
        </span>
        <span class="rounded-full border border-[rgba(232,199,109,0.22)] px-3 py-1.5 font-data text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--op-gold-400)] group-hover:border-[rgba(232,199,109,0.44)] group-hover:text-[var(--op-gold-300)]">
          {isFull() ? "Full" : occupancyTone() === "empty" ? "Open" : "Join"}
        </span>
      </div>
    </button>
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
      <div class="grid grid-cols-3 gap-2 border-b border-[rgba(246,236,214,0.08)] bg-[rgba(7,8,6,0.38)] p-2">
        <For each={[0, 1, 2]}>
          {() => (
            <div class="h-20 animate-pulse rounded-2xl bg-[rgba(246,236,214,0.06)]" />
          )}
        </For>
      </div>
      <div class="grid gap-2 p-3 sm:p-4 lg:p-5">
        <For each={[0, 1, 2, 3, 4, 5]}>
          {() => (
            <div class="h-24 animate-pulse rounded-[1.1rem] bg-[rgba(246,236,214,0.05)] md:h-20" />
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
    return "text-[var(--op-gold-400)]";
  }

  if (tone === "open") {
    return "text-[var(--op-green-500)]";
  }

  if (tone === "full") {
    return "text-[var(--op-red-500)]";
  }

  return "text-[rgba(246,236,214,0.84)]";
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  return null;
}
