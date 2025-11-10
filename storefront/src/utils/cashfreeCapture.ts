/**
 * Cashfree Payment Capture Utility
 * 
 * Captures a pre-authorized payment after successful order creation.
 * Uses Cashfree's Preauthorization API to move payment from 'authorized' to 'captured' state.
 */

interface CashfreeCaptureRequest {
  orderId: string
  amount: number
}

interface CashfreeCaptureResponse {
  cf_payment_id?: string
  order_id?: string
  payment_status?: string
  payment_amount?: number
  error?: string
  message?: string
  code?: string
}

/**
 * Captures a payment for the given Cashfree order
 * @param orderId - Cashfree order ID
 * @param amount - Amount to capture (in the order currency)
 * @returns Promise with capture response
 */
export async function captureCashfreePayment(
  orderId: string,
  amount: number
): Promise<{ success: boolean; data?: CashfreeCaptureResponse; error?: string }> {
  try {
    const CF_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const url = `${CF_BASE}/orders/${encodeURIComponent(orderId)}/authorization`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
      },
      body: JSON.stringify({
        action: 'CAPTURE',
        amount: amount,
      }),
    })

    const data: CashfreeCaptureResponse = await response.json()

    if (!response.ok) {
      console.error('[CASHFREE_CAPTURE][error]', {
        orderId,
        status: response.status,
        error: data,
      })
      return {
        success: false,
        error: data.message || data.error || 'Capture failed',
        data,
      }
    }

    console.log('[CASHFREE_CAPTURE][success]', {
      orderId,
      cfPaymentId: data.cf_payment_id,
      status: data.payment_status,
      amount: data.payment_amount,
    })

    return {
      success: true,
      data,
    }
  } catch (error: any) {
    console.error('[CASHFREE_CAPTURE][exception]', {
      orderId,
      error: error?.message || String(error),
    })
    return {
      success: false,
      error: error?.message || 'Capture exception',
    }
  }
}

/**
 * Gets the current payment status from Cashfree
 * @param orderId - Cashfree order ID
 * @returns Promise with order details
 */
export async function getCashfreeOrderStatus(orderId: string): Promise<any> {
  try {
    const CF_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const url = `${CF_BASE}/orders/${encodeURIComponent(orderId)}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
      },
    })

    const data = await response.json()
    return { success: response.ok, data }
  } catch (error) {
    return { success: false, error }
  }
}
