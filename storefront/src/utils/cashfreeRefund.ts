/**
 * Cashfree Refund Utility
 * 
 * Initiates refunds for completed payments via Cashfree Payment Gateway API.
 * Supports full and partial refunds with idempotency for safe retries.
 */

interface CashfreeRefundRequest {
  cashfreeOrderId: string
  refundAmount: number
  refundId: string
  refundNote?: string
  refundSpeed?: 'STANDARD' | 'INSTANT'
}

interface CashfreeRefundResponse {
  cf_payment_id?: string
  cf_refund_id?: string
  refund_id?: string
  order_id?: string
  refund_amount?: number
  refund_status?: string
  status_description?: string
  refund_arn?: string
  refund_note?: string
  created_at?: string
  processed_at?: string
  error?: string
  message?: string
  code?: string
}

/**
 * Initiates a refund for a Cashfree order
 * 
 * @param cashfreeOrderId - The order ID used when creating the Cashfree order (e.g., "order_1234567890")
 * @param refundAmount - Amount to refund (in order currency, e.g., 100.50 for ₹100.50)
 * @param refundId - Unique identifier for this refund (for idempotency)
 * @param refundNote - Optional note explaining the refund reason
 * @returns Promise with refund result
 */
export async function initiateCashfreeRefund(
  cashfreeOrderId: string,
  refundAmount: number,
  refundId: string,
  refundNote?: string
): Promise<{ success: boolean; data?: CashfreeRefundResponse; error?: string }> {
  try {
    if (!cashfreeOrderId || !refundAmount || !refundId) {
      return {
        success: false,
        error: 'Missing required parameters: cashfreeOrderId, refundAmount, or refundId',
      }
    }

    if (refundAmount <= 0) {
      return {
        success: false,
        error: 'Refund amount must be greater than 0',
      }
    }

    const CF_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const url = `${CF_BASE}/orders/${encodeURIComponent(cashfreeOrderId)}/refunds`

    console.log('[CASHFREE_REFUND][initiate]', {
      cashfreeOrderId,
      refundId,
      refundAmount,
      url,
    })

    const requestBody = {
      refund_id: refundId,
      refund_amount: refundAmount,
      refund_note: refundNote || 'Order cancellation refund',
      refund_speed: 'STANDARD' as const, // INSTANT requires special setup
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
      },
      body: JSON.stringify(requestBody),
    })

    const data: CashfreeRefundResponse = await response.json()

    if (!response.ok) {
      console.error('[CASHFREE_REFUND][error]', {
        cashfreeOrderId,
        refundId,
        status: response.status,
        error: data,
      })

      // Handle specific error cases
      if (response.status === 400 && data.message?.includes('already refunded')) {
        return {
          success: false,
          error: 'This order has already been refunded',
          data,
        }
      }

      if (response.status === 404) {
        return {
          success: false,
          error: 'Order not found in Cashfree. Payment may not have been captured.',
          data,
        }
      }

      return {
        success: false,
        error: data.message || data.error || `Refund failed with status ${response.status}`,
        data,
      }
    }

    console.log('[CASHFREE_REFUND][success]', {
      cashfreeOrderId,
      refundId,
      cfRefundId: data.cf_refund_id,
      status: data.refund_status,
      amount: data.refund_amount,
    })

    return {
      success: true,
      data,
    }
  } catch (error: any) {
    console.error('[CASHFREE_REFUND][exception]', {
      cashfreeOrderId,
      refundId,
      error: error?.message || String(error),
    })
    return {
      success: false,
      error: error?.message || 'Refund request failed',
    }
  }
}

/**
 * Gets the status of a refund from Cashfree
 * 
 * @param cashfreeOrderId - The Cashfree order ID
 * @param refundId - The refund ID to check
 * @returns Promise with refund status
 */
export async function getCashfreeRefundStatus(
  cashfreeOrderId: string,
  refundId: string
): Promise<{ success: boolean; data?: CashfreeRefundResponse; error?: string }> {
  try {
    const CF_BASE = process.env.CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const url = `${CF_BASE}/orders/${encodeURIComponent(cashfreeOrderId)}/refunds/${encodeURIComponent(refundId)}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
        'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
        'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
      },
    })

    const data: CashfreeRefundResponse = await response.json()

    if (!response.ok) {
      console.error('[CASHFREE_REFUND_STATUS][error]', {
        cashfreeOrderId,
        refundId,
        status: response.status,
        error: data,
      })
      return {
        success: false,
        error: data.message || data.error || 'Failed to fetch refund status',
        data,
      }
    }

    return {
      success: true,
      data,
    }
  } catch (error: any) {
    console.error('[CASHFREE_REFUND_STATUS][exception]', {
      cashfreeOrderId,
      refundId,
      error: error?.message || String(error),
    })
    return {
      success: false,
      error: error?.message || 'Failed to fetch refund status',
    }
  }
}

/**
 * Generates an idempotent refund ID
 * SECURITY FIX M6: Removed Date.now() — same order always produces the same refund ID
 * If Cashfree receives a duplicate refund_id, it returns the existing refund (idempotent)
 */
export function generateRefundId(medusaOrderId: string): string {
  return `refund_${medusaOrderId}`
}
