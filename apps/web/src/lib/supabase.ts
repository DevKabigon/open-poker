import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  supabaseClient = createClient(
    readRequiredViteEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
    readRequiredViteEnv(
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ),
  )

  return supabaseClient
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!hasSupabaseBrowserConfig()) {
    return null
  }

  const {
    data: { session },
    error,
  } = await getSupabaseClient().auth.getSession()

  if (error) {
    throw error
  }

  return session?.access_token ?? null
}

export function hasSupabaseBrowserConfig(): boolean {
  return (
    isConfiguredViteEnv(import.meta.env.VITE_SUPABASE_URL) &&
    isConfiguredViteEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  )
}

function readRequiredViteEnv(name: string, value: string | undefined): string {
  if (!isConfiguredViteEnv(value)) {
    throw new Error(`${name} must be configured in the web app environment.`)
  }

  return value.trim()
}

function isConfiguredViteEnv(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
