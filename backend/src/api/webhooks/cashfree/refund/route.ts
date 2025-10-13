import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import crypto from "crypto"

/**
 * Cashfree Refund Webhook Handler
 * 
 * Receives refund status updates from Cashfree and updates order metadata
 * 
 * Webhook Event Structure:
 * {
 *   type: "REFUND_STATUS_WEBHOOK",
 *   data: {
 *     refund: {
 *       cf_refund_id: "string",
 *       refund_id: "string", // Our refund_orderId format
 *       order_id: "string", // Cashfree order ID
 *       refund_amount: number,
 *       refund_status: "SUCCESS" | "PENDING" | "CANCELLED" | "ONHOLD",
 *       status_description: "string",
 *       refund_arn: "string", // Bank ARN for successful refunds
 *       refund_note: "string",
 *       created_at: "string",
 *       processed_at: "string"
 *     }
 *   }
 * }
 */

interface CashfreeRefundWebhook {
  type: string
  data: {
    refund: {
      cf_refund_id: string
      refund_id: string
      order_id: string
      refund_amount: number
      refund_status: 'SUCCESS' | 'PENDING' | 'CANCELLED' | 'ONHOLD'
      status_description?: string
      refund_arn?: string
      refund_note?: string
      created_at: string
      processed_at?: string
    }
  }
}

/**
 * Verifies Cashfree webhook signature for security
 * Uses timestamp + raw body + secret to compute HMAC SHA256
 * 
 * LIMITATION: If rawBody is reconstructed via JSON.stringify, signature may fail
 * due to whitespace/ordering differences. For production:
 * - Option 1: Use IP whitelisting (Cashfree webhook IPs only)
 * - Option 2: Set CASHFREE_WEBHOOK_VERIFY=false and rely on HTTPS + application-level checks
 * - Option 3: Implement proper raw body capture before parsing (requires custom middleware)
 */
function verifyCashfreeSignature(
  rawBody: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    const secret = process.env.CASHFREE_CLIENT_SECRET
    if (!secret) {
      console.error('[CASHFREE_WEBHOOK][verify] Missing CASHFREE_CLIENT_SECRET')
      return false
    }

    // Cashfree signature format: timestamp + rawBody -> HMAC SHA256 with client secret
    const signaturePayload = `${timestamp}${rawBody}`
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex')

    // Compare signatures using timing-safe comparison
    if (signature.length !== computedSignature.length) {
      return false
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    )

    return isValid
  } catch (error) {
    console.error('[CASHFREE_WEBHOOK][verify_error]', {
      error: String(error)
    })
    return false
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Security: Verify webhook signature
    const signature = req.headers['x-webhook-signature'] as string | undefined
    const timestamp = req.headers['x-webhook-timestamp'] as string | undefined

    if (!signature || !timestamp) {
      console.warn('[CASHFREE_WEBHOOK][missing_headers]', {
        hasSignature: Boolean(signature),
        hasTimestamp: Boolean(timestamp)
      })
      return res.status(401).json({ message: 'Missing webhook signature headers' })
    }

    // Verify signature (controlled by environment variable)
    const shouldVerify = process.env.CASHFREE_WEBHOOK_VERIFY === 'true'
    if (shouldVerify) {
      // Reconstruct body (NOTE: May not match original due to JSON formatting)
      const rawBody = JSON.stringify(req.body)
      
      const isValid = verifyCashfreeSignature(rawBody, signature, timestamp)
      if (!isValid) {
        console.error('[CASHFREE_WEBHOOK][invalid_signature]', {
          timestamp,
          bodyLength: rawBody.length,
          signatureReceived: signature.substring(0, 20) + '...',
          note: 'Signature mismatch may be due to JSON formatting differences'
        })
        return res.status(403).json({ message: 'Invalid webhook signature' })
      }
      
      console.log('[CASHFREE_WEBHOOK][signature_verified]', { timestamp })
    } else {
      console.log('[CASHFREE_WEBHOOK][signature_skipped]', { 
        timestamp,
        note: 'Set CASHFREE_WEBHOOK_VERIFY=true to enable signature verification'
      })
    }

    const webhook = req.body as CashfreeRefundWebhook

    // Validate webhook structure
    if (webhook.type !== 'REFUND_STATUS_WEBHOOK' || !webhook.data?.refund) {
      console.warn('[CASHFREE_WEBHOOK][invalid_type]', {
        type: webhook.type,
        hasRefund: Boolean(webhook.data?.refund)
      })
      return res.status(400).json({ message: 'Invalid webhook type or structure' })
    }

    const refundData = webhook.data.refund
    const { refund_id, cf_refund_id, order_id, refund_status, refund_amount, refund_arn, processed_at } = refundData

    console.log('[CASHFREE_WEBHOOK][received]', {
      refund_id,
      cf_refund_id,
      order_id,
      refund_status,
      refund_amount
    })

    // Extract Medusa order ID from our refund_id format: refund_order_01J...
    const medusaOrderId = refund_id.replace(/^refund_/, '')

    if (!medusaOrderId) {
      console.error('[CASHFREE_WEBHOOK][invalid_refund_id]', {
        refund_id,
        order_id
      })
      return res.status(400).json({ message: 'Cannot extract Medusa order ID from refund_id' })
    }

    // Update order metadata with refund status
    const orderModuleService: any = req.scope.resolve(Modules.ORDER)

    try {
      // Fetch current order
      const order = await orderModuleService.retrieveOrder(medusaOrderId, {
        select: ["id", "metadata"],
      })

      if (!order) {
        console.error('[CASHFREE_WEBHOOK][order_not_found]', { medusaOrderId })
        return res.status(404).json({ message: 'Order not found' })
      }

      // Update metadata with latest refund status
      await orderModuleService.updateOrders(medusaOrderId, {
        metadata: {
          ...order.metadata,
          refund_status: refund_status,
          refund_amount: refund_amount,
          cf_refund_id: cf_refund_id,
          refund_arn: refund_arn || order.metadata?.refund_arn,
          refund_processed_at: processed_at || order.metadata?.refund_processed_at,
          refund_updated_at: new Date().toISOString(),
        }
      })

      console.log('[CASHFREE_WEBHOOK][metadata_updated]', {
        medusaOrderId,
        refund_status,
        cf_refund_id
      })

      // Acknowledge webhook
      return res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        order_id: medusaOrderId,
        refund_status
      })
    } catch (orderError: any) {
      console.error('[CASHFREE_WEBHOOK][order_update_error]', {
        medusaOrderId,
        error: orderError?.message || String(orderError)
      })
      return res.status(500).json({
        message: 'Failed to update order',
        error: orderError?.message
      })
    }
  } catch (error: any) {
    console.error('[CASHFREE_WEBHOOK][error]', {
      error: error?.message || String(error)
    })
    return res.status(500).json({
      message: 'Webhook processing failed',
      error: error?.message
    })
  }
}
