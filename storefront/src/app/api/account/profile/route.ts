import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getCounter, getHistogram } from '@/lib/metrics'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'edge'

const BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'

async function resolveCustomerIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions as any)
    const cid = (session as any)?.customerId
    return cid ? String(cid) : null
  } catch {
    return null
  }
}

async function callStore(path: string, init: RequestInit): Promise<Response> { return fetch(`${BASE_URL}${path}`, init) }

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await resolveCustomerIdFromSession()
  if (!customerId) {
    try { const c = await getCounter({ name: 'account_profile_failure_total', help: 'Account profile failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true, purpose: 'account.profile' })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
  const res = await storeFetch('/store/customers/me', { bearerToken: token })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_profile_latency_ms', help: 'Account profile latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}

export async function PATCH(req: NextRequest) {
  const startedAt = Date.now()
  const customerId = await resolveCustomerIdFromSession()
  if (!customerId) {
    try { const c = await getCounter({ name: 'account_profile_failure_total', help: 'Account profile failures' }); c.inc() } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 })
  }
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true, purpose: 'account.profile' })
  if (!token) return new Response(JSON.stringify({ ok: false, error: 'signing_not_configured' }), { status: 200 })
  const raw = await req.json().catch(() => ({}))
  // Allowlist fields
  const payload: any = {}
  if (typeof raw.first_name === 'string') payload.first_name = raw.first_name
  if (typeof raw.phone === 'string') payload.phone = raw.phone
  if (typeof raw.email === 'string') payload.email = raw.email
  const res = await storeFetch('/store/customers/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, bearerToken: token, body: JSON.stringify(payload) as any })
  const text = await res.text().catch(() => '')
  try { const h = await getHistogram({ name: 'account_profile_latency_ms', help: 'Account profile latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } })
}


