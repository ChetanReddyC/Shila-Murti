export const runtime = 'edge'

function getNowSeconds() { return Math.floor(Date.now() / 1000) }

async function getSigner() {
  const jwkPrivate = process.env.AUTH_SIGNING_JWK
  if (!jwkPrivate) return null
  try {
    const jose = await import('jose')
    const parsed = JSON.parse(jwkPrivate) as any
    const key = await jose.importJWK(parsed, 'RS256')
    const kid = parsed?.kid || process.env.AUTH_JWKS_KID || 'dev-2024-01-01'
    return { key, kid }
  } catch {
    return null
  }
}

export async function POST() {
  const signer = await getSigner()
  if (!signer) {
    // Fallback for dev if signing not configured
    return new Response(JSON.stringify({ token: null, error: 'signing_not_configured' }), { status: 200 })
  }

  const now = getNowSeconds()
  const payload = {
    sub: 'demo-user',
    comboRequired: false,
    otpOK: true,
    magicOK: true,
    mfaComplete: true,
    iat: now,
    exp: now + 15 * 60,
    jti: crypto.randomUUID(),
  }

  const jose = await import('jose')
  const token = await new jose.SignJWT(payload as any)
    .setProtectedHeader({ alg: 'RS256', kid: signer.kid })
    .setIssuer(process.env.AUTH_ISSUER || 'storefront')
    .setAudience(process.env.AUTH_AUDIENCE || 'medusa')
    .setIssuedAt(now)
    .setExpirationTime('15m')
    .sign(signer.key)

  return new Response(JSON.stringify({ token }), { status: 200 })
}


