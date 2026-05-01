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
  createEffect,
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
import { DisplaySettingsDialog } from './features/settings/DisplaySettingsDialog'
import { DisplaySettingsProvider } from './features/settings/display-settings'
import {
  AuthProvider,
  consumeStoredAuthReturnPath,
  fetchLobbyRooms,
  useAuth,
} from './lib'

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
      <Route path="/auth/callback" component={AuthCallbackRoute} />
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
    <DisplaySettingsProvider>
      <AuthProvider>
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
      </AuthProvider>
    </DisplaySettingsProvider>
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
  const auth = useAuth()
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
      authenticatedDisplayName={auth.displayName()}
      isAuthenticated={auth.session() !== null}
      isAuthConfigured={auth.isConfigured()}
      isSigningIn={auth.isSigningIn()}
      onBackToLobby={() => navigate('/')}
      onSignInWithGoogle={() => {
        void auth.signInWithGoogle(`/rooms/${encodeURIComponent(roomId())}`)
      }}
      onTopBarChange={app.setTableTopBar}
    />
  )
}

function AuthCallbackRoute() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [hasNavigated, setHasNavigated] = createSignal(false)

  createEffect(() => {
    if (hasNavigated() || auth.isLoading()) {
      return
    }

    if (!auth.isConfigured()) {
      setHasNavigated(true)
      navigate('/', { replace: true })
      return
    }

    if (auth.session()) {
      setHasNavigated(true)
      navigate(consumeStoredAuthReturnPath(), { replace: true })
    }
  })

  return (
    <main class="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-[1320px] items-center justify-center px-3 py-10 sm:px-6 lg:px-8">
      <section class="op-panel grid w-full max-w-md gap-4 p-5 text-center sm:p-6">
        <div class="mx-auto grid size-12 place-items-center rounded-full border border-[rgba(96,165,250,0.34)] bg-[rgba(96,165,250,0.12)] font-display text-lg font-bold text-[var(--op-accent-300)]">
          OP
        </div>
        <div>
          <p class="font-display text-xl font-semibold text-[var(--op-cream-100)]">
            Finishing sign in
          </p>
          <p class="mt-2 font-data text-xs text-[var(--op-muted-300)]">
            {auth.errorMessage() ?? 'Returning you to the table.'}
          </p>
        </div>
        <Show when={auth.errorMessage()}>
          <button
            class="op-button op-button-secondary mx-auto min-h-9 px-4 text-[0.65rem]"
            type="button"
            onClick={() => navigate('/', { replace: true })}
          >
            Back to lobby
          </button>
        </Show>
      </section>
    </main>
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
  const [isTableMenuOpen, setIsTableMenuOpen] = createSignal(false)
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false)
  const runTableMenuAction = (action: () => void) => {
    setIsTableMenuOpen(false)
    action()
  }

  return (
    <>
      <header class="relative z-50 border-b border-[rgba(238,246,255,0.08)] bg-[rgba(4,9,21,0.76)] backdrop-blur-xl">
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
                <span class="hidden rounded-full border border-[rgba(56,189,248,0.24)] bg-[rgba(56,189,248,0.1)] px-3 py-1.5 font-data text-[var(--op-blue-500)] sm:inline-flex">
                  {props.tableCount} live tables
                </span>
                <IconButton
                  ariaLabel="Refresh lobby"
                  title="Refresh lobby"
                  disabled={props.isRefreshing}
                  onClick={() => {
                    void props.onRefresh()
                  }}
                >
                  <RefreshIcon isSpinning={props.isRefreshing} />
                </IconButton>
                <IconButton
                  ariaLabel="Open settings"
                  title="Settings"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <SettingsIcon />
                </IconButton>
              </div>
            )
          }
        >
          {(tableTopBar) => (
            <>
              <div class="ml-auto hidden min-w-0 flex-1 text-right sm:block md:hidden">
                <p class="truncate font-display text-sm font-semibold tracking-[-0.035em] text-[var(--op-cream-100)]">
                  {tableTopBar().roomTitle}
                </p>
                <p class="mt-0.5 truncate font-data text-[0.62rem] text-[var(--op-muted-300)]">
                  {tableTopBar().buyInLabel}
                </p>
              </div>

              <div class="mx-2 hidden min-w-0 flex-1 flex-col items-end justify-center text-right md:flex">
                <p class="truncate font-display text-base font-semibold tracking-[-0.035em] text-[var(--op-cream-100)]">
                  {tableTopBar().roomTitle}
                </p>
                <span class="mt-0.5 truncate font-data text-[0.65rem] text-[var(--op-muted-300)]">
                  {tableTopBar().buyInLabel}
                </span>
              </div>

              <div class="hidden shrink-0 items-center justify-end gap-2 text-xs text-[var(--op-muted-300)] md:flex">
                <Show when={tableTopBar().canLeaveSeat}>
                  <button
                    class="op-button op-button-primary min-h-8 px-3 text-[0.68rem]"
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
                <IconButton
                  ariaLabel="Refresh table"
                  title="Refresh table"
                  disabled={tableTopBar().isRefreshing}
                  onClick={tableTopBar().onRefresh}
                >
                  <RefreshIcon isSpinning={tableTopBar().isRefreshing} />
                </IconButton>
                <IconButton
                  ariaLabel="Open settings"
                  title="Settings"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <SettingsIcon />
                </IconButton>
              </div>

              <IconButton
                ariaLabel="Refresh table"
                class="size-9 md:hidden"
                title="Refresh table"
                disabled={tableTopBar().isRefreshing}
                onClick={tableTopBar().onRefresh}
              >
                <RefreshIcon isSpinning={tableTopBar().isRefreshing} />
              </IconButton>

              <IconButton
                ariaLabel="Open settings"
                class="size-9 md:hidden"
                title="Settings"
                onClick={() => setIsSettingsOpen(true)}
              >
                <SettingsIcon />
              </IconButton>

              <div class="relative shrink-0 md:hidden">
                <button
                  class="grid size-9 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] text-[var(--op-muted-300)] transition hover:border-[rgba(96,165,250,0.36)] hover:text-[var(--op-accent-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)]"
                  type="button"
                  aria-label="Open table menu"
                  aria-expanded={isTableMenuOpen()}
                  onClick={() => setIsTableMenuOpen(!isTableMenuOpen())}
                >
                  <MenuIcon />
                </button>

                <Show when={isTableMenuOpen()}>
                  <div class="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-44 gap-1 rounded-[0.85rem] border border-[rgba(238,246,255,0.12)] bg-[rgba(4,9,21,0.96)] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                    <Show when={tableTopBar().canLeaveSeat}>
                      <button
                        class="op-button op-button-primary min-h-9 w-full justify-start px-3 text-[0.68rem]"
                        type="button"
                        disabled={tableTopBar().isLeavingSeat}
                        onClick={() => runTableMenuAction(tableTopBar().onLeaveSeat)}
                      >
                        {tableTopBar().isLeavingSeat ? 'Leaving' : tableTopBar().leaveSeatLabel}
                      </button>
                    </Show>
                    <button
                      class="op-button op-button-danger min-h-9 w-full justify-start px-3 text-[0.68rem]"
                      type="button"
                      disabled={tableTopBar().isResettingRoom}
                      onClick={() => runTableMenuAction(tableTopBar().onResetRoom)}
                    >
                      {tableTopBar().isResettingRoom ? 'Resetting' : 'Reset'}
                    </button>
                    <button
                      class="op-button op-button-secondary min-h-9 w-full justify-start px-3 text-[0.68rem]"
                      type="button"
                      onClick={() => runTableMenuAction(tableTopBar().onBackToLobby)}
                    >
                      Lobby
                    </button>
                  </div>
                </Show>
              </div>
            </>
          )}
        </Show>
        <AuthControls />
        </div>
      </header>

      <Show when={isSettingsOpen()}>
        <DisplaySettingsDialog onClose={() => setIsSettingsOpen(false)} />
      </Show>
    </>
  )
}

function AuthControls() {
  const auth = useAuth()
  const [isMenuOpen, setIsMenuOpen] = createSignal(false)
  const name = createMemo(() => auth.displayName() ?? 'Player')
  const initial = createMemo(() => name().trim().slice(0, 1).toUpperCase() || 'P')

  return (
    <Show when={auth.isConfigured()}>
      <Show
        when={auth.session()}
        fallback={
          <button
            class="op-button op-button-secondary min-h-8 shrink-0 px-3 text-[0.62rem] sm:min-h-9 sm:text-[0.68rem]"
            type="button"
            aria-label="Sign in with Google"
            title="Sign in with Google"
            disabled={auth.isLoading() || auth.isSigningIn()}
            onClick={() => {
              void auth.signInWithGoogle()
            }}
          >
            <span class="sm:hidden">{auth.isSigningIn() ? '...' : 'G'}</span>
            <span class="hidden sm:inline">{auth.isSigningIn() ? 'Opening' : 'Google'}</span>
          </button>
        }
      >
        <div class="relative shrink-0">
          <button
            class="flex min-h-9 max-w-40 items-center gap-2 rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] py-1 pl-1 pr-2 text-left transition hover:border-[rgba(96,165,250,0.36)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)]"
            type="button"
            aria-label="Open account menu"
            aria-expanded={isMenuOpen()}
            onClick={() => setIsMenuOpen(!isMenuOpen())}
          >
            <AuthAvatar avatarUrl={auth.avatarUrl()} initial={initial()} />
            <span class="hidden max-w-24 truncate font-data text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[var(--op-cream-100)] sm:block">
              {name()}
            </span>
          </button>

          <Show when={isMenuOpen()}>
            <div class="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid w-52 gap-1 rounded-[0.85rem] border border-[rgba(238,246,255,0.12)] bg-[rgba(4,9,21,0.96)] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
              <div class="min-w-0 px-2 py-2">
                <p class="truncate font-data text-[0.62rem] uppercase tracking-[0.12em] text-[var(--op-muted-500)]">
                  Signed in
                </p>
                <p class="mt-0.5 truncate font-data text-xs text-[var(--op-cream-100)]">
                  {name()}
                </p>
              </div>
              <button
                class="op-button op-button-secondary min-h-9 w-full justify-start px-3 text-[0.66rem]"
                type="button"
                disabled={auth.isSigningOut()}
                onClick={() => {
                  void (async () => {
                    await auth.signOut()

                    if (!auth.signOutBlockReason()) {
                      setIsMenuOpen(false)
                    }
                  })()
                }}
              >
                {auth.isSigningOut() ? 'Leaving' : 'Sign out'}
              </button>
              <Show when={auth.signOutBlockReason()}>
                {(reason) => (
                  <p class="px-2 pb-1 font-data text-[0.64rem] leading-4 text-[var(--op-red-500)]">
                    {reason()}
                  </p>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </Show>
  )
}

function AuthAvatar(props: { avatarUrl: string | null; initial: string }) {
  return (
    <Show
      when={props.avatarUrl}
      fallback={
        <span class="grid size-7 shrink-0 place-items-center rounded-full bg-[rgba(96,165,250,0.18)] font-data text-xs font-bold text-[var(--op-accent-300)]">
          {props.initial}
        </span>
      }
    >
      {(avatarUrl) => (
        <img
          class="size-7 shrink-0 rounded-full object-cover"
          src={avatarUrl()}
          alt=""
          referrerpolicy="no-referrer"
        />
      )}
    </Show>
  )
}

function IconButton(props: {
  ariaLabel: string
  children: JSX.Element
  class?: string
  disabled?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      class={`grid ${props.class ?? 'size-8 sm:size-9'} shrink-0 place-items-center rounded-full border border-[rgba(238,246,255,0.12)] bg-[rgba(238,246,255,0.055)] text-[var(--op-muted-300)] transition hover:border-[rgba(96,165,250,0.36)] hover:text-[var(--op-accent-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--op-accent-400)] disabled:cursor-not-allowed disabled:opacity-55`}
      type="button"
      aria-label={props.ariaLabel}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function MenuIcon() {
  return (
    <svg
      class="size-4"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      class="size-4"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2.06 2.06 0 1 1-2.91 2.91l-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2.06 2.06 0 1 1-4.12 0v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.05.05a2.06 2.06 0 1 1-2.91-2.91l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2.06 2.06 0 1 1 0-4.12h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.05-.05a2.06 2.06 0 1 1 2.91-2.91l.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2.06 2.06 0 1 1 4.12 0v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.05-.05a2.06 2.06 0 1 1 2.91 2.91l-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.55 1H21a2.06 2.06 0 1 1 0 4.12h-.08a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
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
