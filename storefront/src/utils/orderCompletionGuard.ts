/**
 * Order Completion Security Guard
 * 
 * Prevents duplicate completions, race conditions, and exploitation
 * Provides idempotency and rate limiting for order completion flow
 */

import { kvGet, kvSet, kvIncr } from '@/lib/kv'

interface CompletionAttempt {
  cartId: string
  orderId?: string
  timestamp: number
  status: 'pending' | 'completed' | 'failed'
  attempts: number
}

const MAX_ATTEMPTS_PER_CART = 5
const COMPLETION_LOCK_TTL = 300 // 5 minutes
const RATE_LIMIT_WINDOW = 60 // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10

/**
 * Checks if cart completion is allowed and creates a lock
 * Returns true if allowed, false if duplicate/blocked
 */
export async function acquireCompletionLock(
  cartId: string,
  orderId?: string
): Promise<{ allowed: boolean; reason?: string; existingOrderId?: string }> {
  try {
    // Check if cart is already completed
    const completedKey = `order:completed:${cartId}`
    const existingCompletion = await kvGet<CompletionAttempt>(completedKey)
    
    if (existingCompletion?.status === 'completed') {
      return {
        allowed: false,
        reason: 'Cart already completed',
        existingOrderId: existingCompletion.orderId,
      }
    }

    // Check attempt count to prevent brute force
    const attemptKey = `order:attempts:${cartId}`
    const attempts = await kvGet<number>(attemptKey) || 0
    
    if (attempts >= MAX_ATTEMPTS_PER_CART) {
      return {
        allowed: false,
        reason: `Maximum completion attempts (${MAX_ATTEMPTS_PER_CART}) exceeded`,
      }
    }

    // Rate limiting per cart
    const rateLimitKey = `order:ratelimit:${cartId}`
    const requestCount = await kvIncr(rateLimitKey)
    
    if (requestCount === 1) {
      // Set TTL on first request
      await kvSet(rateLimitKey, requestCount, RATE_LIMIT_WINDOW)
    }
    
    if (requestCount && requestCount > MAX_REQUESTS_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
      }
    }

    // Create pending lock
    const lockData: CompletionAttempt = {
      cartId,
      orderId,
      timestamp: Date.now(),
      status: 'pending',
      attempts: attempts + 1,
    }

    await kvSet(completedKey, lockData, COMPLETION_LOCK_TTL)
    await kvSet(attemptKey, attempts + 1, 3600) // Track attempts for 1 hour

    return { allowed: true }
  } catch (error) {
    console.error('[COMPLETION_GUARD][acquire_lock][error]', { cartId, error: String(error) })
    return {
      allowed: false,
      reason: 'lock_unavailable',
    }
  }
}

/**
 * Marks cart completion as successful
 */
export async function markCompletionSuccess(
  cartId: string,
  orderId: string
): Promise<void> {
  try {
    const completedKey = `order:completed:${cartId}`
    const completionData: CompletionAttempt = {
      cartId,
      orderId,
      timestamp: Date.now(),
      status: 'completed',
      attempts: 1,
    }

    // Store completion permanently (or with long TTL for audit)
    await kvSet(completedKey, completionData, 86400 * 30) // 30 days

    // Also track by orderId for webhook validation
    const orderKey = `order:cart:${orderId}`
    await kvSet(orderKey, cartId, 86400 * 7) // 7 days
  } catch (error) {
    console.error('[COMPLETION_GUARD][mark_success][error]', { cartId, orderId, error: String(error) })
  }
}

/**
 * Validates Cashfree order status before completion
 */
export async function validateCashfreeOrder(orderId: string): Promise<{
  valid: boolean
  status?: string
  amount?: number
  error?: string
}> {
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

    if (!response.ok) {
      return { valid: false, error: `Cashfree API returned ${response.status}` }
    }

    const data = await response.json()
    const status = String(data?.order_status || '').toUpperCase()
    const amount = Number(data?.order_amount || 0)

    // Only allow completion if payment is successful
    const validStatuses = ['PAID', 'ACTIVE'] // ACTIVE for authorized but not captured
    const isValid = validStatuses.includes(status)

    return {
      valid: isValid,
      status,
      amount,
      error: isValid ? undefined : `Invalid order status: ${status}`,
    }
  } catch (error) {
    console.error('[COMPLETION_GUARD][validate_cashfree][error]', { orderId, error: String(error) })
    return { valid: false, error: 'Failed to validate with Cashfree' }
  }
}

/**
 * Checks if webhook request is recent to prevent replay attacks
 */
export function isTimestampRecent(timestamp: string | number, maxAgeSeconds = 300): boolean {
  try {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
    const now = Math.floor(Date.now() / 1000)
    const age = now - ts
    return age >= 0 && age <= maxAgeSeconds
  } catch {
    return false
  }
}

/**
 * Prevents webhook replay attacks
 */
export async function preventWebhookReplay(
  signature: string,
  timestamp: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check timestamp freshness (5 minutes window)
    if (!isTimestampRecent(timestamp, 300)) {
      return { allowed: false, reason: 'Timestamp too old or invalid' }
    }

    // Check if this exact webhook was already processed
    const webhookKey = `webhook:processed:${signature}:${timestamp}`
    const alreadyProcessed = await kvGet<boolean>(webhookKey)

    if (alreadyProcessed) {
      return { allowed: false, reason: 'Webhook already processed (replay attack)' }
    }

    // Mark as processed
    await kvSet(webhookKey, true, 600) // Keep for 10 minutes

    return { allowed: true }
  } catch (error) {
    console.error('[COMPLETION_GUARD][webhook_replay][error]', { error: String(error) })
    // Fail open but log for monitoring
    return { allowed: true }
  }
}

/**
 * Gets cart ID from order ID (for webhook validation)
 */
export async function getCartIdFromOrder(orderId: string): Promise<string | null> {
  try {
    // First check KV mapping
    const kvKey = `cf:order:cart:${orderId}`
    const kvCartId = await kvGet<string>(kvKey)
    if (kvCartId) return kvCartId

    // Fallback to in-memory map
    const map: Map<string, string> | undefined = (global as any).orderCartMap
    const memCartId = map?.get(orderId)
    if (memCartId) return memCartId

    return null
  } catch (error) {
    console.error('[COMPLETION_GUARD][get_cart_id][error]', { orderId, error: String(error) })
    return null
  }
}
