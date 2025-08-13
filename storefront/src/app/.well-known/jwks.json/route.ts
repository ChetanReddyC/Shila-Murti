import type { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(_req: NextRequest) {
  const jwkPrivateRaw = process.env.AUTH_SIGNING_JWK
  if (!jwkPrivateRaw) {
    return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const jose = await import('jose')
    const parsed = JSON.parse(jwkPrivateRaw) as any
    const pub = await jose.importJWK(parsed, 'RS256')
    const pubJwk = await jose.exportJWK(pub)
    const kid = parsed?.kid || process.env.AUTH_JWKS_KID || 'dev-2024-01-01'
    const jwkWithKid = { ...pubJwk, kid, alg: 'RS256', use: 'sig', kty: (pubJwk as any).kty }
    return new Response(JSON.stringify({ keys: [jwkWithKid] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}

export const runtime = 'edge'

function buildJwks(): { keys: any[] } {
  try {
    // Prefer explicit public JWKS if provided (useful in tests and certain deployments)
    const jwksRaw = process.env.AUTH_PUBLIC_JWKS
    if (jwksRaw) {
      try {
        const parsed = JSON.parse(jwksRaw)
        if (parsed && Array.isArray(parsed.keys)) return { keys: parsed.keys }
      } catch {}
    }

    const jwkPrivateRaw = process.env.AUTH_SIGNING_JWK
    if (!jwkPrivateRaw) return { keys: [] }
    const parsed = JSON.parse(jwkPrivateRaw) as Record<string, any>
    const kid = parsed?.kid || process.env.AUTH_JWKS_KID || 'dev-2024-01-01'
    // Derive a public JWK from the private one by stripping private params
    const { kty, n, e } = parsed
    if (!kty || !n || !e) return { keys: [] }
    const publicJwk: Record<string, any> = {
      kty,
      n,
      e,
      kid,
      alg: parsed?.alg || 'RS256',
      use: parsed?.use || 'sig',
    }
    return { keys: [publicJwk] }
  } catch {
    return { keys: [] }
  }
}

export async function GET() {
  const jwks = buildJwks()
  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Allow public caching for a short time; adjust as needed
      'Cache-Control': 'public, max-age=60',
    },
  })
}


