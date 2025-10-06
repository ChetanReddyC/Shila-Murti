import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"

/**
 * POST /store/payments/capture
 * 
 * Captures an authorized payment using Medusa's workflow system
 * Store API version - no admin authentication required
 * Used by storefront after order completion when Cashfree has already settled
 */
export const POST = async (
  req: MedusaRequest<{ payment_id: string; order_id?: string }>,
  res: MedusaResponse
) => {
  try {
    const { payment_id, order_id } = req.body

    if (!payment_id) {
      return res.status(400).json({
        error: 'payment_id is required',
      })
    }

    console.log('[BACKEND][STORE_CAPTURE_PAYMENT][start]', { payment_id, order_id })

    // Use Medusa's capturePaymentWorkflow to properly capture the payment
    const result = await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id,
      },
    })

    console.log('[BACKEND][STORE_CAPTURE_PAYMENT][success]', { payment_id, order_id, result })

    return res.status(200).json({
      success: true,
      payment_id,
      order_id,
      result,
    })
  } catch (error: any) {
    console.error('[BACKEND][STORE_CAPTURE_PAYMENT][error]', {
      payment_id: req.body?.payment_id,
      order_id: req.body?.order_id,
      error: error?.message || String(error),
      stack: error?.stack,
    })

    return res.status(500).json({
      success: false,
      error: error?.message || 'Payment capture failed',
      details: error?.stack,
    })
  }
}
