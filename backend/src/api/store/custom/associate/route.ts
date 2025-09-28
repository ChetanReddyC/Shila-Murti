import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

/**
 * Server-side cart/order association using backend Admin token
 * POST /store/custom/associate
 * Body: { cart_id?: string, customer_id: string, order_id?: string }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { cart_id, customer_id, order_id } = (req.body as any) || {}

    if (!customer_id || typeof customer_id !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_customer_id' })
    }

    const adminToken = (process.env as any).MEDUSA_ADMIN_TOKEN || ''
    const base = (process.env as any).MEDUSA_BASE_URL || (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'

    if (!adminToken) {
      return res.status(200).json({ ok: false, skipped: true, reason: 'admin_token_missing' })
    }

    const results: any = { ok: true }

    // Associate cart -> customer prior to completion
    if (cart_id && typeof cart_id === 'string') {
      try {
        await fetch(`${base}/admin/carts/${cart_id}` as any, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
          body: JSON.stringify({ customer_id }),
        } as any)
        results.cart_associated = true
      } catch (e: any) {
        results.cart_associated = false
        results.cart_error = e?.message || String(e)
      }
    }

    // Optional: if an order id is present, attempt to force link as well
    if (order_id && typeof order_id === 'string') {
      try {
        await fetch(`${base}/admin/orders/${order_id}` as any, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
          body: JSON.stringify({ customer_id }),
        } as any)
        results.order_associated = true
      } catch (e: any) {
        results.order_associated = false
        results.order_error = e?.message || String(e)
      }
    }

    return res.status(200).json(results)
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message || String(e) })
  }
}


