import type { NextRequest } from 'next/server'
import { kvGet, kvListKeys } from '@/lib/kv'
import { getCounter, getHistogram } from '@/lib/metrics'

async function ensureCustomerId(identifier: { email?: string; phone?: string; userId?: string }): Promise<string | null> {
  if (identifier.userId) {
    return String(identifier.userId)
  }
  let email = identifier.email
  let phone = identifier.phone
  if (!email && !phone && identifier.userId) {
    const candidate = String(identifier.userId)
    if (candidate.includes('@')) email = candidate
    else phone = candidate
  }
  if (!email && !phone) return null
  try {
    const base = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
    const res = await fetch(`${base}/api/account/customer/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.customerId) {
      const id = (email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`)
      return id
    }
    return String(json.customerId)
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const body = await req.json().catch(() => ({}))
  const cid = await ensureCustomerId(body)
  if (!cid) return new Response(JSON.stringify({ error: 'missing_identifier' }), { status: 400 })

  // Primary: presence via maintained count flag
  const countKey = `webauthn:cred:count:${cid}`
  const existsKey = `webauthn:cred:exists:${cid}`
  const countStr = await kvGet<string>(countKey)
  const existsStr = await kvGet<string>(existsKey)
  let hasPasskey = false
  if (countStr && String(countStr) !== '0') {
    const count = parseInt(String(countStr), 10)
    if (!Number.isNaN(count) && count > 0) {
      hasPasskey = true
    }
  }
  if (!hasPasskey && existsStr && String(existsStr) !== '0') hasPasskey = true

  // Fallback: try listing credentials if provider supports it
  if (!hasPasskey) {
    try {
      const names = await kvListKeys(`webauthn:cred:${cid}:`, 1)
      if (Array.isArray(names) && names.length > 0) hasPasskey = true
    } catch {}
  }

  try { const h = await getHistogram({ name: 'auth_passkey_policy_latency_ms', help: 'Passkey policy latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  try { const c = await getCounter({ name: hasPasskey ? 'auth_passkey_available_total' : 'auth_passkey_unavailable_total', help: 'Passkey availability decisions' }); c.inc() } catch {}
  return new Response(JSON.stringify({ ok: true, hasPasskey, userId: cid }), { status: 200 })
}


