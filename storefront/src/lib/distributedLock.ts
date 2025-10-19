/**
 * Distributed Lock Service
 * 
 * Provides atomic distributed locking to prevent race conditions
 * in order completion and other critical operations.
 * 
 * Uses Redis SET NX (set if not exists) for atomic lock acquisition.
 */

import { kvGet, kvDel } from './kv'
import { kvSetNXAtomic } from './kvHybrid'
import { randomUUID } from 'crypto'

export interface Lock {
  resource: string
  token: string
  expiresAt: number
}

export interface LockAcquisitionResult {
  success: boolean
  lock?: Lock
  error?: string
}

// Note: Cloudflare KV requires minimum TTL of 60 seconds
const DEFAULT_LOCK_TTL = 60 // 60 seconds (minimum for Cloudflare KV)
const DEFAULT_RETRY_ATTEMPTS = 0 // Don't retry by default
const DEFAULT_RETRY_DELAY = 100 // 100ms between retries

/**
 * Acquires a distributed lock on a resource
 * 
 * @param resource - The resource identifier to lock (e.g., "cart:complete:cart_123")
 * @param ttlSeconds - Lock expiration time in seconds (default: 30)
 * @param retryAttempts - Number of times to retry if lock is held (default: 0)
 * @param retryDelayMs - Delay between retry attempts in milliseconds (default: 100)
 * @returns Lock object if acquired, null if failed
 */
export async function acquireDistributedLock(
  resource: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL,
  retryAttempts: number = DEFAULT_RETRY_ATTEMPTS,
  retryDelayMs: number = DEFAULT_RETRY_DELAY
): Promise<LockAcquisitionResult> {
  const lockKey = `lock:${resource}`
  
  // Generate unique token for this lock to prevent releasing someone else's lock
  const token = randomUUID()
  
  const lockData = {
    token,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
    resource,
  }
  
  let attempts = 0
  
  while (attempts <= retryAttempts) {
    try {
      // Atomic SET NX operation - only sets if key doesn't exist
      // Uses Upstash Redis for true atomicity
      const acquired = await kvSetNXAtomic(lockKey, JSON.stringify(lockData), ttlSeconds)
      
      if (acquired) {
        return {
          success: true,
          lock: {
            resource,
            token,
            expiresAt: lockData.expiresAt,
          },
        }
      }
      
      // Lock is held by someone else
      if (attempts < retryAttempts) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        attempts++
        continue
      }
      
      // Max retries reached
      return {
        success: false,
        error: 'Lock is held by another process',
      }
      
    } catch (error) {
      console.error('[DISTRIBUTED_LOCK][acquire][error]', {
        resource,
        attempt: attempts + 1,
        error: String(error),
      })
      
      return {
        success: false,
        error: `Failed to acquire lock: ${String(error)}`,
      }
    }
  }
  
  return {
    success: false,
    error: 'Failed to acquire lock after retries',
  }
}

/**
 * Releases a distributed lock
 * Only releases if the provided token matches the lock owner
 * 
 * @param lock - The lock object to release
 * @returns true if released, false if lock was already expired or owned by someone else
 */
export async function releaseDistributedLock(lock: Lock): Promise<boolean> {
  const lockKey = `lock:${lock.resource}`
  
  try {
    // Verify lock ownership before deleting
    const currentLockData = await kvGet<string>(lockKey)
    
    if (!currentLockData) {
      // Lock already expired or doesn't exist
      console.warn('[DISTRIBUTED_LOCK][release][already_expired]', {
        resource: lock.resource,
      })
      return false
    }
    
    const currentLock = JSON.parse(currentLockData)
    
    // Only delete if token matches (prevents releasing someone else's lock)
    if (currentLock.token !== lock.token) {
      console.warn('[DISTRIBUTED_LOCK][release][token_mismatch]', {
        resource: lock.resource,
        expectedToken: lock.token,
        currentToken: currentLock.token,
      })
      return false
    }
    
    // Delete the lock
    await kvDel(lockKey)
    
    console.log('[DISTRIBUTED_LOCK][release][success]', {
      resource: lock.resource,
    })
    
    return true
    
  } catch (error) {
    console.error('[DISTRIBUTED_LOCK][release][error]', {
      resource: lock.resource,
      error: String(error),
    })
    return false
  }
}

/**
 * Checks if a lock is currently held for a resource
 * 
 * @param resource - The resource identifier
 * @returns true if lock exists and hasn't expired
 */
export async function isLockHeld(resource: string): Promise<boolean> {
  const lockKey = `lock:${resource}`
  
  try {
    const lockData = await kvGet<string>(lockKey)
    
    if (!lockData) return false
    
    const lock = JSON.parse(lockData)
    
    // Check if lock has expired (defensive check in case TTL didn't work)
    if (lock.expiresAt && Date.now() > lock.expiresAt) {
      // Clean up expired lock
      await kvDel(lockKey)
      return false
    }
    
    return true
    
  } catch (error) {
    console.error('[DISTRIBUTED_LOCK][isLockHeld][error]', {
      resource,
      error: String(error),
    })
    return false
  }
}

/**
 * Extends the TTL of an existing lock
 * Useful for long-running operations that need to keep the lock longer
 * 
 * @param lock - The lock to extend
 * @param additionalSeconds - Additional seconds to add to TTL
 * @returns true if extended successfully
 */
export async function extendLock(lock: Lock, additionalSeconds: number): Promise<boolean> {
  const lockKey = `lock:${lock.resource}`
  
  try {
    const currentLockData = await kvGet<string>(lockKey)
    
    if (!currentLockData) {
      console.warn('[DISTRIBUTED_LOCK][extend][not_found]', {
        resource: lock.resource,
      })
      return false
    }
    
    const currentLock = JSON.parse(currentLockData)
    
    // Verify ownership
    if (currentLock.token !== lock.token) {
      console.warn('[DISTRIBUTED_LOCK][extend][token_mismatch]', {
        resource: lock.resource,
      })
      return false
    }
    
    // Update expiration time
    const newExpiresAt = Date.now() + additionalSeconds * 1000
    currentLock.expiresAt = newExpiresAt
    
    // Re-set with new TTL
    await kvDel(lockKey)
    await kvSetNX(lockKey, JSON.stringify(currentLock), additionalSeconds)
    
    lock.expiresAt = newExpiresAt
    
    return true
    
  } catch (error) {
    console.error('[DISTRIBUTED_LOCK][extend][error]', {
      resource: lock.resource,
      error: String(error),
    })
    return false
  }
}
