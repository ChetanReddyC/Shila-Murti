import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../../utils/jwt"

/**
 * Manual Refund Status Check
 * Fetches latest refund status from Cashfree and updates order metadata
 * Use when webhook fails or status stuck
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Auth check
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer, req.scope)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token" })
    }

    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    // Get order and verify ownership
    const order = await orderModuleService.retrieveOrder(orderId, {
      select: ["id", "customer_id", "metadata", "status"],
    })
    
    if (!order || order.customer_id !== customerId) {
      return res.status(403).json({ message: "Unauthorized" })
    }

    if (order.status !== 'canceled') {
      return res.status(400).json({ message: "Order not cancelled" })
    }

    const cashfreeOrderId = order.metadata?.cashfree_order_id as string | undefined
    const refundId = order.metadata?.refund_id as string | undefined

    if (!cashfreeOrderId || !refundId) {
      return res.status(400).json({ 
        message: "No refund found for this order"
      })
    }

    // Fetch refund status from Cashfree
    const CF_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const url = `${CF_BASE}/orders/${encodeURIComponent(cashfreeOrderId)}/refunds/${encodeURIComponent(refundId)}`

    console.log('[REFUND_STATUS_CHECK][fetch]', { orderId, cashfreeOrderId, refundId })

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[REFUND_STATUS_CHECK][error]', {
        orderId,
        status: response.status,
        error: errorData
      })
      return res.status(400).json({
        message: "Failed to fetch refund status",
        error: errorData.message || 'Unknown error'
      })
    }

    const refundData = await response.json()

    console.log('[REFUND_STATUS_CHECK][success]', {
      orderId,
      refundStatus: refundData.refund_status,
      cfRefundId: refundData.cf_refund_id
    })

    // Update order metadata with latest status
    await orderModuleService.updateOrders(orderId, {
      metadata: {
        ...order.metadata,
        refund_status: refundData.refund_status,
        cf_refund_id: refundData.cf_refund_id,
        refund_arn: refundData.refund_arn || order.metadata?.refund_arn,
        refund_processed_at: refundData.processed_at || order.metadata?.refund_processed_at,
        refund_updated_at: new Date().toISOString(),
      }
    })

    const updatedOrder = await orderModuleService.retrieveOrder(orderId, {
      select: ["id", "metadata"],
    })

    return res.status(200).json({
      message: "Refund status updated",
      refund: {
        status: refundData.refund_status,
        amount: refundData.refund_amount,
        cf_refund_id: refundData.cf_refund_id,
        refund_arn: refundData.refund_arn,
        processed_at: refundData.processed_at,
      },
      order: updatedOrder
    })
  } catch (error: any) {
    console.error("[REFUND_STATUS_CHECK_ERROR]", error)
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: error?.message
    })
  }
}
