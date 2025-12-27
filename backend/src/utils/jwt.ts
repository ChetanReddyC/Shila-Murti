import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose"
import { isTokenRevoked, areCustomerTokensRevoked } from "./jwtRevocation"

export interface AccessTokenClaims extends JWTPayload {
  sub: string
  comboRequired?: boolean
  otpOK?: boolean
  magicOK?: boolean
  mfaComplete?: boolean
}

let remoteJwks:
  | ReturnType<typeof createRemoteJWKSet>
  | null = null

// Custom fetch with longer timeout for localhost development
async function fetchWithTimeout(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  // Use longer timeout in development (30 seconds) vs production (10 seconds)
  const timeoutMs = process.env.NODE_ENV === 'development' ? 30000 : 10000

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`JWKS fetch timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

function getRemoteJwks() {
  if (!remoteJwks) {
    const jwksUrl = process.env.AUTH_JWKS_URL || "http://localhost:3000/.well-known/jwks.json"
    console.log('[JWT] Initializing JWKS from URL:', jwksUrl)

    // Use custom agent with longer timeout for localhost development
    remoteJwks = createRemoteJWKSet(new URL(jwksUrl), {
      // Custom headers to help with debugging
      headers: {
        'User-Agent': 'Medusa-Backend-JWT-Verifier',
      },
      // Cache the JWKS for 1 hour
      cooldownDuration: 3600000,
      cacheMaxAge: 3600000,
    })
  }
  return remoteJwks
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(" ")
  if (!scheme || scheme.toLowerCase() !== "bearer") return null
  return token || null
}

export async function verifyAccessToken(token: string, scope?: any): Promise<AccessTokenClaims> {
  const maxRetries = 3
  const retryDelayMs = 2000
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const jwks = getRemoteJwks()
      const { payload } = await jwtVerify(token, jwks, {
        issuer: process.env.AUTH_ISSUER || undefined,
        audience: process.env.AUTH_AUDIENCE || undefined,
      })

      // Check token revocation if scope is provided
      if (scope) {
        const jti = (payload as any)?.jti
        const customerId = payload.sub
        const iat = (payload as any)?.iat

        // Check individual token revocation
        if (jti && await isTokenRevoked(scope, jti)) {
          throw new Error('Token has been revoked')
        }

        // Check customer-wide token revocation
        if (customerId && iat && await areCustomerTokensRevoked(scope, customerId, iat)) {
          throw new Error('All customer tokens have been revoked')
        }
      }

      // Only log customer ID in development to avoid exposing sensitive data
      if (process.env.NODE_ENV !== 'production') {
        console.log('[JWT][verifyAccessToken] Token verified successfully for sub:', (payload as any)?.sub)
      }
      return payload as unknown as AccessTokenClaims
    } catch (error: any) {
      lastError = error
      const errMsg = error?.message || String(error)

      // Check if it's a timeout error - retry for these
      const isTimeout = errMsg.includes('timed out') || errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')

      if (isTimeout && attempt < maxRetries) {
        console.warn(`[JWT][verifyAccessToken] Attempt ${attempt}/${maxRetries} failed (timeout), retrying in ${retryDelayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        continue
      }

      console.error('[JWT][verifyAccessToken][error]', {
        message: errMsg,
        attempt,
        issuer: process.env.AUTH_ISSUER,
        audience: process.env.AUTH_AUDIENCE,
        jwksUrl: process.env.AUTH_JWKS_URL || 'http://localhost:3000/.well-known/jwks.json'
      })
      throw error
    }
  }

  throw lastError || new Error('JWT verification failed after retries')
}


