export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { kvGet, kvDel, kvSet } from '@/lib/kv'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'

async function ensureCustomerIdFromBody(body: any): Promise<string | null> {
  let email: string | undefined = body?.email
  let phone: string | undefined = body?.phone
  if (!email && !phone && body?.userId) {
    const candidate = String(body.userId)
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
    if (!res.ok || !json?.customerId) return null
    return String(json.customerId)
  } catch { return null }
}

function normalizeCandidatesFromBody(body: any): string[] {
  const candidates: string[] = []
  const add = (v?: string) => { if (v) candidates.push(v) }
  add(body?.userId && String(body.userId))
  add(body?.email && String(body.email).toLowerCase())
  if (body?.phone) {
    const raw = String(body.phone)
    const digits = raw.replace(/\D/g, '')
    add(raw)
    add(digits)
    add(digits ? `+${digits}` : '')
  }
  // historical demo id
  add('demo-user')
  return Array.from(new Set(candidates.filter(Boolean)))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  let cid = await ensureCustomerIdFromBody(body)
  if (!cid) {
    // Fallback to a deterministic id when ensure failed (e.g., admin 401)
    if (body?.email) cid = String(body.email).toLowerCase()
    else if (body?.phone) {
      const digits = String(body.phone).replace(/\D/g,'')
      cid = digits ? `+${digits}` : String(body.phone)
    }
  }
  const rawCandidates = normalizeCandidatesFromBody(body)
  if (!cid || !body?.id) return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_id' }), { status: 200 })

  const auth = await kvGet<{ challenge: string }>(`webauthn:auth:${cid}`)
  if (!auth?.challenge) return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_challenge' }), { status: 200 })

  // Load stored authenticator for this credential id
  let credRecord = await kvGet<{ credentialID: string; credentialPublicKey: string; counter: number }>(`webauthn:cred:${cid}:${body.id}`)
  // Fallback: search older namespaces and migrate if found
  if (!credRecord) {
    for (const cand of rawCandidates) {
      const rec = await kvGet<{ credentialID: string; credentialPublicKey: string; counter: number }>(`webauthn:cred:${cand}:${body.id}`)
      if (rec) {
        credRecord = rec
        try { await kvSet(`webauthn:cred:${cid}:${body.id}`, rec) } catch {}
        break
      }
    }
  }
  if (!credRecord) return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_credential' }), { status: 200 })

  const b64urlToBuf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: auth.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: b64urlToBuf(credRecord.credentialID),
      credentialPublicKey: b64urlToBuf(credRecord.credentialPublicKey),
      counter: credRecord.counter || 0,
      transports: ['internal'],
    },
    requireUserVerification: true,
  })

  await kvDel(`webauthn:auth:${cid}`)
  if (!verification.verified) return new Response(JSON.stringify({ comboRequired: true }), { status: 200 })

  // Update counter
  const newCounter = verification.authenticationInfo?.newCounter
  if (typeof newCounter === 'number') {
    await kvSet(`webauthn:cred:${cid}:${body.id}` , { ...credRecord, counter: newCounter })
  }

  // Successful platform passkey auth: skip combo-MFA
  // Also provide a minimal descriptor so the client can refresh passkey lists immediately
  return new Response(JSON.stringify({ comboRequired: false, credentialId: body.id, counter: newCounter ?? credRecord.counter }), { status: 200 })
}


