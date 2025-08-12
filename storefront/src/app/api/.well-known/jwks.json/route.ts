// Simple fixed JWKS for local development. In production, source from KMS/Vault
import type { NextRequest } from 'next/server'

// For demo: a single RSA key. Replace with KMS-managed rotated keys in prod.
// Public components only; private signing happens elsewhere (not implemented here).
const JWKS = {
  keys: [
    {
      kty: 'RSA',
      kid: process.env.AUTH_JWKS_KID || 'dev-2024-01-01',
      use: 'sig',
      n: process.env.AUTH_JWKS_N || 'sXlTQ9j2S7cQn0fE6t0qs8c0-demo-n',
      e: 'AQAB',
      alg: 'RS256',
    },
  ],
}

export const runtime = 'edge'

export async function GET(_req: NextRequest) {
  return new Response(JSON.stringify(JWKS), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}


