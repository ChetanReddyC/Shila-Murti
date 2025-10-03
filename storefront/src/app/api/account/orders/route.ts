import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getCounter, getHistogram } from '@/lib/metrics'

export const runtime = 'nodejs'

const BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'

function resolveCustomerId(req: NextRequest): string | null {
  const url = new URL(req.url)
  const qp = url.searchParams.get('customer_id')
  if (qp) return qp
  const hdr = req.headers.get('x-customer-id')
  if (hdr) return hdr
  return null
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = resolveCustomerId(req)
  if (!customerId) {
    try { const c = await getCounter({ name: 'account_orders_failure_total', help: 'Account orders failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
  }

  // Generate bridge token to authenticate as customer
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  console.log('[ORDERS_TOKEN_DEBUG]', { hasToken: !!token, tokenPrefix: token?.slice(0, 20) })
  if (!token) {
    console.error('[ORDERS_TOKEN_ERROR]', 'Failed to generate bridge token - check AUTH_SIGNING_JWK')
    try { const c = await getCounter({ name: 'account_orders_failure_total', help: 'Account orders failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'auth_failed', message: 'JWT signing not configured' }), { status: 500 })
  }

  // Use custom orders endpoint that verifies JWT
  const res = await storeFetch('/store/custom/orders', { 
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


