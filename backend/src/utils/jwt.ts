import { jwtVerify, createRemoteJWKSet, JWTPayload } from "jose"

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

function getRemoteJwks() {
  if (!remoteJwks) {
    const jwksUrl = process.env.AUTH_JWKS_URL || "http://localhost:3000/.well-known/jwks.json"
    console.log('[JWT] Initializing JWKS from URL:', jwksUrl)
    remoteJwks = createRemoteJWKSet(new URL(jwksUrl))
  }
  return remoteJwks
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null
  const [scheme, token] = authorizationHeader.split(" ")
  if (!scheme || scheme.toLowerCase() !== "bearer") return null
  return token || null
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const jwks = getRemoteJwks()
    const { payload } = await jwtVerify(token, jwks, {
      issuer: process.env.AUTH_ISSUER || undefined,
      audience: process.env.AUTH_AUDIENCE || undefined,
    })
    // Only log customer ID in development to avoid exposing sensitive data
    if (process.env.NODE_ENV !== 'production') {
      console.log('[JWT][verifyAccessToken] Token verified successfully for sub:', (payload as any)?.sub)
    }
    return payload as unknown as AccessTokenClaims
  } catch (error) {
    const errMsg = (error as any)?.message || String(error)
    console.error('[JWT][verifyAccessToken][error]', {
      message: errMsg,
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_AUDIENCE,
      jwksUrl: process.env.AUTH_JWKS_URL || 'http://localhost:3000/.well-known/jwks.json'
    })
    throw error
  }
}


