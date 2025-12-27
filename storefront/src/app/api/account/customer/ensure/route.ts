export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { getCounter, getHistogram } from '@/lib/metrics'
import { storeFetch } from '@/lib/medusaServer'
import { signBridgeToken } from '@/lib/auth/signing'

function normalizeEmail(email?: string | null): string | undefined {
  if (!email) return undefined
  return String(email).trim().toLowerCase()
}

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) return undefined
  const digits = String(phone).trim().replace(/\D/g, '')
  return digits ? `+${digits}` : undefined
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = await req.json().catch(() => ({} as any))
    const rawEmail: string | undefined = body?.email
    const rawPhone: string | undefined = body?.phone
    const formData: any = body?.formData // Checkout form data with customer name and address
    const cart_id: string | undefined = body?.cart_id // Cart ID to link to customer
    const order_id: string | undefined = body?.order_id // Order ID to link to customer
    // IMPORTANT: authMethod tells us how the user actually authenticated
    // 'email' = magic link, 'whatsapp' = OTP
    // This is different from the delivery phone in formData
    const authMethod: 'email' | 'whatsapp' | undefined = body?.authMethod

    let email = normalizeEmail(rawEmail)
    // Try to get phone from direct field or from formData
    let phone = normalizePhone(rawPhone) || normalizePhone(formData?.phone)

    // Generate placeholder email from phone if email is missing (phone-only auth)
    if (!email && phone) {
      const digits = phone.replace(/\D/g, '')
      if (digits) {
        email = `${digits}@guest.local`
      }
    }

    // For email-only auth, we don't generate a placeholder phone
    // The backend now supports creating customers with just email

    if (!email && !phone) {
      try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch { }
      return new Response(JSON.stringify({ ok: false, error: 'identifier_required', message: 'Provide an email or phone to continue.' }), { status: 400 })
    }

    // Use form data if available, otherwise use defaults
    const firstName = formData?.first_name || 'Customer'
    const lastName = formData?.last_name || ''
    const addresses = formData?.address ? [formData.address] : []

    // Generate a customer JWT token for authentication
    // The customer has already verified OTP/magic link before this endpoint is called
    const subject = phone || email
    if (!subject) {
      return new Response(JSON.stringify({ ok: false, error: 'identifier_required' }), { status: 400 })
    }

    // Sign a JWT token for this customer
    const jwtToken = await signBridgeToken({
      sub: subject,
      otpOK: Boolean(phone),
      magicOK: Boolean(email && !phone),
      mfaComplete: true,
      purpose: 'customer.ensure',
    })

    if (!jwtToken) {
      console.error('[ENSURE_CUSTOMER][JWT_SIGN_FAILED] Unable to sign JWT token - AUTH_SIGNING_JWK may be missing')
      return new Response(JSON.stringify({ ok: false, error: 'jwt_signing_failed' }), { status: 500 })
    }

    // Call the backend find-or-create endpoint with customer JWT token
    // Use authMethod to correctly determine authentication type
    // authMethod comes from the verify route and tells us the ACTUAL auth method used
    const isEmailAuth = authMethod === 'email' || (!authMethod && email && !rawPhone)
    const isWhatsAppAuth = authMethod === 'whatsapp' || (!authMethod && rawPhone)

    const payload: Record<string, any> = {
      first_name: firstName,
      last_name: lastName,
      // Use explicit auth method - don't infer from phone presence
      // The phone in formData is for DELIVERY, not authentication
      whatsapp_authenticated: isWhatsAppAuth,
      email_authenticated: isEmailAuth,
      identity_method: isWhatsAppAuth ? 'phone' : 'email',
    }
    // Only pass phone if it was actually used for authentication OR if user provided it for delivery
    if (phone) payload.phone = phone
    if (email) payload.email = email
    if (addresses.length > 0) payload.addresses = addresses
    if (cart_id) payload.cart_id = cart_id // Link cart to customer
    if (order_id) payload.order_id = order_id // Link order to customer

    const res = await storeFetch('/store/custom/customer/find-or-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      bearerToken: jwtToken, // Use customer JWT token instead of admin token
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[ENSURE_CUSTOMER][BACKEND_ERROR]', { status: res.status, body: text?.slice?.(0, 200) })
      try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch { }
      return new Response(JSON.stringify({ ok: false, error: 'backend_error', message: 'Unable to ensure your account. Please try again.' }), { status: res.status })
    }

    const json = await res.json().catch(() => ({}))

    // Backend returns { customer_id: "cus_xxx", created: true, ... }
    const customerId = json?.customer_id

    if (!customerId) {
      console.error('[ENSURE_CUSTOMER][NO_CUSTOMER_ID]', { response: json })
      try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch { }
      return new Response(JSON.stringify({ ok: false, error: 'no_customer_id', message: 'Backend did not return a customer ID.' }), { status: 500 })
    }

    try { const c = await getCounter({ name: 'account_ensure_success_total', help: 'Ensure customer successes' }); c.inc() } catch { }
    try { const h = await getHistogram({ name: 'account_ensure_latency_ms', help: 'Ensure customer latency (ms)' }); h.observe(Date.now() - startedAt) } catch { }

    return new Response(JSON.stringify({ ok: true, customerId, created: json?.created || false }), { status: 200 })
  } catch (e: any) {
    console.error('[ACCOUNT_ENSURE][ERROR]', e?.message || e)
    try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch { }
    try { const h = await getHistogram({ name: 'account_ensure_latency_ms', help: 'Ensure customer latency (ms)' }); h.observe(Date.now() - startedAt) } catch { }
    return new Response(JSON.stringify({ ok: false, error: 'internal_error', message: 'Unable to ensure your account at the moment. Please try again.' }), { status: 500 })
  }
}
