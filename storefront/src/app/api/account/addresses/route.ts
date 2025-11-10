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
    console.error('[account/addresses] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  if (!token) {
    console.error('[ADDRESSES_TOKEN_ERROR]', 'Failed to generate bridge token')
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'auth_failed' }), { status: 401 })
  }

  // Use custom addresses endpoint that verifies JWT
  const res = await storeFetch('/store/custom/addresses', { bearerToken: token })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[ADDRESSES_FETCH_ERROR]', { status: res.status, body: text?.slice?.(0, 200) })
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'fetch_failed' }), { status: res.status })
  }
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_addresses_latency_ms', help: 'Account addresses latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/addresses] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
  const payload = await req.json().catch(() => ({}))
  const res = await storeFetch('/store/customers/me/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, bearerToken: token, body: JSON.stringify(payload) as any })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_addresses_latency_ms', help: 'Account addresses latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export async function PATCH(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/addresses] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
  const payload = await req.json().catch(() => ({}))
  const res = await storeFetch('/store/customers/me/addresses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, bearerToken: token, body: JSON.stringify(payload) as any })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_addresses_latency_ms', help: 'Account addresses latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export async function DELETE(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/addresses] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_addresses_failure_total', help: 'Account addresses failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
  const payload = await req.json().catch(() => ({}))
  const res = await storeFetch('/store/customers/me/addresses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, bearerToken: token, body: JSON.stringify(payload) as any })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_addresses_latency_ms', help: 'Account addresses latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}


