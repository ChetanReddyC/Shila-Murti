export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { getCounter, getHistogram } from '@/lib/metrics'
import { randomUUID } from 'crypto'
import { storeFetch } from '@/lib/medusaServer'

type MedusaCustomer = {
  id: string
  email?: string | null
  metadata?: Record<string, any> | null
}

type AdminListResponse = { customers?: MedusaCustomer[]; count?: number }
type AdminGetResponse = { customer?: MedusaCustomer }

const BASE_URL = process.env.MEDUSA_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
const ADMIN_TOKEN = (process.env.MEDUSA_ADMIN_TOKEN || '').replace(/^Bearer\s+/i, '')
let adminAvailable = Boolean(ADMIN_TOKEN)

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  }
  if (ADMIN_TOKEN) {
    headers['x-medusa-access-token'] = ADMIN_TOKEN
  }
  return headers
}

function normalizeEmail(email?: string | null): string | undefined {
  if (!email) return undefined
  return String(email).trim().toLowerCase()
}

function normalizePhoneCandidates(input?: string | null): string[] {
  if (!input) return []
  const raw = String(input).trim()
  const digits = raw.replace(/\D/g, '')
  const candidates = new Set<string>()
  if (raw) candidates.add(raw)
  if (digits) candidates.add(digits)
  if (digits) candidates.add(`+${digits}`)
  return Array.from(candidates)
}

async function adminGetJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  if (!adminAvailable) {
    throw new Error('admin_unavailable')
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...(init || {}), headers: adminHeaders((init?.headers as any) || {}) })
  if (res.status === 401 || res.status === 403) {
    adminAvailable = false
    throw new Error('admin_unauthorized')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Medusa admin HTTP ${res.status} ${res.statusText} for ${path} :: ${text}`)
  }
  return (await res.json()) as T
}

async function findCustomerByEmail(email: string): Promise<MedusaCustomer | null> {
  const qs = new URLSearchParams()
  qs.set('limit', '10')
  qs.set('email', email)
  const data = await adminGetJson<AdminListResponse>(`/admin/customers?${qs.toString()}`)
  const items = Array.isArray(data.customers) ? data.customers : []
  const target = normalizeEmail(email)
  return items.find((c) => normalizeEmail(c.email) === target) || null
}

async function getCustomer(id: string): Promise<MedusaCustomer | null> {
  const data = await adminGetJson<AdminGetResponse>(`/admin/customers/${id}`)
  return data.customer || null
}

async function findCustomerByPhone(phone: string): Promise<MedusaCustomer | null> {
  const candidates = normalizePhoneCandidates(phone)
  if (candidates.length === 0) return null
  // Try a broad search using q= and then verify metadata.phone on each candidate result
  for (const probe of candidates) {
    const qs = new URLSearchParams()
    qs.set('limit', '20')
    qs.set('q', probe)
    let list: AdminListResponse | null = null
    try {
      list = await adminGetJson<AdminListResponse>(`/admin/customers?${qs.toString()}`)
    } catch {
      list = { customers: [] }
    }
    const items = Array.isArray(list?.customers) ? list!.customers! : []
    for (const c of items) {
      const full = await getCustomer(c.id)
      const metaPhone = full?.metadata?.phone || full?.metadata?.phone_normalized
      const metaCandidates = normalizePhoneCandidates(String(metaPhone || ''))
      const match = metaCandidates.some((mp) => candidates.includes(mp))
      if (match && full) return full
    }
  }
  return null
}

async function createCustomer(payload: { email: string; phone?: string }): Promise<MedusaCustomer> {
  if (!adminAvailable) throw new Error('admin_unavailable')
  const body: any = {}
  body.email = normalizeEmail(payload.email)
  if (payload.phone) {
    body.phone = payload.phone
  }
  const meta: Record<string, any> = {}
  if (payload.phone) {
    meta.phone = payload.phone
    const digits = payload.phone.replace(/\D/g, '')
    if (digits) meta.phone_normalized = digits
  }
  if (Object.keys(meta).length > 0) body.metadata = meta
  const res = await fetch(`${BASE_URL}/admin/customers`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  })
  if (res.status === 401 || res.status === 403) {
    adminAvailable = false
    throw new Error('admin_unauthorized')
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Medusa admin create customer failed: HTTP ${res.status} ${txt}`)
  }
  const json = (await res.json().catch(() => ({}))) as AdminGetResponse
  if (!json?.customer?.id) throw new Error('create_customer_no_id')
  return json.customer
}

async function updateCustomer(id: string, payload: { email?: string; phone?: string }): Promise<MedusaCustomer> {
  const body: any = {}
  if (payload.email) body.email = normalizeEmail(payload.email)
  if (payload.phone) {
    body.metadata = body.metadata || {}
    body.metadata.phone = payload.phone
    const digits = payload.phone.replace(/\D/g, '')
    if (digits) body.metadata.phone_normalized = digits
  }
  const res = await fetch(`${BASE_URL}/admin/customers/${id}`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(body),
  })
  if (res.status === 401 || res.status === 403) {
    adminAvailable = false
    throw new Error('admin_unauthorized')
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Medusa admin update customer failed: HTTP ${res.status} ${txt}`)
  }
  const json = (await res.json().catch(() => ({}))) as AdminGetResponse
  return json.customer || { id }
}

async function ensureViaStore(input: { email?: string; phone?: string }): Promise<MedusaCustomer | null> {
  const payload: Record<string, any> = {
    first_name: 'Customer',
    last_name: 'User',
    whatsapp_authenticated: Boolean(input.phone),
    email_authenticated: Boolean(input.email && !input.phone),
    identity_method: input.phone ? 'phone' : 'email',
  }
  if (input.phone) payload.phone = input.phone
  if (input.email) payload.email = input.email
  const res = await storeFetch('/store/custom/customer/find-or-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[ensureViaStore][fallback][fail]', { status: res.status, body: text?.slice?.(0, 200) })
    return null
  }
  const json = await res.json().catch(() => ({}))
  const customer = json?.customer
  if (customer?.id) {
    return { id: customer.id, email: customer.email, metadata: customer.metadata }
  }
  return null
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = await req.json().catch(() => ({} as any))
    const rawEmail: string | undefined = body?.email
    const rawPhone: string | undefined = body?.phone

    let email = normalizeEmail(rawEmail)
    const phone = typeof rawPhone === 'string' ? rawPhone.trim() : undefined
    if (!email && phone) {
      // Generate a deterministic placeholder email from the phone number that matches backend logic
      const digits = phone.replace(/\D/g, '')
      if (digits) {
        email = `${digits}@guest.local`
      }
    }
    if (!email && !phone) {
      try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch {}
      return new Response(JSON.stringify({ ok: false, error: 'identifier_required', message: 'Provide an email or phone to continue.' }), { status: 400 })
    }

    let byEmail: MedusaCustomer | null = null
    let byPhone: MedusaCustomer | null = null

    if (email) {
      try { byEmail = await findCustomerByEmail(email) } catch {}
    }
    if (phone) {
      try { byPhone = await findCustomerByPhone(phone) } catch {}
    }

    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch {}
      // Email already belongs to another account
      return new Response(JSON.stringify({ ok: false, error: 'email_already_exists', message: 'This email is already associated with another account.' }), { status: 409 })
    }

    let customer: MedusaCustomer | null = byEmail || byPhone || null
    if (!customer) {
      try {
        if (!adminAvailable) throw new Error('admin_unavailable')
        customer = await createCustomer({ email: email!, phone })
      } catch (e: any) {
        customer = await ensureViaStore({ email, phone })
        if (!customer) {
          const fallback = email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`
          return new Response(JSON.stringify({ ok: true, customerId: fallback, created: false, warning: 'admin_unavailable' }), { status: 200 })
        }
      }
    } else {
      // Backfill missing identifiers if safe
      const needsEmail = !normalizeEmail(customer.email) && email
      const existingMetaPhone = customer.metadata?.phone || customer.metadata?.phone_normalized
      const needsPhone = phone && !normalizePhoneCandidates(String(existingMetaPhone || '')).length
      if ((needsEmail || needsPhone) && adminAvailable) {
        try {
          customer = await updateCustomer(customer.id, { email: needsEmail ? email : undefined, phone: needsPhone ? phone : undefined })
        } catch (e) {
          adminAvailable = false
          const fallbackCustomer = await ensureViaStore({ email, phone })
          if (fallbackCustomer) customer = fallbackCustomer
        }
      }
    }

    try { const c = await getCounter({ name: 'account_ensure_success_total', help: 'Ensure customer successes' }); c.inc() } catch {}
    try { const h = await getHistogram({ name: 'account_ensure_latency_ms', help: 'Ensure customer latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
    return new Response(JSON.stringify({ ok: true, customerId: customer.id || (email ? String(email).toLowerCase() : `+${String(phone).replace(/\D/g,'')}`) }), { status: 200 })
  } catch (e: any) {
    console.error('[ACCOUNT_ENSURE][ERROR]', e?.message || e)
    try { const c = await getCounter({ name: 'account_ensure_failure_total', help: 'Ensure customer failures' }); c.inc() } catch {}
    try { const h = await getHistogram({ name: 'account_ensure_latency_ms', help: 'Ensure customer latency (ms)' }); h.observe(Date.now() - startedAt) } catch {}
    return new Response(JSON.stringify({ ok: false, error: 'internal_error', message: 'Unable to ensure your account at the moment. Please try again.' }), { status: 500 })
  }
}


