import type { ExecArgs } from "@medusajs/framework/types";
import { normalizePhoneNumber } from "../utils/phoneNormalization";
import { buildAdminAuthHeaders } from "../utils/adminAuthHeaders";

type AdminOrder = {
  id: string
  email?: string | null
  customer_id?: string | null
  customer?: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null } | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
  } | null
  metadata?: Record<string, any> | null
  created_at?: string
};

type AdminCustomer = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  metadata?: Record<string, any> | null
};

type AdminListOrdersResponse = { orders?: AdminOrder[]; count?: number; offset?: number; limit?: number }
type AdminListCustomersResponse = { customers?: AdminCustomer[]; count?: number }
type AdminGetCustomerResponse = { customer?: AdminCustomer }
type AdminGetOrderResponse = { order?: AdminOrder }

function getEnv(name: string, fallback?: string): string {
  const v = (process.env as any)[name]
  return (typeof v === 'string' && v.length > 0) ? v : (fallback || '')
}

function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return false
  return /@guest\.local$/i.test(String(email).trim())
}

function digits(input?: string | null): string {
  return (input || '').replace(/\D/g, '')
}

async function adminGet<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: buildAdminAuthHeaders(token, {
      'Accept': 'application/json',
    }),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Admin GET ${path} -> ${res.status} ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function adminPost<T>(baseUrl: string, token: string, path: string, body: any): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: buildAdminAuthHeaders(token, {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Admin POST ${path} -> ${res.status} ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function listRecentOrders(baseUrl: string, token: string, limit: number): Promise<AdminOrder[]> {
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  qs.set('offset', '0')
  // Request expanded customer and address fields
  qs.set('fields', '*customer,*shipping_address')
  const data = await adminGet<AdminListOrdersResponse>(baseUrl, token, `/admin/orders?${qs.toString()}`)
  return Array.isArray(data.orders) ? data.orders : []
}

async function findCustomerByEmail(baseUrl: string, token: string, email: string): Promise<AdminCustomer | null> {
  const qs = new URLSearchParams()
  qs.set('limit', '10')
  qs.set('email', String(email).trim().toLowerCase())
  const data = await adminGet<AdminListCustomersResponse>(baseUrl, token, `/admin/customers?${qs.toString()}`)
  const items = Array.isArray(data.customers) ? data.customers : []
  return items[0] || null
}

async function getCustomer(baseUrl: string, token: string, id: string): Promise<AdminCustomer | null> {
  const data = await adminGet<AdminGetCustomerResponse>(baseUrl, token, `/admin/customers/${id}`)
  return data.customer || null
}

async function searchCustomersByPhone(baseUrl: string, token: string, phone: string): Promise<AdminCustomer | null> {
  const normalized = normalizePhoneNumber(phone)
  const phoneDigits = digits(normalized)
  if (!phoneDigits) return null

  const qs = new URLSearchParams()
  qs.set('limit', '20')
  qs.set('q', phoneDigits)
  const list = await adminGet<AdminListCustomersResponse>(baseUrl, token, `/admin/customers?${qs.toString()}`)
  const candidates = Array.isArray(list.customers) ? list.customers : []

  for (const c of candidates) {
    const full = await getCustomer(baseUrl, token, c.id)
    const metaPhone = full?.metadata?.phone || full?.metadata?.phone_normalized || full?.phone || ''
    const metaDigits = digits(String(metaPhone))
    if (metaDigits && (metaDigits === phoneDigits || metaDigits.endsWith(phoneDigits) || phoneDigits.endsWith(metaDigits))) {
      return full
    }
    // Also accept placeholder email that embeds phone digits
    const emailDigits = digits(String(full?.email || ''))
    if (emailDigits && (emailDigits === phoneDigits || emailDigits.endsWith(phoneDigits))) {
      return full
    }
  }
  return null
}

async function tryLinkOrderToCustomer(baseUrl: string, token: string, orderId: string, customerId: string): Promise<boolean> {
  try {
    await adminPost<AdminGetOrderResponse>(baseUrl, token, `/admin/orders/${orderId}`, { customer_id: customerId })
    return true
  } catch (e) {
    return false
  }
}

export default async function reconcileOrders({}: ExecArgs) {
  const args = process.argv.slice(2)
  const baseIdx = args.findIndex((a) => a === '--base')
  const cliBase = baseIdx >= 0 && args[baseIdx + 1] ? String(args[baseIdx + 1]) : undefined
  const tokenIdx = args.findIndex((a) => a === '--token')
  const cliToken = tokenIdx >= 0 && args[tokenIdx + 1] ? String(args[tokenIdx + 1]) : undefined
  const apply = args.includes('--apply')
  const limitIdx = args.findIndex((a) => a === '--limit')
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? Math.max(1, Math.min(500, Number(args[limitIdx + 1]))) : 50

  const baseUrl = (cliBase || getEnv('MEDUSA_BASE_URL', 'http://localhost:9000')).replace(/\/?$/,'')
  const adminToken = cliToken || getEnv('MEDUSA_ADMIN_TOKEN')

  if (!adminToken) {
    console.log('[ReconcileOrders] MEDUSA_ADMIN_TOKEN not set. Provide one of:')
    console.log('  - Set MEDUSA_ADMIN_TOKEN in backend/.env and re-run')
    console.log('  - Or pass via CLI: --token <YOUR_ADMIN_TOKEN>')
    return
  }

  console.log(`[ReconcileOrders] Base URL: ${baseUrl}`)
  console.log(`[ReconcileOrders] Fetching last ${limit} orders...`)

  const orders = await listRecentOrders(baseUrl, adminToken, limit)
  const diagnostics: any[] = []

  let missingCount = 0
  let fixedCount = 0
  for (const ord of orders) {
    const hasLink = Boolean(ord.customer_id)
    const placeholder = isPlaceholderEmail(ord.email)
    const shippingPhone = ord.shipping_address?.phone || ord.metadata?.phone || ''

    const diag: any = {
      order_id: ord.id,
      created_at: ord.created_at,
      has_customer_id: hasLink,
      order_email: ord.email,
      email_is_placeholder: placeholder,
      shipping_phone: shippingPhone || null,
      suggested_customer_id: null as string | null,
      suggested_reason: null as string | null,
      action: null as string | null,
      success: false,
    }

    if (!hasLink) {
      missingCount++
      // Strategy 1: email match if not placeholder
      let candidate: AdminCustomer | null = null
      if (ord.email && !placeholder) {
        try { candidate = await findCustomerByEmail(baseUrl, adminToken, ord.email) } catch {}
        if (candidate) {
          diag.suggested_customer_id = candidate.id
          diag.suggested_reason = 'email_match'
        }
      }
      // Strategy 2: phone match
      if (!candidate && shippingPhone) {
        try { candidate = await searchCustomersByPhone(baseUrl, adminToken, shippingPhone) } catch {}
        if (candidate) {
          diag.suggested_customer_id = candidate.id
          diag.suggested_reason = 'phone_match'
        }
      }
      // Strategy 3: last_order_id customer metadata (from our earlier sync)
      if (!candidate && ord.id) {
        try {
          const qs = new URLSearchParams()
          qs.set('limit', '20')
          qs.set('q', ord.id)
          const list = await adminGet<AdminListCustomersResponse>(baseUrl, adminToken, `/admin/customers?${qs.toString()}`)
          const items = Array.isArray(list.customers) ? list.customers : []
          for (const c of items) {
            const full = await getCustomer(baseUrl, adminToken, c.id)
            const lastOrderId = full?.metadata?.last_order_id
            if (lastOrderId && String(lastOrderId) === ord.id) {
              candidate = full
              break
            }
          }
          if (candidate) {
            diag.suggested_customer_id = candidate.id
            diag.suggested_reason = 'metadata_last_order_id'
          }
        } catch {}
      }

      if (candidate && apply) {
        const ok = await tryLinkOrderToCustomer(baseUrl, adminToken, ord.id, candidate.id)
        diag.action = 'linked_order_to_customer'
        diag.success = ok
        if (ok) fixedCount++
      }
    }

    diagnostics.push(diag)
  }

  const summary = {
    scanned_orders: orders.length,
    orders_missing_customer: missingCount,
    fixes_applied: apply ? fixedCount : 0,
    mode: apply ? 'apply' : 'dry-run',
  }

  console.log('[ReconcileOrders] Summary:', summary)
  console.log('[ReconcileOrders] Sample diagnostics (first 10):')
  for (const row of diagnostics.slice(0, 10)) {
    console.log(row)
  }

  // Persist full JSON report
  try {
    const fs = await import('fs')
    const path = await import('path')
    const reportsDir = path.resolve(process.cwd(), 'reports')
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir)
    const file = path.join(reportsDir, `order-customer-diagnostics-${Date.now()}.json`)
    fs.writeFileSync(file, JSON.stringify({ summary, diagnostics }, null, 2), 'utf8')
    console.log(`[ReconcileOrders] Wrote detailed report to ${file}`)
  } catch {}
}


