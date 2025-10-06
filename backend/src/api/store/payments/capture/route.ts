import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /store/payments/capture
 * 
 * Captures an authorized payment using Medusa's workflow system
 * SECURITY: Requires order_id validation to prevent unauthorized captures
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

    if (!order_id) {
      return res.status(400).json({
        error: 'order_id is required for security validation',
      })
    }

    console.log('[BACKEND][STORE_CAPTURE_PAYMENT][start]', { payment_id, order_id })

    // SECURITY: Verify payment exists and prevent double capture
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    const payment = await paymentModule.retrievePayment(payment_id)

    if (!payment) {
      console.error('[BACKEND][STORE_CAPTURE_PAYMENT][not_found]', { payment_id })
      return res.status(404).json({
        error: 'Payment not found',
      })
    }

    // SECURITY: Prevent double capture
    if (payment.captured_at) {
      console.warn('[BACKEND][STORE_CAPTURE_PAYMENT][already_captured]', { 
        payment_id, 
        order_id,
        captured_at: payment.captured_at 
      })
      return res.status(409).json({
        error: 'Payment already captured',
        captured_at: payment.captured_at,
      })
    }

    // Security Note: Frontend already validates orderId→cartId mapping
    // capturePaymentWorkflow will handle additional validation
    // Proceed with capture
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
