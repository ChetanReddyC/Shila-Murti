import type { NextRequest } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { kvGet, kvSet, kvDel } from '@/lib/kv'
import { getCounter, getHistogram } from '@/lib/metrics'

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'

async function ensureCustomerIdFromBody(identifier: { email?: string; phone?: string; userId?: string }): Promise<string | null> {
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

function normalizeCandidatesFromBody(body: any): string[] {
  const candidates = new Set<string>()
  
  // Add userId if present
  if (body?.userId) {
    candidates.add(String(body.userId))
  }
  
  // Add email if present (normalized)
  if (body?.email) {
    const email = String(body.email).toLowerCase()
    candidates.add(email)
  }
  
  // Add phone if present (in multiple formats)
  if (body?.phone) {
    const phone = String(body.phone)
    candidates.add(phone)
    
    // Add digits-only version
    const digits = phone.replace(/\D/g, '')
    if (digits) {
      candidates.add(digits)
      candidates.add(`+${digits}`)
    }
  }
  
  // Add demo-user for historical compatibility
  candidates.add('demo-user')
  
  return Array.from(candidates)
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
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
  if (!cid || !body?.id) {
    console.log('[Passkey Verify] Missing customer ID or credential ID:', { cid, bodyId: body?.id })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_id' }), { status: 200 })
  }

  // Enhanced validation: Check if the request contains all required fields
  if (!body.response || !body.response.authenticatorData || !body.response.clientDataJSON || !body.response.signature) {
    console.log('[Passkey Verify] Missing required authentication response fields:', { 
      hasAuthenticatorData: !!body.response?.authenticatorData,
      hasClientDataJSON: !!body.response?.clientDataJSON,
      hasSignature: !!body.response?.signature
    })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'invalid_response' }), { status: 200 })
  }

  const auth = await kvGet<{ challenge: string }>(`webauthn:auth:${cid}`)
  if (!auth?.challenge) {
    console.log('[Passkey Verify] Missing challenge for customer:', cid)
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_challenge' }), { status: 200 })
  }

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
  if (!credRecord) {
    console.log('[Passkey Verify] Missing credential record for:', { cid, credentialId: body.id })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'missing_credential' }), { status: 200 })
  }

  const b64urlToBuf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

  // Enhanced validation: Verify that the credential record contains all required fields
  if (!credRecord.credentialID || !credRecord.credentialPublicKey) {
    console.log('[Passkey Verify] Invalid credential record:', { 
      hasCredentialID: !!credRecord.credentialID,
      hasCredentialPublicKey: !!credRecord.credentialPublicKey
    })
    return new Response(JSON.stringify({ comboRequired: true, reason: 'invalid_credential' }), { status: 200 })
  }

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
  if (!verification.verified) {
    console.log('[Passkey Verify] Verification failed')
    try { const c = await getCounter({ name: 'auth_passkey_failure_total', help: 'Passkey verify failure total' }); c.inc() } catch {}
    return new Response(JSON.stringify({ comboRequired: true, reason: 'verification_failed' }), { status: 200 })
  }

  // Update counter
  const newCounter = verification.authenticationInfo?.newCounter
  if (typeof newCounter === 'number') {
    await kvSet(`webauthn:cred:${cid}:${body.id}` , { ...credRecord, counter: newCounter })
  }

  // Successful platform passkey auth: skip combo-MFA
  // Also provide a minimal descriptor so the client can refresh passkey lists immediately
  try { const h = await getHistogram({ name: 'auth_passkey_verify_latency_ms', help: 'Passkey verification latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
  try { const c = await getCounter({ name: 'auth_passkey_success_total', help: 'Passkey verify success total' }); c.inc() } catch {}
  
  const response = { comboRequired: false, hasPasskey: true, credentialId: body.id, counter: newCounter ?? credRecord.counter }
  console.log('[Passkey Verify] Success response:', response)
  return new Response(JSON.stringify(response), { status: 200 })
}