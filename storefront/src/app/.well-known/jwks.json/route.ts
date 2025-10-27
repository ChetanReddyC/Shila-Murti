import type { NextRequest } from 'next/server'

// Use Node.js runtime instead of edge for better compatibility
export const runtime = 'nodejs'

// Cache the JWKS at module level to avoid re-parsing on every request
let cachedJwks: any = null
let cacheTime: number = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * JWKS (JSON Web Key Set) endpoint that exposes the public key for JWT verification.
 * The backend uses this endpoint to verify tokens signed by the storefront.
 * OPTIMIZED: Uses module-level caching to respond instantly
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Check if we have a valid cached JWKS
    if (cachedJwks && (Date.now() - cacheTime) < CACHE_TTL_MS) {
      console.log('[JWKS] Returning cached JWKS (response time: <1ms)')
      return new Response(JSON.stringify(cachedJwks), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT',
        },
      })
    }
    
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

    // Cache for future requests
    cachedJwks = jwks
    cacheTime = Date.now()
    
    const responseTime = Date.now() - startTime
    console.log(`[JWKS] Generated and cached new JWKS (response time: ${responseTime}ms)`)

    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    const responseTime = Date.now() - startTime
    console.error(`[JWKS] Error generating JWKS (took ${responseTime}ms):`, error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate JWKS' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
