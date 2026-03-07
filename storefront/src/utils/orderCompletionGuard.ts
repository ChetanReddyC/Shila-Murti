/**
 * Order Completion Security Guard
 * 
 * Prevents duplicate completions, race conditions, and exploitation
 * Provides idempotency and rate limiting for order completion flow
 * 
 * SECURITY FIX: Now uses atomic distributed locking to prevent race conditions
 */

import { kvGet, kvSet, kvIncr } from '@/lib/kv'
import { acquireDistributedLock, releaseDistributedLock, type Lock } from '@/lib/distributedLock'
import { createHash } from 'crypto'

interface CompletionAttempt {
  cartId: string
  orderId?: string
  timestamp: number
  status: 'pending' | 'completed' | 'failed'
  attempts: number
  idempotencyKey?: string
}

export interface CompletionLock {
  allowed: boolean
  lock?: Lock
  reason?: string
  existingOrderId?: string
}

const MAX_ATTEMPTS_PER_CART = 5
// Note: Cloudflare KV requires minimum TTL of 60 seconds
const COMPLETION_LOCK_TTL = 60 // 60 seconds (minimum for Cloudflare KV)
const RATE_LIMIT_WINDOW = 60 // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10

/**
 * Generates an idempotency key for cart completion
 */
export function generateIdempotencyKey(cartId: string, orderId?: string): string {
  // SECURITY FIX M5: Removed Date.now() — same cart+order must always produce the same key
  // This ensures true idempotency: retries return the same result instead of creating duplicates
  const data = `${cartId}:${orderId || 'manual'}`
  return createHash('sha256').update(data).digest('hex').substring(0, 32)
}

/**
 * Checks if cart completion is allowed and acquires atomic lock
 * 
 * SECURITY FIX: Uses distributed lock with atomic SET NX to prevent race conditions
 * 
 * @param idempotencyKey - Optional idempotency key for instant duplicate detection
 * @returns Lock object if allowed, reason if blocked
 */
export async function acquireCompletionLock(
  cartId: string,
  orderId?: string,
  idempotencyKey?: string
): Promise<CompletionLock> {
  try {
    // Fast path: Check idempotency key first (instant duplicate detection)
    if (idempotencyKey) {
      const idempotencyIndex = `idempotency:${idempotencyKey}`
      const existingByKey = await kvGet<{ cartId: string; orderId: string; timestamp: number }>(idempotencyIndex)

      if (existingByKey) {
        console.info('[COMPLETION_GUARD][idempotent_by_key]', {
          idempotencyKey,
          existingCartId: existingByKey.cartId,
          existingOrderId: existingByKey.orderId,
          message: 'Request already processed (idempotency key match)',
        })
        return {
          allowed: false,
          reason: 'Request already processed (duplicate idempotency key)',
          existingOrderId: existingByKey.orderId,
        }
      }
    }

    // Check if cart is already completed (idempotency check)
    const completedKey = `order:completed:${cartId}`
    const existingCompletion = await kvGet<CompletionAttempt>(completedKey)

    if (existingCompletion?.status === 'completed') {
      console.info('[COMPLETION_GUARD][idempotent_return]', {
        cartId,
        existingOrderId: existingCompletion.orderId,
        idempotencyKey: existingCompletion.idempotencyKey,
        message: 'Cart already completed - returning existing order (idempotency protection)',
      })
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
      console.warn('[COMPLETION_GUARD][max_attempts]', { cartId, attempts })
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
      console.warn('[COMPLETION_GUARD][rate_limited]', { cartId, requestCount })
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
      }
    }

    // SECURITY FIX: Acquire atomic distributed lock
    const lockResource = `cart:complete:${cartId}`
    const lockResult = await acquireDistributedLock(lockResource, COMPLETION_LOCK_TTL)

    if (!lockResult.success) {
      console.warn('[COMPLETION_GUARD][lock_failed]', {
        cartId,
        reason: lockResult.error,
      })
      return {
        allowed: false,
        reason: lockResult.error || 'Another completion is in progress',
      }
    }

    // Track attempt count
    await kvSet(attemptKey, attempts + 1, 3600) // Track attempts for 1 hour

    console.log('[COMPLETION_GUARD][lock_acquired]', {
      cartId,
      orderId,
      lockToken: lockResult.lock!.token,
    })

    return {
      allowed: true,
      lock: lockResult.lock,
    }

  } catch (error) {
    console.error('[COMPLETION_GUARD][acquire_lock][error]', {
      cartId,
      error: String(error),
    })
    return {
      allowed: false,
      reason: 'lock_unavailable',
    }
  }
}

/**
 * Releases the completion lock
 * Should be called in finally block to ensure lock is always released
 */
export async function releaseCompletionLock(lock: Lock): Promise<void> {
  try {
    const released = await releaseDistributedLock(lock)

    if (released) {
      console.log('[COMPLETION_GUARD][lock_released]', {
        resource: lock.resource,
      })
    } else {
      console.warn('[COMPLETION_GUARD][lock_release_failed]', {
        resource: lock.resource,
        reason: 'Lock already expired or token mismatch',
      })
    }
  } catch (error) {
    console.error('[COMPLETION_GUARD][release_lock][error]', {
      resource: lock.resource,
      error: String(error),
    })
  }
}

/**
 * Marks cart completion as successful and releases lock
 */
export async function markCompletionSuccess(
  cartId: string,
  orderId: string,
  idempotencyKey?: string
): Promise<void> {
  try {
    const completedKey = `order:completed:${cartId}`
    const completionData: CompletionAttempt = {
      cartId,
      orderId,
      timestamp: Date.now(),
      status: 'completed',
      attempts: 1,
      idempotencyKey,
    }

    // Store completion permanently (or with long TTL for audit)
    await kvSet(completedKey, completionData, 86400 * 30) // 30 days

    // Also track by orderId for webhook validation
    const orderKey = `order:cart:${orderId}`
    await kvSet(orderKey, cartId, 86400 * 7) // 7 days

    // Store by idempotency key for instant duplicate detection (best practice)
    if (idempotencyKey) {
      const idempotencyIndex = `idempotency:${idempotencyKey}`
      await kvSet(idempotencyIndex, { cartId, orderId, timestamp: Date.now() }, 86400 * 7) // 7 days
    }

    console.log('[COMPLETION_GUARD][success_marked]', {
      cartId,
      orderId,
      idempotencyKey,
    })
  } catch (error) {
    console.error('[COMPLETION_GUARD][mark_success][error]', {
      cartId,
      orderId,
      error: String(error),
    })
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

    // SECURITY FIX H3: Only allow completion if payment is actually PAID
    // ACTIVE means order created but NOT paid — must not be accepted
    const validStatuses = ['PAID']
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
    // SECURITY FIX H13: Use KV storage only — in-memory map is unreliable in serverless
    // global.orderCartMap is not shared across serverless invocations/instances
    const kvKey = `cf:order:cart:${orderId}`
    const kvCartId = await kvGet<string>(kvKey)
    return kvCartId || null
  } catch (error) {
    console.error('[COMPLETION_GUARD][get_cart_id][error]', { orderId, error: String(error) })
    return null
  }
}
