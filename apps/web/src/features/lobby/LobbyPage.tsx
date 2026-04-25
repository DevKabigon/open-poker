import type { LobbyRoomView } from '@openpoker/protocol'
import { For, Match, Show, Switch, createMemo } from 'solid-js'
import type { StoredRoomSession } from '../../lib'
import {
  formatBlindLabel,
  formatBuyInRange,
  formatRoomStatus,
  getRoomOccupancyTone,
  groupRoomsByStake,
} from './lobby-utils'

export interface LobbyPageProps {
  rooms: LobbyRoomView[]
  isLoading: boolean
  error: unknown
  storedSession: StoredRoomSession | null
  onRefresh: () => void
  onOpenRoom: (roomId: string) => void
  onResumeRoom: (roomId: string) => void
}

export function LobbyPage(props: LobbyPageProps) {
  const stakeGroups = createMemo(() => groupRoomsByStake(props.rooms))

  return (
    <main class="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 pb-10 pt-6 sm:px-8 lg:px-10">
      <section class="relative overflow-hidden rounded-[2rem] border border-[rgba(232,199,109,0.16)] bg-[linear-gradient(135deg,rgba(16,83,52,0.72),rgba(7,8,6,0.94)_48%,rgba(76,48,27,0.52))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)] sm:p-8 lg:p-10">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(232,199,109,0.2),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(67,165,109,0.22),transparent_26%)]" />
        <div class="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
          <div class="max-w-3xl">
            <p class="mb-4 inline-flex rounded-full border border-[rgba(232,199,109,0.22)] bg-[rgba(7,8,6,0.42)] px-3 py-1 font-data text-xs uppercase tracking-[0.24em] text-[var(--op-gold-400)]">
              No-limit Hold'em cash lobby
            </p>
            <h1 class="font-display text-4xl font-semibold leading-[0.96] tracking-[-0.05em] text-[var(--op-cream-100)] sm:text-6xl lg:text-7xl">
              Choose a table.
              <span class="block text-[var(--op-gold-400)]">Keep the math honest.</span>
            </h1>
            <p class="mt-6 max-w-2xl text-base leading-7 text-[rgba(246,236,214,0.72)] sm:text-lg">
              Thirty fixed six-max tables backed by Durable Objects. The lobby shows live room health, then the table
              UI mirrors server snapshots without inventing poker state locally.
            </p>
          </div>

          <div class="rounded-[1.5rem] border border-[rgba(246,236,214,0.1)] bg-[rgba(7,8,6,0.46)] p-5 backdrop-blur">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-data text-xs uppercase tracking-[0.2em] text-[var(--op-muted-300)]">Lobby status</p>
                <p class="mt-2 text-2xl font-semibold text-[var(--op-cream-100)]">
                  <Show when={!props.isLoading} fallback="Loading">
                    {props.rooms.length} tables
                  </Show>
                </p>
              </div>
              <button class="op-button op-button-secondary" type="button" onClick={props.onRefresh}>
                Refresh
              </button>
            </div>
            <Show when={props.storedSession}>
              {(session) => (
                <button
                  class="mt-5 w-full rounded-2xl border border-[rgba(232,199,109,0.28)] bg-[rgba(214,168,79,0.12)] p-4 text-left transition hover:border-[rgba(232,199,109,0.52)] hover:bg-[rgba(214,168,79,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-gold-400)]"
                  type="button"
                  onClick={() => props.onResumeRoom(session().roomId)}
                >
                  <span class="block font-data text-xs uppercase tracking-[0.18em] text-[var(--op-gold-400)]">
                    Resume session
                  </span>
                  <span class="mt-1 block text-sm text-[rgba(246,236,214,0.76)]">
                    Rejoin {session().roomId}
                  </span>
                </button>
              )}
            </Show>
          </div>
        </div>
      </section>

      <Switch>
        <Match when={props.error}>
          <section class="op-panel mx-auto max-w-2xl p-6 text-center">
            <p class="font-data text-xs uppercase tracking-[0.2em] text-[var(--op-red-500)]">Worker offline</p>
            <h2 class="mt-3 font-display text-3xl font-semibold text-[var(--op-cream-100)]">
              The lobby could not reach the table server.
            </h2>
            <p class="mt-3 text-[var(--op-muted-300)]">
              Start the Worker with <code class="op-code">pnpm dev:worker</code>, then refresh the lobby.
            </p>
            <button class="op-button op-button-primary mx-auto mt-6" type="button" onClick={props.onRefresh}>
              Try again
            </button>
          </section>
        </Match>

        <Match when={props.isLoading}>
          <section class="grid gap-4 md:grid-cols-3">
            <For each={[0, 1, 2]}>
              {() => <div class="h-80 animate-pulse rounded-[1.5rem] border border-[rgba(246,236,214,0.08)] bg-[rgba(24,32,25,0.62)]" />}
            </For>
          </section>
        </Match>

        <Match when>
          <section class="grid gap-5 xl:grid-cols-3">
            <For each={stakeGroups()}>
              {(group) => (
                <article class="op-panel p-4 sm:p-5">
                  <div class="mb-5 flex items-end justify-between gap-4">
                    <div>
                      <p class="font-data text-xs uppercase tracking-[0.2em] text-[var(--op-muted-300)]">Cash stake</p>
                      <h2 class="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-[var(--op-cream-100)]">
                        {group.label}
                      </h2>
                    </div>
                    <span class="rounded-full border border-[rgba(246,236,214,0.09)] bg-[rgba(246,236,214,0.05)] px-3 py-1 font-data text-xs text-[var(--op-muted-300)]">
                      {group.rooms.length} tables
                    </span>
                  </div>
                  <div class="grid gap-3">
                    <For each={group.rooms}>
                      {(room) => <RoomCard room={room} onOpenRoom={props.onOpenRoom} />}
                    </For>
                  </div>
                </article>
              )}
            </For>
          </section>
        </Match>
      </Switch>
    </main>
  )
}

function RoomCard(props: { room: LobbyRoomView; onOpenRoom: (roomId: string) => void }) {
  const occupancyTone = createMemo(() => getRoomOccupancyTone(props.room))
  const isFull = createMemo(() => occupancyTone() === 'full')

  return (
    <button
      class="group rounded-[1.25rem] border border-[rgba(246,236,214,0.08)] bg-[rgba(7,8,6,0.34)] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(232,199,109,0.34)] hover:bg-[rgba(17,23,17,0.84)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-gold-400)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
      type="button"
      disabled={isFull()}
      onClick={() => props.onOpenRoom(props.room.roomId)}
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-data text-xs uppercase tracking-[0.18em] text-[var(--op-muted-300)]">
            Table {String(props.room.tableNumber).padStart(2, '0')}
          </p>
          <h3 class="mt-1 text-lg font-semibold text-[var(--op-cream-100)]">{props.room.displayName}</h3>
        </div>
        <span class={`op-status-pill op-status-${occupancyTone()}`}>
          {props.room.occupiedSeatCount}/{props.room.maxSeats}
        </span>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <RoomMetric label="Blinds" value={formatBlindLabel(props.room.smallBlind, props.room.bigBlind)} />
        <RoomMetric label="Buy-in" value={formatBuyInRange(props.room)} />
        <RoomMetric label="Status" value={formatRoomStatus(props.room)} />
        <RoomMetric label="Eligible" value={`${props.room.handEligibleSeatCount} seated`} />
      </div>

      <div class="mt-4 flex items-center justify-between border-t border-[rgba(246,236,214,0.08)] pt-4">
        <span class="font-data text-xs text-[var(--op-muted-500)]">v{props.room.roomVersion}</span>
        <span class="text-sm font-semibold text-[var(--op-gold-400)] group-hover:text-[var(--op-gold-300)]">
          {isFull() ? 'Full' : occupancyTone() === 'empty' ? 'Open table' : 'Join table'}
        </span>
      </div>
    </button>
  )
}

function RoomMetric(props: { label: string; value: string }) {
  return (
    <div>
      <p class="font-data text-[0.65rem] uppercase tracking-[0.16em] text-[var(--op-muted-500)]">{props.label}</p>
      <p class="mt-1 truncate text-sm font-medium text-[rgba(246,236,214,0.84)]">{props.value}</p>
    </div>
  )
}
