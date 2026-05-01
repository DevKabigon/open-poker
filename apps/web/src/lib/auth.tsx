import type { Session, User } from '@supabase/supabase-js'
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import { getSupabaseClient, hasSupabaseBrowserConfig } from './supabase'
import { clearStoredRoomSession } from './session-storage'

const AUTH_RETURN_PATH_STORAGE_KEY = 'openpoker:auth-return-path'

export interface AuthContextValue {
  avatarUrl: Accessor<string | null>
  clearAuthError: () => void
  displayName: Accessor<string | null>
  errorMessage: Accessor<string | null>
  isConfigured: Accessor<boolean>
  isLoading: Accessor<boolean>
  isSigningIn: Accessor<boolean>
  isSigningOut: Accessor<boolean>
  signOutBlockReason: Accessor<string | null>
  registerBeforeSignOut: (handler: BeforeSignOutHandler) => () => void
  session: Accessor<Session | null>
  signInWithGoogle: (returnPath?: string) => Promise<void>
  signOut: () => Promise<void>
  user: Accessor<User | null>
}

export type BeforeSignOutHandler = () => Promise<boolean | void> | boolean | void

const AuthContext = createContext<AuthContextValue>()

export function AuthProvider(props: { children: JSX.Element }): JSX.Element {
  const [session, setSession] = createSignal<Session | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)
  const [isSigningIn, setIsSigningIn] = createSignal(false)
  const [isSigningOut, setIsSigningOut] = createSignal(false)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)
  const [signOutBlockReason, setSignOutBlockReason] = createSignal<string | null>(null)
  const isConfigured = () => hasSupabaseBrowserConfig()
  const user = createMemo(() => session()?.user ?? null)
  const displayName = createMemo(() => readUserDisplayName(user()))
  const avatarUrl = createMemo(() => readUserAvatarUrl(user()))
  const beforeSignOutHandlers = new Set<BeforeSignOutHandler>()
  let unsubscribeAuthState: (() => void) | undefined

  onMount(() => {
    if (!isConfigured()) {
      setIsLoading(false)
      return
    }

    const supabase = getSupabaseClient()

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          setErrorMessage(error.message)
          return
        }

        setSession(data.session)
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error) ?? 'Could not read your OpenPoker session.')
      })
      .finally(() => setIsLoading(false))

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)

      if (event === 'SIGNED_OUT') {
        setSignOutBlockReason(null)
        clearStoredRoomSession()
      }
    })

    unsubscribeAuthState = () => data.subscription.unsubscribe()
  })

  onCleanup(() => unsubscribeAuthState?.())

  const signInWithGoogle = async (returnPath: string = getCurrentReturnPath()) => {
    if (!isConfigured() || isSigningIn()) {
      return
    }

    setIsSigningIn(true)
    setErrorMessage(null)
    setSignOutBlockReason(null)
    writeStoredAuthReturnPath(returnPath)

    const { error } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSigningIn(false)
    }
  }

  const signOut = async () => {
    if (!isConfigured() || isSigningOut()) {
      return
    }

    setIsSigningOut(true)
    setErrorMessage(null)
    setSignOutBlockReason(null)

    const canSignOut = await runBeforeSignOutHandlers(
      beforeSignOutHandlers,
      (message) => setSignOutBlockReason(message),
    )

    if (!canSignOut) {
      setIsSigningOut(false)
      return
    }

    const { error } = await getSupabaseClient().auth.signOut()

    if (error) {
      setErrorMessage(error.message)
    }

    setIsSigningOut(false)
  }

  const value: AuthContextValue = {
    avatarUrl,
    clearAuthError: () => {
      setErrorMessage(null)
      setSignOutBlockReason(null)
    },
    displayName,
    errorMessage,
    isConfigured,
    isLoading,
    isSigningIn,
    isSigningOut,
    signOutBlockReason,
    registerBeforeSignOut: (handler) => {
      beforeSignOutHandlers.add(handler)

      return () => beforeSignOutHandlers.delete(handler)
    },
    session,
    signInWithGoogle,
    signOut,
    user,
  }

  return (
    <AuthContext.Provider value={value}>
      {props.children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('Auth context is not available.')
  }

  return context
}

export function consumeStoredAuthReturnPath(): string {
  const fallback = '/'

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const storedValue = window.localStorage.getItem(AUTH_RETURN_PATH_STORAGE_KEY)
    window.localStorage.removeItem(AUTH_RETURN_PATH_STORAGE_KEY)

    return normalizeReturnPath(storedValue) ?? fallback
  } catch {
    return fallback
  }
}

function writeStoredAuthReturnPath(returnPath: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedReturnPath = normalizeReturnPath(returnPath) ?? '/'

  try {
    window.localStorage.setItem(AUTH_RETURN_PATH_STORAGE_KEY, normalizedReturnPath)
  } catch {
    // Ignore storage failures; the callback can safely fall back to the lobby.
  }
}

function getCurrentReturnPath(): string {
  if (typeof window === 'undefined') {
    return '/'
  }

  return normalizeReturnPath(`${window.location.pathname}${window.location.search}`) ?? '/'
}

function normalizeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/auth/callback')) {
    return null
  }

  return trimmed
}

function readUserDisplayName(user: User | null): string | null {
  const metadata = user?.user_metadata
  const name = readMetadataString(metadata, 'full_name') ?? readMetadataString(metadata, 'name')

  return name ?? user?.email ?? null
}

function readUserAvatarUrl(user: User | null): string | null {
  return readMetadataString(user?.user_metadata, 'avatar_url') ?? readMetadataString(user?.user_metadata, 'picture')
}

function readMetadataString(metadata: User['user_metadata'] | undefined, key: string): string | null {
  const value = metadata?.[key]

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

async function runBeforeSignOutHandlers(
  handlers: Set<BeforeSignOutHandler>,
  onError: (message: string) => void,
): Promise<boolean> {
  for (const handler of Array.from(handlers)) {
    try {
      const result = await handler()

      if (result === false) {
        return false
      }
    } catch (error) {
      onError(getErrorMessage(error) ?? 'Could not leave the current table before signing out.')
      return false
    }
  }

  return true
}

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}
