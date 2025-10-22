/**
 * Cashfree Order-Cart Mapping Service
 * 
 * SECURITY FIX: Prevents payment hijacking by securely binding Cashfree orders to cart IDs
 * 
 * Features:
 * - Persistent storage (survives server restarts, shared across instances)
 * - Cryptographic signature (prevents tampering)
 * - Amount validation (prevents price manipulation)
 * - Audit trail (tracks all mapping operations)
 * - 7-day TTL (covers typical payment window)
 */

import { kvSet, kvGet } from './kv'
import { createHmac } from 'crypto'

export interface OrderMapping {
  orderId: string
  cartId: string
  amount: number
  currency: string
  createdAt: number
  signature: string
}

export interface MappingValidation {
  valid: boolean
  reason?: string
  mapping?: OrderMapping
}

const MAPPING_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days
const AUDIT_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days for audit logs

/**
 * Generates HMAC signature for order-cart-amount binding
 * Uses CASHFREE_CLIENT_SECRET as the signing key
 */
function generateMappingSignature(orderId: string, cartId: string, amount: number): string {
  const secret = process.env.CASHFREE_CLIENT_SECRET
  if (!secret) {
    throw new Error('CASHFREE_CLIENT_SECRET not configured')
  }
  
  const data = `${orderId}:${cartId}:${amount}`
  return createHmac('sha256', secret)
    .update(data)
    .digest('hex')
}

/**
 * Verifies the integrity of an order mapping
 */
function verifyMappingSignature(mapping: OrderMapping): boolean {
  try {
    const expectedSignature = generateMappingSignature(
      mapping.orderId,
      mapping.cartId,
      mapping.amount
    )
    return mapping.signature === expectedSignature
  } catch {
    return false
  }
}

/**
 * Stores order-to-cart mapping with cryptographic binding
 * 
 * @param orderId - Cashfree order_id
 * @param cartId - Medusa cart_id
 * @param amount - Order amount in INR
 * @param currency - Currency code (default: INR)
 */
export async function storeOrderCartMapping(
  orderId: string,
  cartId: string,
  amount: number,
  currency: string = 'INR'
): Promise<void> {
  try {
    const mapping: OrderMapping = {
      orderId,
      cartId,
      amount,
      currency,
      createdAt: Date.now(),
      signature: generateMappingSignature(orderId, cartId, amount)
    }
    
    // Store primary mapping (order -> cart)
    const orderKey = `cashfree:order:${orderId}`
    await kvSet(orderKey, mapping, MAPPING_TTL_SECONDS)
    
    // Store reverse mapping (cart -> order) for queries
    const cartKey = `cashfree:cart:${cartId}`
    await kvSet(cartKey, orderId, MAPPING_TTL_SECONDS)
    
    // Log creation for audit trail
    await logMappingAccess(orderId, 'create', 'success', {
      cartId,
      amount,
      currency
    })
  } catch (error) {
    console.error('[CASHFREE_MAPPING][store_error]', {
      error: 'Mapping storage failed'
    })
    
    await logMappingAccess(orderId, 'create', 'failure', {
      error: String(error)
    })
    
    throw error
  }
}

/**
 * Retrieves and validates order-cart mapping
 * 
 * @param orderId - Cashfree order_id
 * @returns Mapping if found and valid, null otherwise
 */
export async function getOrderCartMapping(
  orderId: string
): Promise<OrderMapping | null> {
  try {
    const orderKey = `cashfree:order:${orderId}`
    const mapping = await kvGet<OrderMapping>(orderKey)
    
    if (!mapping) {
      await logMappingAccess(orderId, 'retrieve', 'failure', {
        reason: 'mapping_not_found'
      })
      return null
    }
    
    // Verify signature integrity
    if (!verifyMappingSignature(mapping)) {
      console.error('[CASHFREE_MAPPING][signature_mismatch]')
      
      await logMappingAccess(orderId, 'retrieve', 'failure', {
        reason: 'signature_mismatch',
        cartId: mapping.cartId
      })
      
      return null
    }
    
    await logMappingAccess(orderId, 'retrieve', 'success', {
      cartId: mapping.cartId,
      amount: mapping.amount
    })
    
    return mapping
  } catch (error) {
    console.error('[CASHFREE_MAPPING][retrieve_error]')
    return null
  }
}

/**
 * Validates order mapping against expected values
 * Critical security check before completing order
 * 
 * @param orderId - Cashfree order_id
 * @param expectedCartId - Expected cart_id from request
 * @param expectedAmount - Expected amount from webhook
 * @returns Validation result with detailed reason if invalid
 */
export async function validateOrderMapping(
  orderId: string,
  expectedCartId: string,
  expectedAmount: number
): Promise<MappingValidation> {
  try {
    const mapping = await getOrderCartMapping(orderId)
    
    if (!mapping) {
      return {
        valid: false,
        reason: 'mapping_not_found'
      }
    }
    
    // Validate cart ID match
    if (mapping.cartId !== expectedCartId) {
      console.error('[CASHFREE_MAPPING][cart_mismatch]')
      
      await logMappingAccess(orderId, 'validate', 'failure', {
        reason: 'cart_id_mismatch',
        expected: expectedCartId,
        actual: mapping.cartId
      })
      
      return {
        valid: false,
        reason: 'cart_id_mismatch'
      }
    }
    
    // Validate amount match (allow 1 paisa tolerance for rounding)
    const amountDiff = Math.abs(mapping.amount - expectedAmount)
    if (amountDiff > 0.01) {
      console.error('[CASHFREE_MAPPING][amount_mismatch]')
      
      await logMappingAccess(orderId, 'validate', 'failure', {
        reason: 'amount_mismatch',
        expected: expectedAmount,
        actual: mapping.amount,
        difference: amountDiff
      })
      
      return {
        valid: false,
        reason: 'amount_mismatch'
      }
    }
    
    await logMappingAccess(orderId, 'validate', 'success', {
      cartId: mapping.cartId,
      amount: mapping.amount
    })
    
    return {
      valid: true,
      mapping
    }
  } catch (error) {
    console.error('[CASHFREE_MAPPING][validate_error]')
    
    return {
      valid: false,
      reason: 'validation_error'
    }
  }
}

/**
 * Logs mapping access for audit trail
 */
async function logMappingAccess(
  orderId: string,
  action: 'create' | 'retrieve' | 'validate',
  result: 'success' | 'failure',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const auditKey = `cashfree:audit:${orderId}`
    const auditEntry = {
      action,
      result,
      timestamp: Date.now(),
      metadata
    }
    
    // Get existing audit log
    const existingLog = await kvGet<any[]>(auditKey) || []
    
    // Append new entry
    const updatedLog = [...existingLog, auditEntry].slice(-100) // Keep last 100 entries
    
    // Store with extended TTL for audit purposes
    await kvSet(auditKey, updatedLog, AUDIT_TTL_SECONDS)
  } catch (error) {
    // Audit logging failure shouldn't break main flow - silent fail
  }
}

/**
 * Retrieves audit log for an order (for debugging/investigation)
 */
export async function getOrderAuditLog(orderId: string): Promise<any[]> {
  try {
    const auditKey = `cashfree:audit:${orderId}`
    return await kvGet<any[]>(auditKey) || []
  } catch (error) {
    return []
  }
}
