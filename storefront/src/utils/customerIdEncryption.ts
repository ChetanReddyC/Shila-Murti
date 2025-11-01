/**
 * Customer ID Encryption Utility
 * 
 * Implements Option C: Hybrid approach for customer ID storage
 * - Encrypted token in sessionStorage (accessible for passkeys)
 * - Real customer ID in httpOnly cookie (protected from XSS)
 */

import { createHash, createHmac } from 'crypto'

// Secret key for HMAC (should match server-side)
const CUSTOMER_ID_SECRET = process.env.CUSTOMER_ID_SECRET || process.env.NEXT_PUBLIC_CUSTOMER_ID_SECRET || 'default-customer-id-secret-change-in-production'

/**
 * Generate a secure hash token for sessionStorage
 * This token can be used for client-side operations (passkeys)
 * but cannot be reverse-engineered to get the real customer ID
 * 
 * @param customerId - Real customer ID (e.g., 'cus_01ABC...')
 * @returns Encrypted token (e.g., 'ct_a1b2c3d4...')
 */
export function encryptCustomerId(customerId: string): string {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('Invalid customer ID for encryption')
  }
  
  // Create HMAC hash of customer ID
  const hmac = createHmac('sha256', CUSTOMER_ID_SECRET)
  hmac.update(customerId)
  const hash = hmac.digest('hex')
  
  // Prefix with 'ct_' (customer token) to identify encrypted tokens
  return `ct_${hash.substring(0, 32)}`
}

/**
 * Verify if a customer token matches a customer ID
 * Used server-side to validate sessionStorage tokens
 * 
 * @param token - Encrypted token from sessionStorage
 * @param customerId - Real customer ID to verify against
 * @returns True if token matches customer ID
 */
export function verifyCustomerToken(token: string, customerId: string): boolean {
  if (!token || !customerId) return false
  
  try {
    const expectedToken = encryptCustomerId(customerId)
    return token === expectedToken
  } catch {
    return false
  }
}

/**
 * Check if a value is an encrypted customer token
 * 
 * @param value - Value to check
 * @returns True if it's an encrypted token
 */
export function isEncryptedToken(value: string): boolean {
  return typeof value === 'string' && value.startsWith('ct_') && value.length === 35
}

/**
 * Check if a value is a real customer ID
 * 
 * @param value - Value to check
 * @returns True if it's a real customer ID format
 */
export function isRealCustomerId(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  
  // Real customer IDs are either:
  // 1. cus_* format (Medusa customer IDs)
  // 2. phone@guest.local format (guest accounts)
  return value.startsWith('cus_') || value.includes('@guest.local')
}

/**
 * Generate a session fingerprint for additional security
 * Combines user agent and other browser info
 * 
 * @param userAgent - Browser user agent string
 * @returns Session fingerprint hash
 */
export function generateSessionFingerprint(userAgent: string): string {
  const hash = createHash('sha256')
  hash.update(userAgent)
  hash.update(CUSTOMER_ID_SECRET)
  return hash.digest('hex').substring(0, 16)
}
