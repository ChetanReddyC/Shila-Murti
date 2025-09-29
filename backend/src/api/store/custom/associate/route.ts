import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { buildAdminAuthHeaders } from "../../../../utils/adminAuthHeaders";

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
        let cartLinked = false
        try {
          const cartModuleService = req.scope.resolve(Modules.CART as any)
          if (cartModuleService && typeof cartModuleService.updateCarts === 'function') {
            await cartModuleService.updateCarts([{ id: cart_id, customer_id }])
            cartLinked = true
          }
        } catch (e: any) {
          results.cart_module_error = e?.message || String(e)
        }

        if (!cartLinked && adminToken?.trim()) {
          const response = await fetch(`${base}/admin/carts/${cart_id}` as any, {
            method: 'POST',
            headers: buildAdminAuthHeaders(adminToken, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ customer_id }),
          } as any)
          if (!response.ok) {
            const body = await response.text().catch(() => '')
            results.cart_associated = false
            results.cart_error = `status ${response.status}: ${body?.slice(0, 500) || 'unknown'}`
          } else {
            results.cart_associated = true
          }
        } else {
          results.cart_associated = true
        }
      } catch (e: any) {
        results.cart_associated = false
        results.cart_error = e?.message || String(e)
      }
    }

    // Optional: if an order id is present, attempt to force link as well
    if (order_id && typeof order_id === 'string') {
      try {
        let orderLinked = false
        try {
          const orderModuleService = req.scope.resolve(Modules.ORDER as any)
          if (orderModuleService && typeof orderModuleService.updateOrders === 'function') {
            await orderModuleService.updateOrders(order_id, { customer_id })
            orderLinked = true
          }
        } catch (e: any) {
          results.order_module_error = e?.message || String(e)
        }

        if (!orderLinked && adminToken?.trim()) {
          const response = await fetch(`${base}/admin/orders/${order_id}` as any, {
            method: 'POST',
            headers: buildAdminAuthHeaders(adminToken, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ customer_id }),
          } as any)
          if (!response.ok) {
            const body = await response.text().catch(() => '')
            results.order_associated = false
            results.order_error = `status ${response.status}: ${body?.slice(0, 500) || 'unknown'}`
          } else {
            results.order_associated = true
          }
        } else {
          results.order_associated = true
        }
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


