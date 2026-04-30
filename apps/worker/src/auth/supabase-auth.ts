import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

export interface SupabaseAuthEnv {
  SUPABASE_URL?: string
  VITE_SUPABASE_URL?: string
}

export interface SupabaseAuthContext {
  userId: string
  role: string | null
  sessionId: string | null
  claims: JWTPayload
}

export interface VerifySupabaseJwtOptions {
  supabaseUrl: string
}

export type VerifySupabaseJwt = (
  token: string,
  options: VerifySupabaseJwtOptions,
) => Promise<JWTPayload>

export const OPEN_POKER_AUTH_USER_ID_HEADER = 'x-openpoker-auth-user-id'
export const OPEN_POKER_AUTH_ROLE_HEADER = 'x-openpoker-auth-role'
export const OPEN_POKER_AUTH_SESSION_ID_HEADER = 'x-openpoker-auth-session-id'

const remoteJwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export class SupabaseAuthError extends Error {
  readonly status: number
  readonly cause?: unknown

  constructor(status: number, message: string, cause?: unknown) {
    super(message)
    this.name = 'SupabaseAuthError'
    this.status = status
    this.cause = cause
  }
}

export async function resolveSupabaseAuthContext(
  request: Request,
  env: SupabaseAuthEnv,
  verifyJwt: VerifySupabaseJwt = verifySupabaseJwt,
): Promise<SupabaseAuthContext | null> {
  const token = readBearerToken(request.headers)

  if (token === null) {
    return null
  }

  const supabaseUrl = readSupabaseUrl(env)

  try {
    return createSupabaseAuthContext(await verifyJwt(token, { supabaseUrl }))
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      throw error
    }

    throw new SupabaseAuthError(401, 'Authorization token is not a valid Supabase session.', error)
  }
}

export async function verifySupabaseJwt(
  token: string,
  options: VerifySupabaseJwtOptions,
): Promise<JWTPayload> {
  const supabaseUrl = normalizeSupabaseUrl(options.supabaseUrl)
  const issuer = `${supabaseUrl}/auth/v1`
  const { payload } = await jwtVerify(
    token,
    getRemoteJwksForIssuer(issuer),
    {
      issuer,
      audience: 'authenticated',
    },
  )

  return payload
}

export function createForwardedRoomRequestHeaders(
  sourceHeaders: Headers,
  authContext: SupabaseAuthContext | null,
): Headers {
  const headers = new Headers(sourceHeaders)

  headers.delete('authorization')
  headers.delete(OPEN_POKER_AUTH_USER_ID_HEADER)
  headers.delete(OPEN_POKER_AUTH_ROLE_HEADER)
  headers.delete(OPEN_POKER_AUTH_SESSION_ID_HEADER)

  if (authContext) {
    headers.set(OPEN_POKER_AUTH_USER_ID_HEADER, authContext.userId)

    if (authContext.role) {
      headers.set(OPEN_POKER_AUTH_ROLE_HEADER, authContext.role)
    }

    if (authContext.sessionId) {
      headers.set(OPEN_POKER_AUTH_SESSION_ID_HEADER, authContext.sessionId)
    }
  }

  return headers
}

export function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')

  if (authorization === null || authorization.trim().length === 0) {
    return null
  }

  const match = /^Bearer\s+(?<token>\S+)$/i.exec(authorization.trim())
  const token = match?.groups?.token

  if (!token) {
    throw new SupabaseAuthError(401, 'Authorization header must use Bearer <token>.')
  }

  return token
}

export function readForwardedAuthUserId(headers: Headers): string | null {
  const value = headers.get(OPEN_POKER_AUTH_USER_ID_HEADER)

  return isNonEmptyString(value) ? value.trim() : null
}

function createSupabaseAuthContext(claims: JWTPayload): SupabaseAuthContext {
  if (!isNonEmptyString(claims.sub)) {
    throw new SupabaseAuthError(401, 'Authorization token is missing a Supabase user id.')
  }

  return {
    userId: claims.sub,
    role: getStringClaim(claims, 'role'),
    sessionId: getStringClaim(claims, 'session_id'),
    claims,
  }
}

function readSupabaseUrl(env: SupabaseAuthEnv): string {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL

  if (!isNonEmptyString(supabaseUrl)) {
    throw new SupabaseAuthError(500, 'SUPABASE_URL must be configured to verify Supabase Auth tokens.')
  }

  return normalizeSupabaseUrl(supabaseUrl)
}

function normalizeSupabaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')

  try {
    const url = new URL(trimmed)

    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new SupabaseAuthError(500, 'SUPABASE_URL must use https unless it points at localhost.')
    }

    return trimmed
  } catch (error) {
    if (error instanceof SupabaseAuthError) {
      throw error
    }

    throw new SupabaseAuthError(500, 'SUPABASE_URL must be a valid URL.', error)
  }
}

function getRemoteJwksForIssuer(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  const cached = remoteJwksByIssuer.get(issuer)

  if (cached) {
    return cached
  }

  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  remoteJwksByIssuer.set(issuer, jwks)

  return jwks
}

function getStringClaim(claims: JWTPayload, key: string): string | null {
  const value = claims[key]

  return isNonEmptyString(value) ? value : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
