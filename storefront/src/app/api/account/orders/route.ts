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
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })

  const qs = new URLSearchParams()
  qs.set('fields', '*')

  const res = await storeFetch(`/store/orders?${qs.toString()}`, { bearerToken: token })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_orders_latency_ms', help: 'Account orders latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}


