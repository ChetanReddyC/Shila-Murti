import 'server-only'

/**
 * Shared Cart Completion Utility
 *
 * Extracted from the checkout/complete API route so that both the
 * storefront completion endpoint and the Cashfree webhook can call
 * the same logic directly, eliminating the HTTP self-fetch that
 * introduced SSRF / self-DDoS risk.
 *
 * This module handles ONLY the post-validation work:
 *   1. Complete the cart via medusaApiClient
 *   2. Mark completion success in KV (idempotency)
 *   3. Store Cashfree order ID in Medusa order metadata
 *   4. Auto-capture payment (Cashfree then Medusa fallback)
 *
 * Auth, validation, locking, and customer sync remain the
 * responsibility of the caller.
 */

import { medusaApiClient } from '@/utils/medusaApiClient'
import {
  markCompletionSuccess,
  generateIdempotencyKey,
} from '@/utils/orderCompletionGuard'
import { captureMedusaPayment } from '@/utils/medusaPaymentCapture'
import { captureCashfreePayment } from '@/utils/cashfreeCapture'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompleteCartResult {
  success: boolean
  orderId?: string
  order?: any
  error?: string
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function completeCartFromPayment(params: {
  cartId: string
  cashfreeOrderId?: string
  customerId?: string
  idempotencyKey?: string
}): Promise<CompleteCartResult> {
  const { cartId, cashfreeOrderId, customerId } = params
  const idempotencyKey =
    params.idempotencyKey ?? generateIdempotencyKey(cartId, cashfreeOrderId)

  try {
    // -----------------------------------------------------------------------
    // 1. Complete the cart
    // -----------------------------------------------------------------------
    const useAtomicWorkflow =
      process.env.NEXT_PUBLIC_USE_ATOMIC_CHECKOUT === 'true'
    let result: any

    if (useAtomicWorkflow && customerId) {
      console.log('[completeCartFromPayment][atomic_start]', { cartId })
      result = await medusaApiClient.completeCartAtomic(cartId, customerId)
    } else {
      console.log('[completeCartFromPayment][legacy_start]', { cartId })
      result = await medusaApiClient.completeCart(cartId)
    }

    const createdOrder = result?.order
    const createdOrderId: string | undefined = createdOrder?.id

    if (!createdOrderId) {
      return {
        success: false,
        error: 'Cart completion did not return an order',
      }
    }

    // -----------------------------------------------------------------------
    // 2. Mark idempotent completion success in KV
    // -----------------------------------------------------------------------
    await markCompletionSuccess(cartId, createdOrderId, idempotencyKey)
    console.log('[completeCartFromPayment][marked_success]', {
      cartId,
      orderId: createdOrderId,
    })

    // -----------------------------------------------------------------------
    // 3. Store Cashfree order ID in Medusa order metadata (best-effort)
    // -----------------------------------------------------------------------
    if (cashfreeOrderId) {
      await storeMetadata(createdOrderId, cashfreeOrderId)
    }

    // -----------------------------------------------------------------------
    // 4. Auto-capture payment (Cashfree first, then Medusa fallback)
    // -----------------------------------------------------------------------
    if (cashfreeOrderId && createdOrder) {
      await autoCapturePayment(cashfreeOrderId, createdOrder, createdOrderId)
    }

    return { success: true, orderId: createdOrderId, order: createdOrder }
  } catch (err: any) {
    console.error('[completeCartFromPayment][error]', {
      cartId,
      error: err?.message || String(err),
    })
    return { success: false, error: err?.message || String(err) }
  }
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

async function storeMetadata(
  medusaOrderId: string,
  cashfreeOrderId: string
): Promise<void> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL ||
      process.env.MEDUSA_BASE_URL ||
      'http://localhost:9000'
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

    const res = await fetch(
      `${baseUrl}/store/custom/orders/${medusaOrderId}/metadata`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': publishableKey || '',
          'x-internal-call': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({ cashfree_order_id: cashfreeOrderId }),
      }
    )

    if (res.ok) {
      console.log('[completeCartFromPayment][metadata_stored]', {
        medusaOrderId,
        cashfreeOrderId,
      })
    } else {
      const errorText = await res.text().catch(() => '')
      console.error('[completeCartFromPayment][metadata_store_failed]', {
        medusaOrderId,
        cashfreeOrderId,
        status: res.status,
        error: errorText,
      })
    }
  } catch (err: any) {
    console.error('[completeCartFromPayment][metadata_store_exception]', {
      medusaOrderId,
      cashfreeOrderId,
      error: err?.message || String(err),
    })
  }
}

async function autoCapturePayment(
  cashfreeOrderId: string,
  createdOrder: any,
  createdOrderId: string
): Promise<void> {
  // ALWAYS capture in Medusa (this is what changes the admin dashboard status).
  // Cashfree capture is optional (only needed if preauth is enabled on the merchant account).
  try {
    // Step 1: Get the payment ID from the order
    let paymentId: string | undefined =
      createdOrder?.payment_collections?.[0]?.payments?.[0]?.id

    if (!paymentId) {
      console.warn('[completeCartFromPayment][payment_id_fetch]', {
        orderId: createdOrderId,
        reason: 'Payment ID not in completed order response, fetching separately',
      })

      const baseUrl =
        process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL ||
        process.env.MEDUSA_BASE_URL ||
        'http://localhost:9000'
      const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

      try {
        const orderResponse = await fetch(
          `${baseUrl}/store/orders/${createdOrderId}?fields=*payment_collections.payments`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-publishable-api-key': publishableKey || '',
            },
          }
        )
        if (orderResponse.ok) {
          const orderData = await orderResponse.json()
          paymentId =
            orderData?.order?.payment_collections?.[0]?.payments?.[0]?.id
        } else {
          console.error('[completeCartFromPayment][order_fetch_failed]', {
            orderId: createdOrderId,
            status: orderResponse.status,
          })
        }
      } catch (fetchError: any) {
        console.error('[completeCartFromPayment][order_fetch_exception]', {
          orderId: createdOrderId,
          error: fetchError?.message || String(fetchError),
        })
      }
    } else {
      console.log('[completeCartFromPayment][payment_id_from_order]', {
        orderId: createdOrderId,
        paymentId,
      })
    }

    // Step 2: Capture in Medusa via admin endpoint
    if (paymentId) {
      const medusaCaptureResult = await captureMedusaPayment(
        paymentId,
        createdOrderId
      )
      if (medusaCaptureResult.success) {
        console.log('[completeCartFromPayment][medusa_capture_success]', {
          orderId: createdOrderId,
          paymentId,
        })
      } else {
        console.error('[completeCartFromPayment][medusa_capture_failed]', {
          orderId: createdOrderId,
          paymentId,
          error: medusaCaptureResult.error,
        })
      }
    } else {
      console.error('[completeCartFromPayment][no_payment_id]', {
        orderId: createdOrderId,
      })
    }

    // Step 3: Optionally capture via Cashfree preauth API (if enabled)
    const autoCaptureEnabled = process.env.CASHFREE_AUTO_CAPTURE === 'true'
    if (autoCaptureEnabled) {
      try {
        const orderTotal = createdOrder?.total
        if (orderTotal) {
          const captureAmountRupees = Number(orderTotal.toFixed(2))
          const captureResult = await captureCashfreePayment(
            cashfreeOrderId,
            captureAmountRupees
          )
          console.log('[completeCartFromPayment][cashfree_capture]', {
            cashfreeOrderId,
            success: captureResult.success,
          })
        }
      } catch (captureError: any) {
        console.error('[completeCartFromPayment][cashfree_capture_exception]', {
          cashfreeOrderId,
          error: captureError?.message || String(captureError),
        })
      }
    }
  } catch (err: any) {
    console.error('[completeCartFromPayment][auto_capture_exception]', {
      orderId: createdOrderId,
      error: err?.message || String(err),
    })
  }
}
