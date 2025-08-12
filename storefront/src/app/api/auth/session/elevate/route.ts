import type { NextRequest } from 'next/server'

// This endpoint elevates the app session by acknowledging OTP + magic verifications.
// It binds the identifier to a lightweight cookie via next-auth signIn client call.

export async function POST(req: NextRequest) {
  const { phone, email } = await req.json().catch(() => ({}))
  const id = phone || email
  if (!id) return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })

  // After combo-MFA success, ensure Medusa customer exists and bind its id for downstream proxies
  try {
    const ensure = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/account/customer/ensure`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone }),
    })
    const ej = await ensure.json().catch(() => ({}))
    if (!ensure.ok) {
      return new Response(JSON.stringify({ ok: false, error: ej?.error || 'ensure_failed' }), { status: ensure.status })
    }
    return new Response(JSON.stringify({ ok: true, identifier: id, customerId: ej.customerId }), { status: 200 })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'ensure_failed' }), { status: 500 })
  }
}


