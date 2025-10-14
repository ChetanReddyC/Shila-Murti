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

async function callStore(path: string, init: RequestInit): Promise<Response> { return fetch(`${BASE_URL}${path}`, init) }

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/profile][GET] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_profile_failure_total', help: 'Account profile failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true, purpose: 'account.profile' })
  if (!token) {
    console.error('[account/profile][GET] Failed to sign bridge token - AUTH_SIGNING_JWK may be missing')
    return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 500 })
  }
  console.log('[account/profile][GET] Fetching customer profile for:', customerId)
  const res = await storeFetch('/store/customers/profile', { bearerToken: token })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    console.error('[account/profile][GET] Backend returned error:', { status: res.status, body: text.substring(0, 200) })
  }
  try { const h = await getHistogram({ name: 'account_profile_latency_ms', help: 'Account profile latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export async function PATCH(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await getCustomerIdFromSession()
  if (!customerId) {
    console.error('[account/profile][PATCH] Session expired or not authenticated')
    try { const c = await getCounter({ name: 'account_profile_failure_total', help: 'Account profile failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true, purpose: 'account.profile' })
  if (!token) {
    console.error('[account/profile][PATCH] Failed to sign bridge token - AUTH_SIGNING_JWK may be missing')
    return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 500 })
  }
  const raw = await req.json().catch(() => ({}))
  // Allowlist fields
  const payload: any = {}
  if (typeof raw.first_name === 'string') payload.first_name = raw.first_name
  if (typeof raw.phone === 'string') payload.phone = raw.phone
  if (typeof raw.email === 'string') payload.email = raw.email
  console.log('[account/profile][PATCH] Updating customer profile for:', customerId)
  const res = await storeFetch('/store/customers/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, bearerToken: token, body: JSON.stringify(payload) as any })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    console.error('[account/profile][PATCH] Backend returned error:', { status: res.status, body: text.substring(0, 200) })
  }
  try { const h = await getHistogram({ name: 'account_profile_latency_ms', help: 'Account profile latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}
