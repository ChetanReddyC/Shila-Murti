/**
 * Checkout Authentication Validation Utility
 * 
 * CRITICAL SECURITY: This module enforces authentication requirements for checkout operations.
 * Users must complete identity verification (OTP, Magic Link, or Passkey) before placing orders.
 */

import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { kvGet } from '@/lib/kv'
import { getToken } from 'next-auth/jwt'
import { isJWTBlacklisted } from '@/lib/auth/jwtBlacklist'
import { validateAuthSession } from '@/lib/auth/sessionManager'

interface AuthValidationResult {
  authenticated: boolean
  customerId?: string
  reason?: string
  method?: 'session' | 'otp' | 'magic_link' | 'passkey'
}

/**
 * Normalize email to lowercase for consistent lookup
 */
function normalizeEmail(email?: string | null): string | undefined {
  if (!email) return undefined
  return String(email).trim().toLowerCase()
}

/**
 * Normalize phone to international format with digits only
 */
function normalizePhoneDigits(phone?: string | null): string | undefined {
  if (!phone) return undefined
  const digits = String(phone).replace(/\D/g, '')
  return digits ? `+${digits}` : undefined
}

/**
 * Validate if user has completed checkout authentication
 * 
 * Checks multiple authentication methods in order of precedence:
 * 1. Valid NextAuth session (logged in users)
 * 2. OTP verification marker in KV store
 * 3. Magic link verification marker in KV store
 * 
 * @param req - The incoming request
 * @param options - Optional customerId, email, or phone to validate against
 * @returns Authentication validation result
 */
export async function validateCheckoutAuth(
  req: NextRequest,
  options?: {
    customerId?: string
    email?: string
    phone?: string
    cartId?: string
  }
): Promise<AuthValidationResult> {
  // PRIORITY 0: Check httpOnly cookie (Hybrid Storage - Option C)
  // This is the most secure method as it's XSS-protected
  try {
    const customerIdCookie = req.cookies.get('customer_id')?.value

    if (customerIdCookie) {
      console.log('[CHECKOUT_AUTH] Found customer ID in httpOnly cookie')

      // If customerId provided in options, verify it matches cookie
      if (options?.customerId && options.customerId !== customerIdCookie) {
        console.warn('[CHECKOUT_AUTH] Customer ID mismatch between request and cookie')
        // Continue to other auth methods
      } else {
        return {
          authenticated: true,
          customerId: customerIdCookie,
          method: 'session'
        }
      }
    }
  } catch (error) {
    console.error('[CHECKOUT_AUTH] httpOnly cookie check error:', error)
    // Continue to other auth methods
  }

  // PRIORITY 1: Check for valid NextAuth session
  try {
    // Get the JWT token to check blacklist
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

    if (token) {
      // Check if JWT is blacklisted (revoked during logout)
      const jti = (token as any)?.jti
      if (jti) {
        const isBlacklisted = await isJWTBlacklisted(jti)
        if (isBlacklisted) {
          console.log('[CHECKOUT_AUTH] JWT is blacklisted:', jti)
          // Continue to check other auth methods
        } else {
          // Valid session exists
          const session = await getServerSession(authOptions)

          if (session) {
            const sessionCustomerId = (session as any)?.customerId

            return {
              authenticated: true,
              customerId: sessionCustomerId || options?.customerId,
              method: 'session'
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[CHECKOUT_AUTH] Session validation error:', error)
    // Continue to check other auth methods
  }

  // PRIORITY 1.5: Check Persistent Authentication Session (NEW - TOP 1% FIX)
  // This is the CRITICAL FIX for multi-order checkout sessions
  // After OTP/Magic Link verification, we create a 7-day persistent session
  // This check ensures subsequent orders don't fail due to expired temporary markers
  try {
    console.log('[CHECKOUT_AUTH][persistent_session_check][start]', {
      hasEmail: !!options?.email,
      hasPhone: !!options?.phone,
      hasCustomerId: !!options?.customerId
    })

    const sessionValidation = await validateAuthSession(
      options?.email,
      options?.phone,
      options?.customerId
    )

    if (sessionValidation.valid && sessionValidation.session) {
      console.log('[CHECKOUT_AUTH][persistent_session_check][success]', {
        customerId: sessionValidation.session.customerId.substring(0, 15) + '...',
        method: sessionValidation.session.method,
        sessionAge: Math.floor((Date.now() - sessionValidation.session.createdAt) / 1000) + 's',
        lastActivity: Math.floor((Date.now() - sessionValidation.session.lastActivityAt) / 1000) + 's ago'
      })

      return {
        authenticated: true,
        customerId: sessionValidation.session.customerId,
        method: sessionValidation.session.method as any // Map to our method type
      }
    } else {
      console.log('[CHECKOUT_AUTH][persistent_session_check][not_found]', {
        reason: sessionValidation.reason || 'no_session'
      })
    }
  } catch (error: any) {
    console.error('[CHECKOUT_AUTH][persistent_session_check][error]', {
      error: error?.message || String(error)
    })
    // Continue to check temporary markers (fallback)
  }

  // PRIORITY 2: Check OTP verification marker (WhatsApp/Phone)
  if (options?.phone) {
    const phoneKey = normalizePhoneDigits(options.phone)

    if (phoneKey) {
      try {
        const otpMarker = await kvGet<number | string | unknown>(`otp:ok:${phoneKey}`)

        if (otpMarker) {
          return {
            authenticated: true,
            customerId: options.customerId,
            method: 'otp'
          }
        }
      } catch (error) {
        console.error('[CHECKOUT_AUTH] OTP marker check error:', error)
      }
    }
  }

  // PRIORITY 3: Check Magic Link verification marker (Email)
  if (options?.email) {
    const email = normalizeEmail(options.email)

    if (email) {
      try {
        // Check both general and cart-specific magic link markers
        const state = options.cartId ? `checkout-${options.cartId}` : ''
        const keyGeneral = `magic:ok:${email}`
        const keyState = state ? `magic:ok:${email}:${state}` : ''

        const [generalMarker, stateMarker] = await Promise.all([
          kvGet<number | string | unknown>(keyGeneral),
          keyState ? kvGet<number | string | unknown>(keyState) : Promise.resolve(null),
        ])

        if (generalMarker || stateMarker) {
          return {
            authenticated: true,
            customerId: options.customerId,
            method: 'magic_link'
          }
        }
      } catch (error) {
        console.error('[CHECKOUT_AUTH] Magic link marker check error:', error)
      }
    }
  }

  // No valid authentication found
  return {
    authenticated: false,
    reason: 'No valid authentication found. User must complete identity verification (OTP, Magic Link, or Login) before checkout.'
  }
}

/**
 * Extract customer information from request body for validation
 */
export function extractCustomerInfo(body: any): {
  customerId?: string
  email?: string
  phone?: string
  cartId?: string
} {
  return {
    customerId: body?.customerId || body?.customer?.id,
    email: body?.email || body?.customer?.email,
    phone: body?.phone || body?.customer?.phone,
    cartId: body?.cartId || body?.cart_id
  }
}
