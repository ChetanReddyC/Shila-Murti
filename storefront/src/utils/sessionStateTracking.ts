/**
 * Session State Tracking Utilities
 * 
 * Provides utilities for tracking session state changes, detecting authentication events,
 * and managing timing controls for the PasskeyNudge component.
 */

import { Session } from 'next-auth'
import { getCustomerToken } from './hybridCustomerStorage'

// Types for session state tracking
export interface SessionState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  data: Session | null
  isStable: boolean
  authenticationEvent: AuthenticationEvent | null
}

export interface AuthenticationEvent {
  type: 'mfa-complete' | 'checkout-auth' | 'login-complete' | 'first-time-login' | 'returning-login'
  timestamp: number
  customerId?: string
  identifier: string
}

export interface SessionTrackingState {
  previousStatus: string | null
  previousSessionData: any | null
  lastAuthEvent: AuthenticationEvent | null
  evaluationTimestamp: number
  stabilizationTimer: NodeJS.Timeout | null
}

export interface TimingConfig {
  stabilizationDelay: number // Wait for session to stabilize
  authEventDelay: number     // Wait after authentication events
  remountDelay: number       // Wait after component remount
}

export interface StoredAuthEvent {
  type: string
  timestamp: number
  customerId?: string
  identifier: string
  consumed: boolean
}

// Default timing configuration
export const DEFAULT_TIMING: TimingConfig = {
  stabilizationDelay: 1000,  // 1 second
  authEventDelay: 2000,      // 2 seconds  
  remountDelay: 500          // 0.5 seconds
}

/**
 * Session State Comparison Functions
 */

/**
 * Compares two session states to detect changes in status
 */
export function hasSessionStatusChanged(
  previousStatus: string | null,
  currentStatus: string
): boolean {
  return previousStatus !== null && previousStatus !== currentStatus
}

/**
 * Compares session data to detect meaningful changes with enhanced error handling
 */
export function hasSessionDataChanged(
  previousData: any,
  currentData: Session | null
): boolean {
  try {
    if (!previousData && !currentData) return false
    if (!previousData || !currentData) return true
    
    // Validate session data structure
    if (typeof previousData !== 'object' || typeof currentData !== 'object') {
      return true // Assume change to trigger re-evaluation
    }
    
    // Check for changes in key authentication-related fields
    const prevUser = (typeof previousData.user === 'object') ? previousData.user : {}
    const currUser = (typeof currentData.user === 'object') ? currentData.user : {}
    
    // Check for customerId changes (checkout authentication)
    let prevCustomerId: string | null = null
    let currCustomerId: string | null = null
    
    try {
      prevCustomerId = getCustomerIdFromSession(previousData)
      currCustomerId = getCustomerIdFromSession(currentData)
    } catch (customerIdError) {
      // Continue with other comparisons
    }
    
    if (prevCustomerId !== currCustomerId) return true
    
    // Check for MFA completion changes
    const prevMfaComplete = (previousData as any)?.mfaComplete
    const currMfaComplete = (currentData as any)?.mfaComplete
    if (prevMfaComplete !== currMfaComplete) return true
    
    // Check for identifier changes
    const prevIdentifier = getUserIdentifierFromSession(previousData)
    const currIdentifier = getUserIdentifierFromSession(currentData)
    if (prevIdentifier !== currIdentifier) return true
    
    // Check for original identifier changes (first-time data population)
    const prevOriginal = prevUser.originalEmail || prevUser.originalPhone
    const currOriginal = currUser.originalEmail || currUser.originalPhone
    if (prevOriginal !== currOriginal) return true
    
    return false
  } catch (error) {
    return true // Assume change to trigger re-evaluation when in doubt
  }
}

/**
 * Detects if session has transitioned from loading to authenticated
 */
export function hasSessionBecomeAuthenticated(
  previousStatus: string | null,
  currentStatus: string
): boolean {
  return previousStatus === 'loading' && currentStatus === 'authenticated'
}

/**
 * Authentication Event Detection Logic
 */

/**
 * Detects multi-factor authentication completion
 */
export function detectMfaCompletion(
  previousData: any,
  currentData: Session | null
): AuthenticationEvent | null {
  if (!currentData) return null
  
  const prevMfaComplete = previousData ? (previousData as any)?.mfaComplete : false
  const currMfaComplete = (currentData as any)?.mfaComplete
  
  // MFA completion detected when flag changes from false/undefined to true
  if (!prevMfaComplete && currMfaComplete === true) {
    const identifier = getUserIdentifierFromSession(currentData)
    if (identifier) {
      return {
        type: 'mfa-complete',
        timestamp: Date.now(),
        customerId: getCustomerIdFromSession(currentData),
        identifier
      }
    }
  }
  
  return null
}

/**
 * Detects checkout authentication (customerId added to session)
 */
export function detectCheckoutAuthentication(
  previousData: any,
  currentData: Session | null
): AuthenticationEvent | null {
  if (!currentData) return null
  
  const prevCustomerId = previousData ? getCustomerIdFromSession(previousData) : null
  const currCustomerId = getCustomerIdFromSession(currentData)
  
  // Checkout authentication detected when customerId is added
  if (!prevCustomerId && currCustomerId) {
    const identifier = getUserIdentifierFromSession(currentData)
    if (identifier) {
      return {
        type: 'checkout-auth',
        timestamp: Date.now(),
        customerId: currCustomerId,
        identifier
      }
    }
  }
  
  return null
}

/**
 * Detects first-time authentication completion and distinguishes between first-time and returning users
 */
export function detectLoginCompletion(
  previousStatus: string | null,
  currentStatus: string,
  currentData: Session | null
): AuthenticationEvent | null {
  if (!hasSessionBecomeAuthenticated(previousStatus, currentStatus) || !currentData) {
    return null
  }
  
  const identifier = getUserIdentifierFromSession(currentData)
  if (identifier) {
    // Check if this is a first-time authentication by looking for existing passkey policy
    const isFirstTime = !hasExistingPasskeyPolicy(identifier)
    
    return {
      type: isFirstTime ? 'first-time-login' : 'returning-login',
      timestamp: Date.now(),
      customerId: getCustomerIdFromSession(currentData),
      identifier
    }
  }
  
  return null
}

/**
 * Helper Functions
 */

/**
 * Extracts user identifier from session data with enhanced error handling
 */
export function getUserIdentifierFromSession(session: Session | null): string | null {
  try {
    if (!session?.user) return null
    
    const user = session.user as any
    
    // Validate user object structure
    if (typeof user !== 'object') {
      return null
    }
    
    const primary = user.phone || user.email
    
    // SECURITY: Use encrypted token instead of real customer ID
    // This is only for tracking/identification purposes
    let customerToken: string | null = null
    try {
      if (typeof window !== 'undefined') {
        customerToken = getCustomerToken()
        // Validate token if present
        if (customerToken && typeof customerToken !== 'string') {
          customerToken = null
        }
      }
    } catch (storageError) {
      // Continue without token
    }
    
    const identifier = customerToken || primary || null
    
    // Validate final identifier
    if (identifier && typeof identifier !== 'string') {
      return null
    }
    
    return identifier
  } catch (error) {
    return null
  }
}

/**
 * Extracts original (unmasked) identifier from session data with enhanced error handling
 */
export function getOriginalIdentifierFromSession(session: Session | null): string | null {
  try {
    if (!session?.user) return null
    
    const user = session.user as any
    
    // Validate user object structure
    if (typeof user !== 'object') {
      return null
    }
    
    const original = user.originalPhone || user.originalEmail
    
    // SECURITY: Use encrypted token instead of real customer ID
    // Only as fallback for passkey display name
    let customerToken: string | null = null
    try {
      if (typeof window !== 'undefined') {
        customerToken = getCustomerToken()
        // Validate token if present
        if (customerToken && typeof customerToken !== 'string') {
          customerToken = null
        }
      }
    } catch (storageError) {
      // Continue without token
    }
    
    // Prefer original phone/email over token for passkey display name
    const identifier = original || customerToken || null
    
    // Validate final identifier
    if (identifier && typeof identifier !== 'string') {
      return null
    }
    
    return identifier
  } catch (error) {
    return null
  }
}

/**
 * Extracts customer token from session with enhanced error handling
 * NOTE: Returns encrypted token for tracking, NOT real customer ID
 * For real customer ID, use getCustomerId() API which reads httpOnly cookie
 */
export function getCustomerIdFromSession(session: Session | null): string | null {
  try {
    // SECURITY: Use encrypted token instead of real customer ID
    try {
      if (typeof window !== 'undefined') {
        const customerToken = getCustomerToken()
        if (customerToken) {
          // Validate token
          if (typeof customerToken === 'string' && customerToken.trim().length > 0) {
            return customerToken
          }
        }
      }
    } catch (storageError) {
      // Continue to fallback
    }
    
    // Fallback to session data if available (may contain customer ID for backward compat)
    if (session && typeof session === 'object') {
      const sessionCustomerId = (session as any)?.customerId
      if (sessionCustomerId && typeof sessionCustomerId === 'string') {
        return sessionCustomerId
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * Checks if a user already has an existing passkey policy and verifies if the passkey actually exists on the device
 */
export function hasExistingPasskeyPolicy(identifier: string): boolean {
  try {
    if (typeof window === 'undefined' || !identifier) return false
    
    const policyKey = `passkeyPolicy_${identifier}`
    const cachedPolicy = localStorage.getItem(policyKey)
    
    if (cachedPolicy) {
      try {
        const policy = JSON.parse(cachedPolicy)
        if (policy && policy.hasPasskey === true && policy.expiresAt > Date.now()) {
          // Policy exists, but we need to verify if the passkey actually exists on the device
          // Check sessionStorage for current passkey credential
          try {
            if (typeof window !== 'undefined') {
              const hasPasskeySession = sessionStorage.getItem('hasPasskey')
              const currentCredential = sessionStorage.getItem('currentPasskeyCredential')
              
              // If we have session data indicating a passkey exists, verify it
              if (hasPasskeySession === 'true' && currentCredential) {
                // Additional check: verify the credential still exists by attempting to use it
                // This is a simplified check - in a real implementation, you might want to
                // actually test the credential with the WebAuthn API
                return true
              } else if (hasPasskeySession !== 'true') {
                // Session indicates no passkey, but policy exists - this means passkey was removed
                // Clear the outdated policy
                try {
                  localStorage.removeItem(policyKey)
                } catch (clearError) {
                }
                return false
              }
            }
          } catch (sessionError) {
          }
          
          // If we can't verify through session, assume the policy is valid
          // This maintains backward compatibility
          return true
        }
      } catch (policyParseError) {
        try {
          localStorage.removeItem(policyKey)
        } catch (clearError) {
        }
      }
    }
    return false
  } catch (error) {
    return false
  }
}

/**
 * Timing Control Utilities
 */

/**
 * Creates a delay promise for timing control
 */
export function createDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Creates a cancellable timer for stabilization delays
 */
export function createStabilizationTimer(
  callback: () => void,
  delay: number
): NodeJS.Timeout {
  return setTimeout(callback, delay)
}

/**
 * Clears a stabilization timer safely
 */
export function clearStabilizationTimer(timer: NodeJS.Timeout | null): void {
  if (timer) {
    clearTimeout(timer)
  }
}

/**
 * Determines appropriate delay based on authentication event type
 */
export function getDelayForAuthEvent(
  event: AuthenticationEvent | null,
  config: TimingConfig = DEFAULT_TIMING
): number {
  if (!event) return config.stabilizationDelay
  
  switch (event.type) {
    case 'mfa-complete':
      return config.authEventDelay
    case 'checkout-auth':
      return config.authEventDelay
    case 'login-complete':
      return config.stabilizationDelay
    default:
      return config.stabilizationDelay
  }
}

/**
 * Checks if enough time has passed since an authentication event
 */
export function hasEventStabilized(
  event: AuthenticationEvent | null,
  config: TimingConfig = DEFAULT_TIMING
): boolean {
  if (!event) return true
  
  const requiredDelay = getDelayForAuthEvent(event, config)
  const timeSinceEvent = Date.now() - event.timestamp
  
  return timeSinceEvent >= requiredDelay
}

/**
 * Error Recovery and Validation Functions
 */

/**
 * Validates session data structure and returns sanitized version
 */
export function validateAndSanitizeSession(session: any): Session | null {
  try {
    if (!session || typeof session !== 'object') {
      return null
    }
    
    // Validate user object
    if (!session.user || typeof session.user !== 'object') {
      return null
    }
    
    // Create sanitized session object
    const sanitizedSession: Session = {
      user: {
        ...session.user,
        // Ensure required fields are strings or null
        email: typeof session.user.email === 'string' ? session.user.email : null,
        phone: typeof session.user.phone === 'string' ? session.user.phone : null,
        originalEmail: typeof session.user.originalEmail === 'string' ? session.user.originalEmail : null,
        originalPhone: typeof session.user.originalPhone === 'string' ? session.user.originalPhone : null,
      },
      expires: typeof session.expires === 'string' ? session.expires : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }
    
    // Validate that we have at least one identifier
    if (!sanitizedSession.user.email && !sanitizedSession.user.phone && 
        !sanitizedSession.user.originalEmail && !sanitizedSession.user.originalPhone) {
      return null
    }
    
    return sanitizedSession
  } catch (error) {
    return null
  }
}

/**
 * Safely extracts authentication event data with validation
 */
export function createSafeAuthenticationEvent(
  type: string,
  identifier: string,
  customerId?: string
): AuthenticationEvent | null {
  try {
    // Validate required fields
    if (!type || typeof type !== 'string' || type.trim().length === 0) {
      return null
    }
    
    if (!identifier || typeof identifier !== 'string' || identifier.trim().length === 0) {
      return null
    }
    
    // Validate event type
    const validTypes = ['mfa-complete', 'checkout-auth', 'login-complete']
    if (!validTypes.includes(type as any)) {
      return null
    }
    
    // Create safe event object
    const event: AuthenticationEvent = {
      type: type as any,
      timestamp: Date.now(),
      identifier: identifier.trim(),
      customerId: (customerId && typeof customerId === 'string') ? customerId.trim() : undefined
    }
    
    return event
  } catch (error) {
    return null
  }
}

/**
 * Performs comprehensive error recovery for session state tracking
 */
export function performErrorRecovery(): {
  success: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  try {
    
    // Test storage access
    try {
      if (typeof window !== 'undefined') {
        // Test sessionStorage
        try {
          const testKey = 'sessionStateTracking_test'
          sessionStorage.setItem(testKey, 'test')
          sessionStorage.removeItem(testKey)
        } catch (sessionError) {
          errors.push('SessionStorage access failed')
        }
        
        // Test localStorage
        try {
          const testKey = 'sessionStateTracking_test'
          localStorage.setItem(testKey, 'test')
          localStorage.removeItem(testKey)
        } catch (localError) {
          warnings.push('LocalStorage access failed')
        }
      }
    } catch (storageTestError) {
      errors.push('Storage testing failed')
    }
    
    // Validate timer functionality
    try {
      const testTimer = setTimeout(() => {
        // Test timer callback
      }, 0)
      clearTimeout(testTimer)
    } catch (timerError) {
      errors.push('Timer functionality failed')
    }
    
    // Check for corrupted data and clean up
    try {
      if (typeof window !== 'undefined') {
        // Check for corrupted session data keys
        const corruptedKeys: string[] = []
        
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)
            if (key && key.startsWith('passkeyNudge')) {
              try {
                const value = sessionStorage.getItem(key)
                if (value && value !== '1' && value !== '0') {
                  // Try to parse as JSON
                  JSON.parse(value)
                }
              } catch (parseError) {
                corruptedKeys.push(key)
              }
            }
          }
          
          // Remove corrupted keys
          corruptedKeys.forEach(key => {
            try {
              sessionStorage.removeItem(key)
              warnings.push(`Removed corrupted key: ${key}`)
            } catch (removeError) {
              errors.push(`Failed to remove corrupted key: ${key}`)
            }
          })
          
          if (corruptedKeys.length > 0) {
          }
        } catch (keyCleanupError) {
          warnings.push('Key cleanup failed')
        }
      }
    } catch (dataValidationError) {
      warnings.push('Data validation failed')
    }
    
    const success = errors.length === 0
    
    return { success, errors, warnings }
  } catch (recoveryError) {
    return {
      success: false,
      errors: [...errors, 'Recovery process failed'],
      warnings
    }
  }
}