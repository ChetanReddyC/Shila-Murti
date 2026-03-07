import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

const redact = (id: string) => id ? '...' + id.slice(-8) : 'N/A'

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

    console.log('[BACKEND][ADMIN_CAPTURE_PAYMENT][start]', { payment_id: redact(payment_id) })

    // SECURITY FIX H9: Check if payment is already captured to prevent double-capture
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    const payment = await paymentModule.retrievePayment(payment_id)

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' })
    }

    if (payment.captured_at) {
      console.warn('[BACKEND][ADMIN_CAPTURE_PAYMENT][already_captured]', {
        payment_id: redact(payment_id),
        captured_at: payment.captured_at,
      })
      return res.status(409).json({
        error: 'Payment already captured',
        captured_at: payment.captured_at,
      })
    }

    // Use Medusa's capturePaymentWorkflow to properly capture the payment
    const result = await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id,
      },
    })

    console.log('[BACKEND][ADMIN_CAPTURE_PAYMENT][success]', { payment_id: redact(payment_id) })

    return res.status(200).json({
      success: true,
      payment_id,
      result,
    })
  } catch (error: any) {
    console.error('[BACKEND][ADMIN_CAPTURE_PAYMENT][error]', {
      payment_id: redact(req.body?.payment_id),
      error: error?.message || String(error),
    })

    return res.status(500).json({
      success: false,
      error: 'Payment capture failed',
    })
  }
}
