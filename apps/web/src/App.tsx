import { Show, createMemo, createResource, createSignal } from 'solid-js'
import { LobbyPage } from './features/lobby/LobbyPage'
import { TableRoomPage } from './features/table/TableRoomPage'
import { fetchLobbyRooms } from './lib'

function App() {
  const [selectedRoomId, setSelectedRoomId] = createSignal<string | null>(null)
  const [isRefreshFeedbackVisible, setIsRefreshFeedbackVisible] = createSignal(false)
  const [lobbyResponse, { refetch }] = createResource(fetchLobbyRooms)
  const rooms = createMemo(() => lobbyResponse.latest?.rooms ?? lobbyResponse()?.rooms ?? [])
  const selectedRoom = createMemo(() => rooms().find((room) => room.roomId === selectedRoomId()) ?? null)
  const isRefreshing = createMemo(() => lobbyResponse.loading || isRefreshFeedbackVisible())
  let refreshFeedbackTimer: number | undefined

  const handleRefresh = async () => {
    if (refreshFeedbackTimer !== undefined) {
      window.clearTimeout(refreshFeedbackTimer)
    }

    const startedAt = performance.now()
    setIsRefreshFeedbackVisible(true)

    try {
      await refetch()
    } finally {
      const remainingFeedbackMs = Math.max(450 - (performance.now() - startedAt), 0)

      refreshFeedbackTimer = window.setTimeout(() => {
        setIsRefreshFeedbackVisible(false)
      }, remainingFeedbackMs)
    }
  }

  return (
    <div class="min-h-svh overflow-x-hidden bg-[var(--op-bg-950)] text-[var(--op-cream-100)]">
      <div class="op-room-glow" />
      <AppTopBar
        selectedRoomId={selectedRoomId()}
        tableCount={rooms().length}
        isRefreshing={isRefreshing()}
        onRefresh={handleRefresh}
      />
      <Show when={selectedRoomId()}>
        {(roomId) => (
          <TableRoomPage
            roomId={roomId()}
            room={selectedRoom()}
            onBackToLobby={() => setSelectedRoomId(null)}
          />
        )}
      </Show>
      <Show when={!selectedRoomId()}>
        <LobbyPage
          rooms={rooms()}
          isLoading={lobbyResponse.loading && rooms().length === 0}
          error={lobbyResponse.error}
          onRefresh={handleRefresh}
          onOpenRoom={setSelectedRoomId}
        />
      </Show>
    </div>
  )
}

function AppTopBar(props: {
  selectedRoomId: string | null
  tableCount: number
  isRefreshing: boolean
  onRefresh: () => void | Promise<void>
}) {
  return (
    <header class="relative z-10 border-b border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.76)] backdrop-blur-xl">
      <div class="mx-auto flex min-h-14 w-full max-w-[1320px] items-center justify-between gap-3 px-3 py-3 sm:min-h-16 sm:px-6 sm:py-4 lg:px-8">
        <div class="flex items-center gap-3">
          <div class="grid size-9 place-items-center rounded-2xl border border-[rgba(96,165,250,0.34)] bg-[linear-gradient(135deg,rgba(96,165,250,0.25),rgba(8,47,73,0.84))] font-display text-base font-bold text-[var(--op-accent-300)] sm:size-10 sm:text-lg">
            OP
          </div>
          <div>
            <p class="font-display text-xl font-semibold tracking-[-0.04em] text-[var(--op-cream-100)]">OpenPoker</p>
            <p class="hidden font-data text-[0.65rem] uppercase tracking-[0.18em] text-[var(--op-muted-500)] sm:block">
              Real-time table server
            </p>
          </div>
        </div>

        <div class="ml-auto flex shrink-0 items-center justify-end gap-2 text-xs text-[var(--op-muted-300)]">
          <span class="rounded-full border border-[rgba(56,189,248,0.24)] bg-[rgba(56,189,248,0.1)] px-3 py-1.5 font-data text-[var(--op-blue-500)]">
            {props.tableCount} live tables
          </span>
          <button
            class="grid size-8 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] text-[var(--op-muted-300)] transition hover:border-[rgba(96,165,250,0.36)] hover:text-[var(--op-accent-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)] disabled:cursor-not-allowed disabled:opacity-55 sm:size-9"
            type="button"
            aria-label="Refresh lobby"
            title="Refresh lobby"
            disabled={props.isRefreshing}
            onClick={() => {
              void props.onRefresh()
            }}
          >
            <svg
              class={props.isRefreshing ? "size-4 animate-spin" : "size-4"}
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 12a9 9 0 0 1-15.4 6.4" />
              <path d="M3 12A9 9 0 0 1 18.4 5.6" />
              <path d="M18 2v4h-4" />
              <path d="M6 22v-4h4" />
            </svg>
          </button>
          <Show when={props.selectedRoomId}>
            {(roomId) => (
              <span class="hidden rounded-full border border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.1)] px-3 py-1.5 font-data text-[var(--op-accent-400)] md:inline-flex">
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
