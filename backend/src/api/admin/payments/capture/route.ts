import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"

/**
 * POST /admin/payments/capture
 * 
 * Captures an authorized payment using Medusa's workflow system
 * This is used when Cashfree has already settled the payment but Medusa shows it as "authorized"
 */
export const POST = async (
  req: MedusaRequest<{ payment_id: string }>,
  res: MedusaResponse
) => {
  try {
    const { payment_id } = req.body

    if (!payment_id) {
      return res.status(400).json({
        error: 'payment_id is required',
      })
    }

    console.log('[BACKEND][CAPTURE_PAYMENT][start]', { payment_id })

    // Use Medusa's capturePaymentWorkflow to properly capture the payment
    const result = await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id,
      },
    })

    console.log('[BACKEND][CAPTURE_PAYMENT][success]', { payment_id, result })

    return res.status(200).json({
      success: true,
      payment_id,
      result,
    })
  } catch (error: any) {
    console.error('[BACKEND][CAPTURE_PAYMENT][error]', {
      payment_id: req.body?.payment_id,
      error: error?.message || String(error),
      stack: error?.stack,
    })

    return res.status(500).json({
      success: false,
      error: error?.message || 'Payment capture failed',
    })
  }
}
