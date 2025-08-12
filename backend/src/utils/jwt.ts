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
  const jwks = getRemoteJwks()
  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env.AUTH_ISSUER || undefined,
    audience: process.env.AUTH_AUDIENCE || undefined,
  })
  return payload as unknown as AccessTokenClaims
}


