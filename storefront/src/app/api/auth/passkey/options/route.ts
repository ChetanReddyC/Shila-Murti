import type { NextRequest } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { kvSet } from '@/lib/kv'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'

async function ensureCustomerId(identifier: { email?: string; phone?: string; userId?: string }): Promise<string | null> {
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
      // Fallback: derive a stable canonical id from identifier when admin token is missing/unauthorized
      const id = (email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`)
      return id
    }
    return String(json.customerId)
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const cid = await ensureCustomerId(body)
  if (!cid) return new Response(JSON.stringify({ error: 'missing_identifier' }), { status: 400 })

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: [], // discoverable credentials → platform can find by user handle
  })
  await kvSet(`webauthn:auth:${cid}`, { challenge: options.challenge }, 5 * 60)
  return new Response(JSON.stringify({ options, userId: cid }), { status: 200 })
}


