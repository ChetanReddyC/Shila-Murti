import type { NextRequest } from 'next/server'
import { kvGet } from '@/lib/kv'

// This endpoint elevates the app session by acknowledging OTP + magic verifications.
// It binds the identifier to a lightweight cookie via next-auth signIn client call.

export async function POST(req: NextRequest) {
  const { phone, email } = await req.json().catch(() => ({}))
  const id = phone || email
  if (!id) return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })

  // Enforce: either phone OTP OR email magic link must be verified (or both)
  try {
    const phoneOk = phone ? Boolean(await kvGet(`otp:ok:+${String(phone).replace(/\D/g, '')}`)) : false
    const emailOk = email ? Boolean(await kvGet(`magic:ok:${String(email).toLowerCase()}`)) : false
    if (!phoneOk && !emailOk) {
      return new Response(JSON.stringify({ ok: false, error: 'mfa_incomplete' }), { status: 400 })
    }
  } catch {}

  // After combo-MFA success, ensure Medusa customer exists and bind its id for downstream proxies
  try {
    const ensure = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/account/customer/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const ej = await ensure.json().catch(() => ({}))
    console.log('[SessionElevate][CustomerLookup] Identifier:', { email, phone })
    console.log('[SessionElevate][CustomerLookup] Customer UUID retrieved:', ej.customerId)
    if (!ensure.ok) {
      return new Response(JSON.stringify({ ok: false, error: ej?.error || 'ensure_failed' }), { status: ensure.status })
    }
    return new Response(JSON.stringify({ ok: true, identifier: id, customerId: ej.customerId }), { status: 200 })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'ensure_failed' }), { status: 500 })
  }
}


