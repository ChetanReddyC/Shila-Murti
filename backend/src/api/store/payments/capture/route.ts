import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

const redact = (id: string) => id ? '...' + id.slice(-8) : 'N/A'

/**
 * POST /store/payments/capture
 *
 * Captures an authorized payment using Medusa's workflow system
 * SECURITY: Protected by authGuard middleware + validates payment belongs to customer's order
 */
export const POST = async (
  req: MedusaRequest<{ payment_id: string; order_id: string }>,
  res: MedusaResponse
) => {
  try {
    const { payment_id, order_id } = req.body

    // SECURITY FIX C4: Auth is now enforced by middleware (authGuard in middlewares.ts)
    // The customer_id is attached by authGuard after JWT verification
    const customerId = (req as any).customer_id || (req as any).auth?.customer_id
    if (!customerId) {
      return res.status(401).json({
        error: 'Authentication required',
      })
    }

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

    console.log('[BACKEND][STORE_CAPTURE_PAYMENT][start]', { payment_id: redact(payment_id), order_id: redact(order_id) })

    // SECURITY: Verify payment exists and prevent double capture
    const paymentModule = req.scope.resolve(Modules.PAYMENT)
    const payment = await paymentModule.retrievePayment(payment_id)

    if (!payment) {
      console.error('[BACKEND][STORE_CAPTURE_PAYMENT][not_found]', { payment_id: redact(payment_id) })
      return res.status(404).json({
        error: 'Payment not found',
      })
    }

    // SECURITY: Prevent double capture
    if (payment.captured_at) {
      console.warn('[BACKEND][STORE_CAPTURE_PAYMENT][already_captured]', {
        payment_id: redact(payment_id),
        order_id: redact(order_id),
        captured_at: payment.captured_at
      })
      return res.status(409).json({
        error: 'Payment already captured',
        captured_at: payment.captured_at,
      })
    }

    // SECURITY FIX M10: Validate that payment_id belongs to the order_id
    // and that the order belongs to the authenticated customer
    try {
      const orderModule = req.scope.resolve(Modules.ORDER)
      const order = await orderModule.retrieveOrder(order_id, {
        relations: ["payment_collections.payments"],
      })

      if (!order) {
        return res.status(404).json({ error: 'Order not found' })
      }

      // Verify order belongs to authenticated customer
      if (order.customer_id && order.customer_id !== customerId) {
        console.error('[BACKEND][STORE_CAPTURE_PAYMENT][ownership_violation]', {
          payment_id: redact(payment_id),
          order_id: redact(order_id),
          orderCustomerId: redact(order.customer_id),
          requestCustomerId: redact(customerId),
        })
        return res.status(403).json({ error: 'Order does not belong to you' })
      }

      // Verify payment_id belongs to this order
      const orderPaymentIds = (order.payment_collections || [])
        .flatMap((pc: any) => (pc.payments || []).map((p: any) => p.id))

      if (orderPaymentIds.length > 0 && !orderPaymentIds.includes(payment_id)) {
        console.error('[BACKEND][STORE_CAPTURE_PAYMENT][payment_mismatch]', {
          payment_id: redact(payment_id),
          order_id: redact(order_id),
          orderPaymentIds: orderPaymentIds.map(redact),
        })
        return res.status(403).json({ error: 'Payment does not belong to this order' })
      }
    } catch (validationError: any) {
      console.error('[BACKEND][STORE_CAPTURE_PAYMENT][validation_error]', {
        payment_id: redact(payment_id),
        order_id: redact(order_id),
        error: validationError?.message || String(validationError),
      })
      // Fail closed — if we can't validate ownership, don't capture
      return res.status(500).json({
        error: 'Could not validate payment ownership',
      })
    }

    // Proceed with capture
    const result = await capturePaymentWorkflow(req.scope).run({
      input: {
        payment_id,
      },
    })

    console.log('[BACKEND][STORE_CAPTURE_PAYMENT][success]', { payment_id: redact(payment_id), order_id: redact(order_id) })

    return res.status(200).json({
      success: true,
      payment_id,
      order_id,
      result,
    })
  } catch (error: any) {
    console.error('[BACKEND][STORE_CAPTURE_PAYMENT][error]', {
      payment_id: redact(req.body?.payment_id),
      order_id: redact(req.body?.order_id),
      error: error?.message || String(error),
    })

    // SECURITY FIX C9: Never leak stack traces to client
    return res.status(500).json({
      success: false,
      error: 'Payment capture failed',
    })
  }
}
