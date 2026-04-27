import type { LobbyRoomView } from '@openpoker/protocol'
import type { RouteSectionProps } from '@solidjs/router'
import {
  Navigate,
  Route,
  Router,
  useCurrentMatches,
  useNavigate,
  useParams,
} from '@solidjs/router'
import {
  Show,
  createContext,
  createMemo,
  createResource,
  createSignal,
  type Accessor,
  type JSX,
  useContext,
} from 'solid-js'
import { LobbyPage } from './features/lobby/LobbyPage'
import {
  TableRoomPage,
  type TableRoomTopBarView,
} from './features/table/TableRoomPage'
import { fetchLobbyRooms } from './lib'

interface AppShellContextValue {
  rooms: Accessor<LobbyRoomView[]>
  isLobbyLoading: Accessor<boolean>
  lobbyError: Accessor<unknown>
  isRefreshing: Accessor<boolean>
  onRefresh: () => void | Promise<void>
  setTableTopBar: (view: TableRoomTopBarView | null) => void
}

const AppShellContext = createContext<AppShellContextValue>()

function App() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={LobbyRoute} />
      <Route path="/rooms/:roomId" component={TableRoute} />
      <Route path="*404" component={NotFoundRoute} />
    </Router>
  )
}

function AppShell(props: RouteSectionProps): JSX.Element {
  const [isRefreshFeedbackVisible, setIsRefreshFeedbackVisible] = createSignal(false)
  const [tableTopBar, setTableTopBar] = createSignal<TableRoomTopBarView | null>(null)
  const [lobbyResponse, { refetch }] = createResource(fetchLobbyRooms)
  const rooms = createMemo(() => lobbyResponse.latest?.rooms ?? lobbyResponse()?.rooms ?? [])
  const isRefreshing = createMemo(() => lobbyResponse.loading || isRefreshFeedbackVisible())
  const matches = useCurrentMatches()
  const activeTableRoomId = createMemo(() => {
    const tableMatch = matches().find((match) => typeof match.params.roomId === 'string')

    return tableMatch?.params.roomId ?? null
  })
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

  const contextValue: AppShellContextValue = {
    rooms,
    isLobbyLoading: () => lobbyResponse.loading && rooms().length === 0,
    lobbyError: () => lobbyResponse.error,
    isRefreshing,
    onRefresh: handleRefresh,
    setTableTopBar,
  }

  return (
    <AppShellContext.Provider value={contextValue}>
      <div class="min-h-svh overflow-x-hidden bg-[var(--op-bg-950)] text-[var(--op-cream-100)]">
        <div class="op-room-glow" />
        <AppTopBar
          activeTableRoomId={activeTableRoomId()}
          tableTopBar={tableTopBar()}
          tableCount={rooms().length}
          isRefreshing={isRefreshing()}
          onRefresh={handleRefresh}
        />
        {props.children}
      </div>
    </AppShellContext.Provider>
  )
}

function LobbyRoute() {
  const app = useAppShell()
  const navigate = useNavigate()

  return (
    <LobbyPage
      rooms={app.rooms()}
      isLoading={app.isLobbyLoading()}
      error={app.lobbyError()}
      onRefresh={app.onRefresh}
      onOpenRoom={(roomId) => navigate(`/rooms/${encodeURIComponent(roomId)}`)}
    />
  )
}

function TableRoute() {
  const app = useAppShell()
  const navigate = useNavigate()
  const params = useParams<{ roomId: string }>()
  const roomId = createMemo(() => params.roomId)
  const selectedRoom = createMemo(
    () => app.rooms().find((room) => room.roomId === roomId()) ?? null,
  )

  return (
    <TableRoomPage
      roomId={roomId()}
      room={selectedRoom()}
      onBackToLobby={() => navigate('/')}
      onTopBarChange={app.setTableTopBar}
    />
  )
}

function NotFoundRoute() {
  return <Navigate href="/" />
}

function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext)

  if (!context) {
    throw new Error('AppShell context is not available.')
  }

  return context
}

function AppTopBar(props: {
  activeTableRoomId: string | null
  tableTopBar: TableRoomTopBarView | null
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

        <Show
          when={props.tableTopBar}
          fallback={
            props.activeTableRoomId ? (
              <div class="ml-auto min-w-0 text-right">
                <p class="font-data text-[0.58rem] uppercase tracking-[0.14em] text-[var(--op-muted-500)]">
                  Loading table
                </p>
                <p class="mt-0.5 truncate font-display text-base font-semibold tracking-[-0.035em] text-[var(--op-cream-100)]">
                  OpenPoker Table
                </p>
              </div>
            ) : (
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
                  <RefreshIcon isSpinning={props.isRefreshing} />
                </button>
              </div>
            )
          }
        >
          {(tableTopBar) => (
            <>
              <div class="mx-2 hidden min-w-0 flex-1 items-baseline justify-end gap-2 text-right md:flex">
                <p class="truncate font-display text-base font-semibold tracking-[-0.035em] text-[var(--op-cream-100)]">
                  {tableTopBar().roomTitle}
                </p>
                <span class="font-data text-[0.65rem] text-[var(--op-muted-300)]">
                  {tableTopBar().buyInLabel}
                </span>
              </div>

              <div class="ml-auto flex shrink-0 items-center justify-end gap-2 text-xs text-[var(--op-muted-300)]">
                <Show when={tableTopBar().canLeaveSeat}>
                  <button
                    class="op-button op-button-primary hidden min-h-8 px-3 text-[0.68rem] sm:inline-flex"
                    type="button"
                    disabled={tableTopBar().isLeavingSeat}
                    onClick={tableTopBar().onLeaveSeat}
                  >
                    {tableTopBar().isLeavingSeat ? 'Leaving' : tableTopBar().leaveSeatLabel}
                  </button>
                </Show>
                <button
                  class="op-button op-button-danger min-h-8 px-3 text-[0.68rem]"
                  type="button"
                  disabled={tableTopBar().isResettingRoom}
                  onClick={tableTopBar().onResetRoom}
                >
                  {tableTopBar().isResettingRoom ? 'Resetting' : 'Reset'}
                </button>
                <button
                  class="op-button op-button-secondary min-h-8 px-3 text-[0.68rem]"
                  type="button"
                  onClick={tableTopBar().onBackToLobby}
                >
                  Lobby
                </button>
                <button
                  class="grid size-8 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] text-[var(--op-muted-300)] transition hover:border-[rgba(96,165,250,0.36)] hover:text-[var(--op-accent-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)] disabled:cursor-not-allowed disabled:opacity-55 sm:size-9"
                  type="button"
                  aria-label="Refresh table"
                  title="Refresh table"
                  disabled={tableTopBar().isRefreshing}
                  onClick={tableTopBar().onRefresh}
                >
                  <RefreshIcon isSpinning={tableTopBar().isRefreshing} />
                </button>
              </div>
            </>
          )}
        </Show>
      </div>
    </header>
  )
}

function RefreshIcon(props: { isSpinning: boolean }) {
  return (
    <svg
      class={props.isSpinning ? 'size-4 animate-spin' : 'size-4'}
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
  )
}

export default App
