/**
 * Hybrid Customer Storage Client Helper
 * 
 * Implements Option C: Hybrid approach on client-side
 * - Stores encrypted token in sessionStorage (for passkeys)
 * - Stores real customer ID in httpOnly cookie via API (XSS protected)
 */

/**
 * Store customer ID using hybrid approach
 * 
 * @param customerId - Real customer ID to store
 * @returns Promise with encrypted token
 */
export async function setCustomerId(customerId: string): Promise<{ ok: boolean; encryptedToken?: string; error?: string }> {
  try {
    // Call API to set httpOnly cookie
    const response = await fetch('/api/auth/session/set-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Important: Include cookies
      body: JSON.stringify({ customerId })
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.ok) {
      console.error('[HybridStorage] Failed to set customer ID:', data.error)
      return { ok: false, error: data.error || 'Failed to set customer session' }
    }
    
    // Store encrypted token in sessionStorage for passkey operations
    const encryptedToken = data.encryptedToken
    
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('customerToken', encryptedToken)
      
      // Also store a flag indicating hybrid storage is active
      sessionStorage.setItem('customerStorageType', 'hybrid')
    }
    
    return { ok: true, encryptedToken }
    
  } catch (error: any) {
    console.error('[HybridStorage] Error setting customer ID:', error)
    return { ok: false, error: error.message }
  }
}

/**
 * Get encrypted customer token from sessionStorage
 * This token can be used for passkey operations
 * Real customer ID is in httpOnly cookie (not accessible to JS)
 * 
 * @returns Encrypted customer token or null
 */
export function getCustomerToken(): string | null {
  if (typeof window === 'undefined') return null
  
  return sessionStorage.getItem('customerToken')
}

/**
 * Get real customer ID (server-side only via API)
 * 
 * @returns Promise with customer ID
 */
export async function getCustomerId(): Promise<{ ok: boolean; customerId?: string; error?: string }> {
  try {
    const response = await fetch('/api/auth/session/set-customer', {
      method: 'GET',
      credentials: 'include' // Important: Include httpOnly cookies
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || 'No customer session' }
    }
    
    return { ok: true, customerId: data.customerId }
    
  } catch (error: any) {
    console.error('[HybridStorage] Error getting customer ID:', error)
    return { ok: false, error: error.message }
  }
}

/**
 * Clear customer session (both sessionStorage and httpOnly cookie)
 */
export async function clearCustomerId(): Promise<void> {
  try {
    // Clear httpOnly cookie via API
    await fetch('/api/auth/session/set-customer', {
      method: 'DELETE',
      credentials: 'include'
    })
    
    // Clear sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('customerToken')
      sessionStorage.removeItem('customerId') // Clear legacy storage too
      sessionStorage.removeItem('customerStorageType')
    }
    
  } catch (error) {
    console.error('[HybridStorage] Error clearing customer session:', error)
  }
}

/**
 * Check if hybrid storage is active
 * 
 * @returns True if using hybrid storage
 */
export function isHybridStorageActive(): boolean {
  if (typeof window === 'undefined') return false
  
  return sessionStorage.getItem('customerStorageType') === 'hybrid'
}

/**
 * Migrate from legacy sessionStorage to hybrid storage
 * 
 * @returns Promise indicating success
 */
export async function migrateLegacyStorage(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  
  try {
    // Check if already using hybrid storage
    if (isHybridStorageActive()) {
      return true
    }
    
    // Check for legacy customer ID in sessionStorage
    const legacyCustomerId = sessionStorage.getItem('customerId')
    
    if (legacyCustomerId && legacyCustomerId !== 'undefined' && legacyCustomerId !== 'null') {
      // Set using hybrid approach
      const result = await setCustomerId(legacyCustomerId)
      
      if (result.ok) {
        // Remove legacy storage
        sessionStorage.removeItem('customerId')
        return true
      } else {
        console.error('[HybridStorage] Migration failed:', result.error)
        return false
      }
    }
    
    return false
    
  } catch (error) {
    console.error('[HybridStorage] Migration error:', error)
    return false
  }
}

/**
 * Get customer identifier for passkey operations
 * Returns encrypted token (safe for client-side use)
 * 
 * @returns Customer token for passkeys
 */
export function getCustomerIdentifierForPasskeys(): string | null {
  // Try hybrid storage first
  const token = getCustomerToken()
  if (token) return token
  
  // Fallback to legacy storage (will be migrated)
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('customerId')
  }
  
  return null
}
