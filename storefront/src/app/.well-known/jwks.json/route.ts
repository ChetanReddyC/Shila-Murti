import type { NextRequest } from 'next/server'

export const runtime = 'edge'

/**
 * JWKS (JSON Web Key Set) endpoint that exposes the public key for JWT verification.
 * The backend uses this endpoint to verify tokens signed by the storefront.
 */
export async function GET(req: NextRequest) {
  try {
    const jwkPrivateRaw = process.env.AUTH_SIGNING_JWK
    if (!jwkPrivateRaw) {
      console.error('[JWKS] AUTH_SIGNING_JWK environment variable is not configured')
      return new Response(
        JSON.stringify({ error: 'JWKS not configured' }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const jwk = JSON.parse(jwkPrivateRaw)
    
    // Extract public key components (remove private key material)
    const publicJwk: any = {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg || 'RS256',
      use: 'sig',
      kid: jwk.kid || process.env.AUTH_JWKS_KID || 'dev-2024-01-01',
    }

    // Return JWKS format (array of keys)
    const jwks = {
      keys: [publicJwk]
    }

    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('[JWKS] Error generating JWKS:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate JWKS' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
