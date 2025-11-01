import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { encryptCustomerId, isRealCustomerId } from '@/utils/customerIdEncryption'
import { validateCheckoutAuth } from '@/utils/checkoutAuthValidation'

/**
 * Set Customer ID in httpOnly Cookie (Hybrid Storage)
 * 
 * Implements Option C: Hybrid approach
 * - Stores real customer ID in httpOnly cookie (XSS protected)
 * - Returns encrypted token for sessionStorage (passkey operations)
 * 
 * POST /api/auth/session/set-customer
 * Body: { customerId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { customerId } = body
    
    // Validate customer ID format
    if (!customerId || !isRealCustomerId(customerId)) {
      return NextResponse.json({
        ok: false,
        error: 'invalid_customer_id',
        message: 'Valid customer ID is required'
      }, { status: 400 })
    }
    
    // Check if there's an existing customer session
    const existingCustomerId = req.cookies.get('customer_id')?.value
    
    // Security: If there's an existing session, verify it matches
    if (existingCustomerId && existingCustomerId !== customerId) {
      // Attempting to overwrite different customer ID - verify auth
      const authResult = await validateCheckoutAuth(req, { customerId })
      
      if (!authResult.authenticated || authResult.customerId !== customerId) {
        console.error('[SET_CUSTOMER_COOKIE] Unauthorized overwrite attempt:', {
          existingCustomerId: existingCustomerId.substring(0, 15) + '...',
          requestedCustomerId: customerId.substring(0, 15) + '...'
        })
        
        return NextResponse.json({
          ok: false,
          error: 'unauthorized',
          message: 'Cannot overwrite existing customer session'
        }, { status: 403 })
      }
    }
    
    // For new sessions or matching customer IDs, allow setting
    // (Trust the customerId from our own backend after login/OTP)
    
    // Generate encrypted token for sessionStorage
    let encryptedToken: string
    try {
      encryptedToken = encryptCustomerId(customerId)
    } catch (encryptError: any) {
      console.error('[SET_CUSTOMER_COOKIE] Encryption failed:', encryptError)
      return NextResponse.json({
        ok: false,
        error: 'encryption_failed',
        message: 'Failed to encrypt customer ID: ' + encryptError.message
      }, { status: 500 })
    }
    
    // Set httpOnly cookie with real customer ID
    const response = NextResponse.json({
      ok: true,
      encryptedToken,
      message: 'Customer session set successfully'
    })
    
    // Cookie settings
    const isProduction = process.env.NODE_ENV === 'production'
    const maxAge = 60 * 60 * 24 * 7 // 7 days
    
    response.cookies.set('customer_id', customerId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge,
      path: '/'
    })
    
    // Also set session fingerprint for extra security
    const userAgent = req.headers.get('user-agent') || ''
    const fingerprint = userAgent.substring(0, 50)
    
    response.cookies.set('customer_session_fingerprint', fingerprint, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge,
      path: '/'
    })
    
    return response
    
  } catch (error: any) {
    console.error('[SET_CUSTOMER_COOKIE] Error:', error)
    
    return NextResponse.json({
      ok: false,
      error: 'server_error',
      message: error.message || 'Failed to set customer session'
    }, { status: 500 })
  }
}

/**
 * Get Customer ID from httpOnly Cookie
 * 
 * GET /api/auth/session/set-customer
 * Returns the customer ID from httpOnly cookie (for server-side operations)
 */
export async function GET(req: NextRequest) {
  try {
    // Read customer ID from httpOnly cookie
    const customerId = req.cookies.get('customer_id')?.value
    
    if (!customerId) {
      return NextResponse.json({
        ok: false,
        error: 'no_customer_session',
        message: 'No customer session found'
      }, { status: 404 })
    }
    
    // Validate cookie is still valid
    const authResult = await validateCheckoutAuth(req, { customerId })
    
    if (!authResult.authenticated) {
      // Clear invalid cookie
      const response = NextResponse.json({
        ok: false,
        error: 'session_expired',
        message: 'Customer session has expired'
      }, { status: 401 })
      
      response.cookies.delete('customer_id')
      response.cookies.delete('customer_session_fingerprint')
      
      return response
    }
    
    // Generate encrypted token for response
    const encryptedToken = encryptCustomerId(customerId)
    
    return NextResponse.json({
      ok: true,
      customerId,
      encryptedToken,
      authMethod: authResult.method
    })
    
  } catch (error: any) {
    console.error('[GET_CUSTOMER_COOKIE] Error:', error)
    
    return NextResponse.json({
      ok: false,
      error: 'server_error',
      message: error.message
    }, { status: 500 })
  }
}

/**
 * Clear Customer Session
 * 
 * DELETE /api/auth/session/set-customer
 * Removes customer ID from httpOnly cookie
 */
export async function DELETE(req: NextRequest) {
  const response = NextResponse.json({
    ok: true,
    message: 'Customer session cleared'
  })
  
  response.cookies.delete('customer_id')
  response.cookies.delete('customer_session_fingerprint')
  
  return response
}
