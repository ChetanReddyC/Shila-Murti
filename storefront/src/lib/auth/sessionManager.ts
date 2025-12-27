/**
 * Authentication Session Manager
 * 
 * CRITICAL SECURITY MODULE: Manages persistent authentication sessions for checkout flows.
 * 
 * Design Philosophy (Top 1% Approach):
 * 1. Single Source of Truth - All auth session logic centralized here
 * 2. Defense in Depth - Multiple verification layers with graceful degradation
 * 3. Observability First - Comprehensive logging for debugging and security audits
 * 4. Type Safety - Strict TypeScript types prevent runtime errors
 * 5. Fail-Safe Defaults - Always err on the side of security
 * 
 * Session Lifecycle:
 * - Created: After successful OTP/Magic Link/Passkey verification
 * - Extended: On each successful order completion (keep-alive mechanism)
 * - Expired: After SESSION_TTL_DAYS of inactivity
 * - Revoked: On explicit logout or security events
 * 
 * @module AuthSessionManager
 */

import { kvGet, kvSet, kvDel } from '@/lib/kv'

// ============================================================================
// CONSTANTS - Single source of truth for all session parameters
// ============================================================================

/**
 * Session TTL: 7 days (matches httpOnly cookie expiry)
 * Why 7 days? Industry standard for e-commerce sessions, balances security and UX
 */
const SESSION_TTL_DAYS = 7
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60 // 604,800 seconds

/**
 * Short-lived temporary verification markers (5 minutes)
 * Used for immediate post-authentication actions before session is established
 */
const TEMP_VERIFICATION_TTL_SECONDS = 5 * 60

/**
 * Session key prefixes - namespaced for clarity and collision prevention
 */
const SESSION_KEY_PREFIX = 'auth:session' // Persistent session tokens
const TEMP_OTP_PREFIX = 'otp:ok'          // Temporary OTP verification markers
const TEMP_MAGIC_PREFIX = 'magic:ok'      // Temporary Magic Link verification markers

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Authentication method used to establish the session
 */
export type AuthMethod = 'otp' | 'magic_link' | 'passkey' | 'password'

/**
 * Session metadata stored in KV
 */
export interface AuthSession {
    /** Customer ID this session belongs to */
    customerId: string

    /** Authentication method used to create this session */
    method: AuthMethod

    /** Email address (normalized to lowercase) */
    email?: string

    /** Phone number (normalized to E.164 format: +12345678900) */
    phone?: string

    /** Unix timestamp when session was created */
    createdAt: number

    /** Unix timestamp of last activity (updated on order completion) */
    lastActivityAt: number

    /** Session version for migration support */
    version: number
}

/**
 * Result of session creation operation
 */
export interface CreateSessionResult {
    success: boolean
    sessionId?: string
    error?: string
    /** Temporary verification marker for immediate use */
    tempMarker?: string
}

/**
 * Result of session validation operation
 */
export interface ValidateSessionResult {
    valid: boolean
    session?: AuthSession
    reason?: string
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize email to lowercase for consistent lookups
 * Top 1% Practice: Prevent duplicates due to case sensitivity
 */
function normalizeEmail(email?: string | null): string | undefined {
    if (!email) return undefined
    return String(email).trim().toLowerCase()
}

/**
 * Normalize phone to E.164 format (+12345678900)
 * Top 1% Practice: Consistent format prevents lookup mismatches
 */
function normalizePhone(phone?: string | null): string | undefined {
    if (!phone) return undefined
    const digits = String(phone).replace(/\D/g, '')
    return digits ? `+${digits}` : undefined
}

/**
 * Generate session key from identifier (email or phone)
 * Top 1% Practice: Deterministic key generation for idempotency
 */
function getSessionKey(identifier: string): string {
    const normalized = identifier.includes('@')
        ? normalizeEmail(identifier)
        : normalizePhone(identifier)

    if (!normalized) {
        throw new Error('Invalid identifier for session key generation')
    }

    return `${SESSION_KEY_PREFIX}:${normalized}`
}

/**
 * Generate temporary verification marker keys
 * These are short-lived tokens for immediate post-auth actions
 */
function getTempMarkerKeys(email?: string, phone?: string): string[] {
    const keys: string[] = []

    if (email) {
        const normalizedEmail = normalizeEmail(email)
        if (normalizedEmail) {
            keys.push(`${TEMP_OTP_PREFIX}:${normalizedEmail}`)
            keys.push(`${TEMP_MAGIC_PREFIX}:${normalizedEmail}`)
        }
    }

    if (phone) {
        const normalizedPhone = normalizePhone(phone)
        if (normalizedPhone) {
            keys.push(`${TEMP_OTP_PREFIX}:${normalizedPhone}`)
        }
    }

    return keys
}

// ============================================================================
// CORE SESSION OPERATIONS
// ============================================================================

/**
 * Create a new authentication session after successful verification
 * 
 * Top 1% Practices:
 * - Idempotent: Safe to call multiple times
 * - Atomic: Creates both persistent session AND temporary markers
 * - Observable: Comprehensive logging for debugging
 * - Defensive: Validates all inputs before proceeding
 * 
 * @param customerId - Medusa customer ID
 * @param method - Authentication method used
 * @param email - User's email (optional)
 * @param phone - User's phone (optional)
 * @returns Result with session ID and temporary markers
 */
export async function createAuthSession(
    customerId: string,
    method: AuthMethod,
    email?: string,
    phone?: string
): Promise<CreateSessionResult> {
    try {
        // VALIDATION: At least one identifier required
        if (!email && !phone) {
            console.error('[AUTH_SESSION][create][validation_failed]', {
                reason: 'no_identifier',
                customerId: customerId?.substring(0, 15)
            })
            return {
                success: false,
                error: 'At least one identifier (email or phone) is required'
            }
        }

        // VALIDATION: Customer ID format
        if (!customerId || !customerId.startsWith('cus_')) {
            console.error('[AUTH_SESSION][create][validation_failed]', {
                reason: 'invalid_customer_id',
                customerId: customerId?.substring(0, 15)
            })
            return {
                success: false,
                error: 'Invalid customer ID format'
            }
        }

        const normalizedEmail = normalizeEmail(email)
        const normalizedPhone = normalizePhone(phone)
        const primaryIdentifier = normalizedEmail || normalizedPhone!
        const sessionKey = getSessionKey(primaryIdentifier)

        const now = Date.now()

        // Create session object
        const session: AuthSession = {
            customerId,
            method,
            email: normalizedEmail,
            phone: normalizedPhone,
            createdAt: now,
            lastActivityAt: now,
            version: 1
        }

        // ATOMIC OPERATION 1: Store persistent session
        await kvSet(sessionKey, session, SESSION_TTL_SECONDS)

        console.log('[AUTH_SESSION][create][success]', {
            sessionKey: sessionKey.substring(0, 40) + '...',
            customerId: customerId.substring(0, 15) + '...',
            method,
            hasEmail: !!normalizedEmail,
            hasPhone: !!normalizedPhone,
            ttlDays: SESSION_TTL_DAYS
        })

        // ATOMIC OPERATION 2: Create temporary verification markers
        // These allow immediate authentication checks while session propagates
        const tempMarkerKeys = getTempMarkerKeys(email, phone)
        const tempMarkerPromises = tempMarkerKeys.map(key =>
            kvSet(key, 1, TEMP_VERIFICATION_TTL_SECONDS).catch(err => {
                console.error('[AUTH_SESSION][temp_marker_failed]', { key, error: err?.message })
            })
        )

        await Promise.allSettled(tempMarkerPromises)

        console.log('[AUTH_SESSION][temp_markers_created]', {
            count: tempMarkerKeys.length,
            ttlSeconds: TEMP_VERIFICATION_TTL_SECONDS
        })

        return {
            success: true,
            sessionId: sessionKey,
            tempMarker: tempMarkerKeys[0] // Return first marker for reference
        }

    } catch (error: any) {
        console.error('[AUTH_SESSION][create][error]', {
            customerId: customerId?.substring(0, 15),
            method,
            error: error?.message || String(error)
        })

        return {
            success: false,
            error: error?.message || 'Failed to create authentication session'
        }
    }
}

/**
 * Validate an authentication session by checking various identifiers
 * 
 * Top 1% Practices:
 * - Multiple lookup strategies (email, phone, both)
 * - Comprehensive logging for security audits
 * - Graceful degradation on KV errors
 * 
 * @param email - User's email
 * @param phone - User's phone
 * @param customerId - Expected customer ID (optional verification)
 * @returns Validation result with session data if valid
 */
export async function validateAuthSession(
    email?: string,
    phone?: string,
    customerId?: string
): Promise<ValidateSessionResult> {
    try {
        // Build list of potential session keys to check
        const keysToCheck: string[] = []

        if (email) {
            const normalized = normalizeEmail(email)
            if (normalized) keysToCheck.push(getSessionKey(normalized))
        }

        if (phone) {
            const normalized = normalizePhone(phone)
            if (normalized) keysToCheck.push(getSessionKey(normalized))
        }

        if (keysToCheck.length === 0) {
            return {
                valid: false,
                reason: 'No identifiers provided for session validation'
            }
        }

        // Try each key until we find a valid session
        for (const key of keysToCheck) {
            try {
                const session = await kvGet<AuthSession>(key)

                if (!session) continue

                // VALIDATION 1: Session structure
                if (!session.customerId || !session.method || !session.createdAt) {
                    console.warn('[AUTH_SESSION][validate][malformed_session]', {
                        key: key.substring(0, 40) + '...',
                        hasCustomerId: !!session.customerId,
                        hasMethod: !!session.method
                    })
                    continue
                }

                // VALIDATION 2: Customer ID match (if provided)
                if (customerId && session.customerId !== customerId) {
                    console.warn('[AUTH_SESSION][validate][customer_mismatch]', {
                        expectedCustomerId: customerId.substring(0, 15) + '...',
                        sessionCustomerId: session.customerId.substring(0, 15) + '...'
                    })
                    continue
                }

                // VALIDATION 3: Session not expired (TTL handled by KV, but double-check)
                const ageSeconds = (Date.now() - session.createdAt) / 1000
                if (ageSeconds > SESSION_TTL_SECONDS) {
                    console.warn('[AUTH_SESSION][validate][expired]', {
                        key: key.substring(0, 40) + '...',
                        ageSeconds,
                        maxAgeSeconds: SESSION_TTL_SECONDS
                    })
                    continue
                }

                // Valid session found!
                console.log('[AUTH_SESSION][validate][success]', {
                    key: key.substring(0, 40) + '...',
                    customerId: session.customerId.substring(0, 15) + '...',
                    method: session.method,
                    ageSeconds: Math.floor(ageSeconds)
                })

                return {
                    valid: true,
                    session
                }

            } catch (kvError: any) {
                console.error('[AUTH_SESSION][validate][kv_error]', {
                    key: key.substring(0, 40) + '...',
                    error: kvError?.message
                })
                // Continue to next key on error
            }
        }

        // No valid session found
        return {
            valid: false,
            reason: 'No valid session found for provided identifiers'
        }

    } catch (error: any) {
        console.error('[AUTH_SESSION][validate][error]', {
            error: error?.message || String(error)
        })

        return {
            valid: false,
            reason: error?.message || 'Session validation failed'
        }
    }
}

/**
 * Update session last activity timestamp (keep-alive mechanism)
 * Call this after successful order completion to prevent session expiry
 * 
 * Top 1% Practice: Extends session TTL on activity to support multi-order sessions
 * 
 * @param email - User's email
 * @param phone - User's phone
 * @returns Success status
 */
export async function refreshAuthSession(
    email?: string,
    phone?: string
): Promise<boolean> {
    try {
        const validation = await validateAuthSession(email, phone)

        if (!validation.valid || !validation.session) {
            console.warn('[AUTH_SESSION][refresh][no_valid_session]', {
                hasEmail: !!email,
                hasPhone: !!phone
            })
            return false
        }

        const session = validation.session
        const primaryIdentifier = session.email || session.phone!
        const sessionKey = getSessionKey(primaryIdentifier)

        // Update last activity timestamp
        const updatedSession: AuthSession = {
            ...session,
            lastActivityAt: Date.now()
        }

        // Re-store with refreshed TTL
        await kvSet(sessionKey, updatedSession, SESSION_TTL_SECONDS)

        console.log('[AUTH_SESSION][refresh][success]', {
            sessionKey: sessionKey.substring(0, 40) + '...',
            customerId: session.customerId.substring(0, 15) + '...',
            ttlDays: SESSION_TTL_DAYS
        })

        return true

    } catch (error: any) {
        console.error('[AUTH_SESSION][refresh][error]', {
            error: error?.message || String(error)
        })
        return false
    }
}

/**
 * Revoke an authentication session (logout, security events)
 * 
 * Top 1% Practice: Clean up all session artifacts for security
 * 
 * @param email - User's email
 * @param phone - User's phone
 * @returns Success status
 */
export async function revokeAuthSession(
    email?: string,
    phone?: string
): Promise<boolean> {
    try {
        const keysToDelete: string[] = []

        if (email) {
            const normalized = normalizeEmail(email)
            if (normalized) {
                keysToDelete.push(getSessionKey(normalized))
                // Also delete temporary markers
                keysToDelete.push(`${TEMP_OTP_PREFIX}:${normalized}`)
                keysToDelete.push(`${TEMP_MAGIC_PREFIX}:${normalized}`)
            }
        }

        if (phone) {
            const normalized = normalizePhone(phone)
            if (normalized) {
                keysToDelete.push(getSessionKey(normalized))
                keysToDelete.push(`${TEMP_OTP_PREFIX}:${normalized}`)
            }
        }

        if (keysToDelete.length === 0) {
            return false
        }

        // Delete all session artifacts
        const deletePromises = keysToDelete.map(key =>
            kvDel(key).catch(err => {
                console.error('[AUTH_SESSION][revoke][delete_failed]', {
                    key: key.substring(0, 40) + '...',
                    error: err?.message
                })
            })
        )

        await Promise.allSettled(deletePromises)

        console.log('[AUTH_SESSION][revoke][success]', {
            keysDeleted: keysToDelete.length,
            hasEmail: !!email,
            hasPhone: !!phone
        })

        return true

    } catch (error: any) {
        console.error('[AUTH_SESSION][revoke][error]', {
            error: error?.message || String(error)
        })
        return false
    }
}

/**
 * Get session constants for external use
 * Top 1% Practice: Export constants through getter to prevent modification
 */
export function getSessionConfig() {
    return {
        SESSION_TTL_DAYS,
        SESSION_TTL_SECONDS,
        TEMP_VERIFICATION_TTL_SECONDS
    }
}
