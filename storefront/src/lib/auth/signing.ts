import type { JWTPayload, JWK } from 'jose'

export type BridgeClaims = JWTPayload & {
  sub: string
  comboRequired?: boolean
  otpOK?: boolean
  magicOK?: boolean
  mfaComplete?: boolean
  purpose?: string
}

async function importPrivateKey(): Promise<{ key: CryptoKey; kid: string } | null> {
  const jwkPrivateRaw = process.env.AUTH_SIGNING_JWK
  if (!jwkPrivateRaw) return null
  try {
    const jose = await import('jose')
    const parsed = JSON.parse(jwkPrivateRaw) as JWK & { kid?: string; alg?: string }
    const key = await jose.importJWK(parsed, parsed.alg || 'RS256')
    const kid = parsed.kid || process.env.AUTH_JWKS_KID || 'dev-2024-01-01'
    return { key, kid }
  } catch {
    return null
  }
}

export async function signBridgeToken(claims: BridgeClaims, expiresInSeconds = 15 * 60): Promise<string | null> {
  const signer = await importPrivateKey()
  if (!signer) return null
  const now = Math.floor(Date.now() / 1000)
  const iat = now
  const exp = now + expiresInSeconds

  const jose = await import('jose')
  const jwt = await new jose.SignJWT({ ...claims, iat, exp } as any)
    .setProtectedHeader({ alg: 'RS256', kid: signer.kid })
    .setIssuer(process.env.AUTH_ISSUER || 'storefront')
    .setAudience(process.env.AUTH_AUDIENCE || 'medusa')
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setJti(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    .sign(signer.key)
  return jwt
}


