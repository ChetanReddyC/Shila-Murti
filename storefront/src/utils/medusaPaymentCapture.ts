/**
 * Medusa Payment Capture Utility
 * 
 * Captures payments in Medusa when Cashfree has already settled them
 * (used when Cashfree preauthorization is not enabled)
 */

interface MedusaCaptureResult {
  success: boolean
  error?: string
  paymentId?: string
}

/**
 * Captures a payment in Medusa using backend workflow API
 * @param paymentId - Medusa payment ID
 * @param orderId - Optional Medusa order ID for logging
 * @returns Promise with capture result
 */
export async function captureMedusaPayment(paymentId: string, orderId?: string): Promise<MedusaCaptureResult> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
    const apiSecret = process.env.MEDUSA_API_SECRET
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

    const url = `${baseUrl}/store/payments/capture`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiSecret
          ? { 'x-api-key': apiSecret }
          : { 'x-publishable-api-key': publishableKey || '' }),
      },
      body: JSON.stringify({
        payment_id: paymentId,
        order_id: orderId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[MEDUSA_CAPTURE][failed]', {
        paymentId,
        status: response.status,
        error: errorData,
      })
      return {
        success: false,
        error: errorData.error || errorData.message || `HTTP ${response.status}`,
        paymentId,
      }
    }

    await response.json()

    return {
      success: true,
      paymentId,
    }
  } catch (error: any) {
    console.error('[MEDUSA_CAPTURE][exception]', {
      paymentId,
      error: error?.message || String(error),
    })
    return {
      success: false,
      error: error?.message || 'Capture exception',
      paymentId,
    }
  }
}

/**
 * Gets payment ID from Medusa order
 * @param orderId - Medusa order ID
 * @returns Payment ID or null
 */
export async function getPaymentIdFromOrder(orderId: string): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
    const apiSecret = process.env.MEDUSA_API_SECRET
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

    const url = `${baseUrl}/store/orders/${orderId}?fields=*payment_collections.payments`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(apiSecret
          ? { 'x-api-key': apiSecret }
          : { 'x-publishable-api-key': publishableKey || '' }),
      },
    })

    if (!response.ok) {
      console.error('[MEDUSA_CAPTURE][get_payment][failed]', { orderId, status: response.status })
      return null
    }

    const data = await response.json()
    const order = data?.order
    const paymentId = order?.payment_collections?.[0]?.payments?.[0]?.id

    if (!paymentId) {
      console.warn('[MEDUSA_CAPTURE][get_payment][not_found]', { orderId })
    }

    return paymentId || null
  } catch (error) {
    console.error('[MEDUSA_CAPTURE][get_payment][exception]', { orderId, error: String(error) })
    return null
  }
}
