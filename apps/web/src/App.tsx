import { Show, createMemo, createResource, createSignal } from 'solid-js'
import { LobbyPage } from './features/lobby/LobbyPage'
import { fetchLobbyRooms, getApiBaseUrl, readStoredRoomSession } from './lib'

function App() {
  const [selectedRoomId, setSelectedRoomId] = createSignal<string | null>(null)
  const [storedSession] = createSignal(readStoredRoomSession())
  const [lobbyResponse, { refetch }] = createResource(fetchLobbyRooms)
  const rooms = createMemo(() => lobbyResponse.latest?.rooms ?? lobbyResponse()?.rooms ?? [])

  return (
    <div class="min-h-svh overflow-hidden bg-[var(--op-bg-950)] text-[var(--op-cream-100)]">
      <div class="op-room-glow" />
      <AppTopBar selectedRoomId={selectedRoomId()} tableCount={rooms().length} />
      <LobbyPage
        rooms={rooms()}
        isLoading={lobbyResponse.loading}
        error={lobbyResponse.error}
        storedSession={storedSession()}
        onRefresh={() => {
          void refetch()
        }}
        onOpenRoom={setSelectedRoomId}
        onResumeRoom={setSelectedRoomId}
      />
      <Show when={selectedRoomId()}>
        {(roomId) => (
          <aside class="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-3xl rounded-[1.5rem] border border-[rgba(232,199,109,0.22)] bg-[rgba(7,8,6,0.88)] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.46)] backdrop-blur">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-data text-xs uppercase tracking-[0.18em] text-[var(--op-gold-400)]">
                  Table shell queued
                </p>
                <p class="mt-1 text-sm text-[rgba(246,236,214,0.76)]">
                  Selected <span class="font-data text-[var(--op-cream-100)]">{roomId()}</span>. The next pass will
                  render the authoritative table snapshot here.
                </p>
              </div>
              <button class="op-button op-button-secondary" type="button" onClick={() => setSelectedRoomId(null)}>
                Stay in lobby
              </button>
            </div>
          </aside>
        )}
      </Show>
    </div>
  )
}

function AppTopBar(props: { selectedRoomId: string | null; tableCount: number }) {
  return (
    <header class="relative z-10 border-b border-[rgba(246,236,214,0.08)] bg-[rgba(7,8,6,0.72)] backdrop-blur-xl">
      <div class="mx-auto flex min-h-16 w-full max-w-[1440px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div class="flex items-center gap-3">
          <div class="grid size-10 place-items-center rounded-2xl border border-[rgba(232,199,109,0.28)] bg-[linear-gradient(135deg,rgba(214,168,79,0.26),rgba(6,43,27,0.82))] font-display text-lg font-bold text-[var(--op-gold-400)]">
            OP
          </div>
          <div>
            <p class="font-display text-xl font-semibold tracking-[-0.04em] text-[var(--op-cream-100)]">OpenPoker</p>
            <p class="font-data text-[0.65rem] uppercase tracking-[0.18em] text-[var(--op-muted-500)]">
              Real-time table server
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--op-muted-300)]">
          <span class="rounded-full border border-[rgba(67,165,109,0.24)] bg-[rgba(67,165,109,0.1)] px-3 py-1.5 font-data text-[var(--op-green-500)]">
            Worker {getApiBaseUrl()}
          </span>
          <span class="rounded-full border border-[rgba(246,236,214,0.08)] bg-[rgba(246,236,214,0.04)] px-3 py-1.5 font-data">
            {props.tableCount} live tables
          </span>
          <Show when={props.selectedRoomId}>
            {(roomId) => (
              <span class="rounded-full border border-[rgba(232,199,109,0.18)] bg-[rgba(214,168,79,0.1)] px-3 py-1.5 font-data text-[var(--op-gold-400)]">
                {roomId()}
              </span>
            )}
          </Show>
        </div>
      </div>
    </header>
  )
}

export default App
