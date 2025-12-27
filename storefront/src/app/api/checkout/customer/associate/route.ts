import type { NextRequest } from 'next/server'
import { storeFetch } from '@/lib/medusaServer'
import { validateCheckoutAuth, extractCustomerInfo } from '@/utils/checkoutAuthValidation'
import { createAuthSession } from '@/lib/auth/sessionManager'

export const runtime = 'nodejs'

/**
 * Customer-Cart Association API
 * 
 * SECURITY: Associates an existing customer with a cart before completion.
 * This endpoint is protected with authentication validation to prevent
 * malicious actors from linking carts to unauthorized customer accounts.
 */

export async function POST(req: NextRequest) {
  console.log('============ ASSOCIATE API CALLED ============')
  console.log('============ ASSOCIATE API CALLED ============')
  console.log('============ ASSOCIATE API CALLED ============')

  try {
    const body = await req.json().catch(() => ({}))
    const { cartId, customerId } = body

    // Validate required parameters
    if (!cartId || typeof cartId !== 'string') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'invalid_cart_id',
        message: 'Valid cart ID is required'
      }), { status: 400 })
    }

    if (!customerId || typeof customerId !== 'string') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'invalid_customer_id',
        message: 'Valid customer ID is required'
      }), { status: 400 })
    }

    // CRITICAL SECURITY FIX (Issue #4): Validate authentication before association
    // This prevents attackers from linking carts to arbitrary customer accounts
    console.log('[ASSOC_API][SECURITY] Validating authentication for cart-customer association')


    const customerInfo = extractCustomerInfo(body)
    console.log('[ASSOC_API][CUSTOMER_INFO_EXTRACTED]', {
      hasEmail: !!customerInfo.email,
      hasPhone: !!customerInfo.phone,
      hasCustomerId: !!customerInfo.customerId,
      emailPrefix: customerInfo.email?.substring(0, 15),
      phonePrefix: customerInfo.phone?.substring(0, 10)
    })

    const authResult = await validateCheckoutAuth(req, {
      ...customerInfo,
      cartId,
      customerId
    })

    if (!authResult.authenticated) {
      console.error('[ASSOC_API][SECURITY] Authentication failed for association attempt:', {
        cartId,
        requestedCustomerId: customerId,
        reason: authResult.reason
      })

      return new Response(JSON.stringify({
        ok: false,
        error: 'authentication_required',
        message: 'You must complete identity verification (OTP, Magic Link, or Login) before associating customer with cart.',
        reason: authResult.reason
      }), { status: 403 })
    }

    // CRITICAL SECURITY FIX (Issue #4): Verify ownership of customer ID
    // Ensure the authenticated user can only associate THEIR OWN customer ID
    const authenticatedCustomerId = authResult.customerId

    if (authenticatedCustomerId && authenticatedCustomerId !== customerId) {
      console.error('[ASSOC_API][SECURITY] Customer ID ownership violation:', {
        cartId,
        requestedCustomerId: customerId,
        authenticatedCustomerId: authenticatedCustomerId,
        authMethod: authResult.method
      })

      return new Response(JSON.stringify({
        ok: false,
        error: 'unauthorized_customer_id',
        message: 'You can only associate your own customer ID with a cart. Authentication mismatch detected.',
        securityNote: 'This incident has been logged.'
      }), { status: 403 })
    }

    console.log('[ASSOC_API][SECURITY] Authentication and ownership verified:', {
      cartId,
      customerId,
      authMethod: authResult.method
    })


    // Backend configuration
    const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

    if (!INTERNAL_SECRET) {
      console.error('[ASSOC_API] Internal API secret not configured')
      return new Response(JSON.stringify({
        ok: false,
        error: 'configuration_error',
        message: 'Internal API secret not configured'
      }), { status: 500 })
    }

    try {
      // CRITICAL FIX: Strict association - must succeed or fail, no fallback
      const response = await storeFetch(`/store/custom/associate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-call': INTERNAL_SECRET,
        },
        body: JSON.stringify({ cart_id: cartId, customer_id: customerId }),
      })

      const responseText = await response.text().catch(() => '')
      let responseData: any = {}

      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = { raw: responseText }
      }

      if (response.ok) {
        // Check if backend actually succeeded
        if (responseData.ok === false || responseData.cart_associated === false) {
          const errorDetails = responseData.cart_error || responseData.error || 'Unknown backend error'
          console.error('[ASSOC_API] Backend association failed:', errorDetails)

          return new Response(JSON.stringify({
            ok: false,
            error: 'backend_association_failed',
            message: `Backend failed to associate customer: ${errorDetails}`,
            details: responseData
          }), { status: 500 })
        }

        // CRITICAL FIX FOR MULTI-ORDER SESSIONS (TOP 1% APPROACH)
        // After successful association, create a persistent authentication session
        // This enables the user to place multiple orders without re-authenticating
        console.log('[ASSOC_API][SESSION_CREATE][start]', {
          customerId,
          authMethod: authResult.method,
          hasEmail: !!customerInfo.email,
          hasPhone: !!customerInfo.phone
        })


        try {
          // CRITICAL: Fetch customer details from Medusa if email/phone not provided
          // This is needed because the session manager requires at least one identifier
          let sessionEmail = customerInfo.email
          let sessionPhone = customerInfo.phone

          if (!sessionEmail && !sessionPhone) {
            console.log('[ASSOC_API][FETCHING_CUSTOMER_DETAILS]', {
              customerId: customerId.substring(0, 15) + '...',
              reason: 'Email/phone not in request body, fetching from Medusa'
            })

            try {
              // Use storeFetch helper which includes proper authentication
              const customerResponse = await storeFetch(`/store/customers/me`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              })

              if (customerResponse.ok) {
                const customerData = await customerResponse.json()
                const customer = customerData?.customer

                sessionEmail = customer?.email
                sessionPhone = customer?.phone

                console.log('[ASSOC_API][CUSTOMER_DETAILS_FETCHED]', {
                  customerId: customerId.substring(0, 15) + '...',
                  hasEmail: !!sessionEmail,
                  hasPhone: !!sessionPhone,
                  emailPrefix: sessionEmail?.substring(0, 15),
                  phonePrefix: sessionPhone?.substring(0, 10)
                })
              } else {
                console.error('[ASSOC_API][CUSTOMER_FETCH_FAILED]', {
                  customerId: customerId.substring(0, 15) + '...',
                  status: customerResponse.status
                })
              }
            } catch (fetchError: any) {
              console.error('[ASSOC_API][CUSTOMER_FETCH_ERROR]', {
                customerId: customerId.substring(0, 15) + '...',
                error: fetchError?.message || String(fetchError)
              })
            }
          }

          // Create persistent 7-day session for future orders
          const sessionResult = await createAuthSession(
            customerId,
            authResult.method === 'magic_link' ? 'magic_link' :
              authResult.method === 'otp' ? 'otp' : 'password',
            sessionEmail,
            sessionPhone
          )

          if (sessionResult.success) {
            console.log('[ASSOC_API][SESSION_CREATE][success]', {
              customerId: customerId.substring(0, 15) + '...',
              sessionId: sessionResult.sessionId?.substring(0, 40) + '...',
              method: authResult.method,
              hasEmail: !!sessionEmail,
              hasPhone: !!sessionPhone
            })
          } else {
            // Log error but don't fail the association - session is a UX enhancement
            console.error('[ASSOC_API][SESSION_CREATE][failed]', {
              customerId: customerId.substring(0, 15) + '...',
              error: sessionResult.error,
              impact: 'User may need to re-authenticate for next order'
            })
          }
        } catch (sessionError: any) {
          // Non-blocking error - association succeeded even if session creation failed
          console.error('[ASSOC_API][SESSION_CREATE][exception]', {
            customerId: customerId.substring(0, 15) + '...',
            error: sessionError?.message || String(sessionError),
            impact: 'User may need to re-authenticate for next order'
          })
        }

        return new Response(JSON.stringify({
          ok: true,
          message: 'Customer successfully associated with cart',
          cartId,
          customerId,
          backend_result: responseData
        }), { status: 200 })
      } else {
        const errorMessage = `Backend association failed: ${responseText || 'Unknown error'}`
        console.error('[ASSOC_API] Backend returned error:', response.status, errorMessage)

        return new Response(JSON.stringify({
          ok: false,
          error: 'backend_association_failed',
          message: errorMessage,
          status: response.status,
          details: responseText
        }), { status: response.status >= 500 ? 500 : 400 })
      }

    } catch (error: any) {
      const errorMessage = `Customer association exception: ${error?.message || String(error)}`
      console.error('[ASSOC_API] Association error:', errorMessage)

      return new Response(JSON.stringify({
        ok: false,
        error: 'association_exception',
        message: errorMessage,
        details: error.message
      }), { status: 500 })
    }

  } catch (error: any) {

    return new Response(JSON.stringify({
      ok: false,
      error: 'processing_error',
      message: error.message || 'Failed to process customer association request'
    }), { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({
    ok: true,
    message: 'Customer association endpoint is accessible',
    timestamp: Date.now()
  }), { status: 200 })
}