import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getCounter, getHistogram } from '@/lib/metrics'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'nodejs'

const BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'

async function getCustomerIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions as any)
    if (!session || !(session as any)?.customerId) {
      return null
    }
    return (session as any).customerId
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/orders][GET] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_orders_failure_total', help: 'Account orders failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }

  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  console.log('[ORDERS_TOKEN_DEBUG]', { hasToken: !!token, tokenPrefix: token?.slice(0, 20) })
  if (!token) {
    console.error('[ORDERS_TOKEN_ERROR]', 'Failed to generate bridge token - check AUTH_SIGNING_JWK')
    try { const c = await getCounter({ name: 'account_orders_failure_total', help: 'Account orders failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'auth_failed', message: 'JWT signing not configured' }), { status: 500 })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limit = url.searchParams.get('limit')
  const search = url.searchParams.get('search')
  
  const queryParams = new URLSearchParams()
  if (cursor) queryParams.set('cursor', cursor)
  if (limit) queryParams.set('limit', limit)
  if (search) queryParams.set('search', search)
  
  const endpoint = `/store/custom/orders${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
  const res = await storeFetch(endpoint, { 
    bearerToken: token,
    headers: { 'Accept': 'application/json' }
  })
  
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[ORDERS_FETCH_ERROR]', { status: res.status, body: text?.slice?.(0, 200) })
    try { const c = await getCounter({ name: 'account_orders_failure_total', help: 'Account orders failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'fetch_failed' }), { status: res.status })
  }
  
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_orders_latency_ms', help: 'Account orders latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } })
}


