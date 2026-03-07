import { NextRequest, NextResponse } from 'next/server'
import { medusaApiClient } from '@/utils/medusaApiClient'
import { kvGet } from '@/lib/kv'
import {
  acquireCompletionLock,
  validateCashfreeOrder,
  releaseCompletionLock,
  generateIdempotencyKey,
} from '@/utils/orderCompletionGuard'
import { getOrderCartMapping } from '@/lib/cashfreeMapping'
import { validateCheckoutAuth, extractCustomerInfo } from '@/utils/checkoutAuthValidation'
import { refreshAuthSession } from '@/lib/auth/sessionManager'
import { completeCartFromPayment } from '@/utils/completeCartFromPayment'

export async function POST(req: NextRequest) {
  // H1: CSRF protection — validate Origin for browser requests
  const internalSecret = req.headers.get('x-internal-call')
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET) {
    // Server-to-server call (e.g., webhook) — skip CSRF check
  } else {
    const origin = req.headers.get('origin')
    const expectedOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'
    if (origin && origin !== expectedOrigin) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
    }
  }

  console.log('============ COMPLETE API CALLED ============')
  try {
    const { searchParams } = new URL(req.url)
    const cartId = searchParams.get('cartId')
    const body = await req.json().catch(() => ({})) as any
    const orderId = typeof body?.orderId === 'string' ? body.orderId : undefined
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined

    // Generate idempotency key for this completion attempt (best practice for financial transactions)
    const idempotencyKey = cartId ? generateIdempotencyKey(cartId, orderId) : undefined

    console.log('============ CART ID:', cartId, 'ORDER ID:', orderId, '============')

    // DEBUG: Log received parameters without sensitive payloads
    console.log('[COMPLETE_API][START]', {
      cartId,
      orderId,
      customerIdPresent: Boolean(customerId),
      bodyKeys: Object.keys(body || {})
    })

    // CRITICAL SECURITY: Validate checkout authentication before processing
    // Try to get customer info from order mapping if available (for Cashfree returns)
    let customerInfo = extractCustomerInfo(body)

    if (orderId && !customerInfo.email && !customerInfo.phone) {
      try {
        const mapping = await getOrderCartMapping(orderId)
        if (mapping?.customer) {
          customerInfo = {
            ...customerInfo,
            customerId: customerInfo.customerId || mapping.customer.id,
            email: mapping.customer.email,
            phone: mapping.customer.phone,
            cartId: customerInfo.cartId || mapping.cartId
          }
          console.log('[COMPLETE_API][customer_info_from_mapping]', {
            orderId,
            hasEmail: !!mapping.customer.email,
            hasPhone: !!mapping.customer.phone
          })
        }
      } catch (error) {
        console.error('[COMPLETE_API][mapping_retrieval_error]', error)
      }
    }

    const authResult = await validateCheckoutAuth(req, {
      ...customerInfo,
      cartId: cartId || customerInfo.cartId
    })

    if (!authResult.authenticated) {
      console.error('[COMPLETE_API][auth_failed]', {
        cartId,
        orderId,
        reason: authResult.reason
      })

      return NextResponse.json({
        error: 'authentication_required',
        message: 'You must complete identity verification before placing an order. Please verify using OTP, Magic Link, or Login.',
        reason: authResult.reason
      }, { status: 403 })
    }

    console.log('[COMPLETE_API][auth_success]', {
      cartId,
      orderId,
      method: authResult.method,
    })

    // CRITICAL FIX: Use authenticated customerId for cart association
    const authenticatedCustomerId = authResult.customerId || customerId

    console.log('[COMPLETE_API][BEFORE_ASSOCIATE]', {
      cartId,
      willAttemptAssociation: !!(cartId && authenticatedCustomerId)
    })

    // CRITICAL FIX: Get cart details to extract shipping address for pre-completion sync
    let preCompletionSyncAttempted = false
    if (cartId && authenticatedCustomerId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
        const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

        // Fetch cart with shipping address
        const cartResponse = await fetch(
          `${baseUrl}/store/carts/${cartId}?fields=*shipping_address`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'x-publishable-api-key': publishableKey || ''
            }
          }
        )

        if (cartResponse.ok) {
          const cartData = await cartResponse.json()
          const cart = cartData?.cart
          const sa: any = cart?.shipping_address || {}
          const first_name = (sa?.first_name && String(sa.first_name).trim()) || ''
          const last_name = (sa?.last_name && String(sa.last_name).trim()) || ''
          const phone = (sa?.phone && String(sa.phone).trim()) || ''

          // Only sync if we have customer name data from shipping address
          if (first_name && phone) {
            console.log('[COMPLETE_API][PRE_COMPLETION_SYNC]', {
              hasName: !!first_name,
              hasPhone: !!phone
            })

            const isRealCustomer = authenticatedCustomerId.startsWith('cus_') && !authenticatedCustomerId.includes('@guest.local')
            const identityMethod = /@guest\.local$/i.test(authenticatedCustomerId) ? 'phone' : 'email'

            // Sync customer data BEFORE completing cart so order captures correct name
            const formData = {
              first_name,
              last_name,
              phone,
              address: {
                address_1: sa?.address_1 || '',
                address_2: sa?.address_2 || '',
                city: sa?.city || '',
                postal_code: sa?.postal_code || '',
                province: sa?.province || '',
                country_code: (sa?.country_code || 'in').toString().toLowerCase(),
                phone: phone,
              },
            }

            try {
              const syncRes = await fetch(`${new URL(req.url).origin}/api/checkout/customer/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: authenticatedCustomerId,
                  cartId,
                  orderId, // Pass Cashfree orderId for complete audit trail
                  formData,
                  orderCreated: false, // Not yet created
                  identityMethod,
                  whatsapp_authenticated: identityMethod === 'phone',
                  email_authenticated: identityMethod === 'email',
                }),
              })

              preCompletionSyncAttempted = true
              console.log('[COMPLETE_API][PRE_COMPLETION_SYNC_STATUS]', {
                status: syncRes.status,
                success: syncRes.ok
              })
            } catch (syncError: any) {
              console.log('[COMPLETE_API][PRE_COMPLETION_SYNC_ERROR]', {
                error: syncError?.message || String(syncError)
              })
            }
          } else {
            console.log('[COMPLETE_API][PRE_COMPLETION_SYNC_SKIPPED]', {
              reason: 'missing_name_or_phone',
              hasFirstName: !!first_name,
              hasPhone: !!phone
            })
          }
        }
      } catch (cartFetchError: any) {
        console.log('[COMPLETE_API][CART_FETCH_ERROR]', {
          error: cartFetchError?.message || String(cartFetchError)
        })
      }
    }

    // Best-effort: if we have both cartId and customerId, try to associate before completing
    if (cartId && authenticatedCustomerId) {
      console.log('[COMPLETE_API][ASSOCIATING_CUSTOMER]', { cartId })
      try {
        const origin = new URL(req.url).origin
        const cookieHeader = req.headers.get('cookie') || ''

        const assoc = await fetch(`${origin}/api/checkout/customer/associate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader // Forward authentication cookies
          },
          body: JSON.stringify({ cartId, customerId: authenticatedCustomerId })
        })
        console.log('[COMPLETE_API][ASSOCIATE_STATUS]', { status: assoc.status })
      } catch (e: any) {
        console.log('[COMPLETE_API][ASSOCIATE_ERROR]', { error: e?.message || String(e) })
      }
    } else {
      console.log('[COMPLETE_API][SKIPPING_ASSOCIATION]', {
        reason: !cartId ? 'no_cartId' : 'no_customerId',
        cartId,
      })
    }
    // SECURITY FIX C6: Resolve cartId from secure mapping if not provided
    // Eliminates the legacy handleComplete bypass that skipped all security checks
    let resolvedCartId = cartId
    if (orderId && !resolvedCartId) {
      try {
        const mapping = await getOrderCartMapping(orderId)
        if (mapping) {
          resolvedCartId = mapping.cartId
          console.log('[COMPLETE_API][cartId_resolved_from_mapping]', { orderId, cartId: resolvedCartId })
        }
      } catch (err) {
        console.error('[COMPLETE_API][mapping_resolve_error]')
      }
    }
    if (!resolvedCartId) return NextResponse.json({ error: 'cartId required' }, { status: 400 })

    // From here on, use resolvedCartId as the authoritative cart ID
    const finalCartId = resolvedCartId

    // SECURITY FIX: Acquire atomic distributed lock to prevent race conditions
    const lockResult = await acquireCompletionLock(finalCartId, orderId, idempotencyKey)
    if (!lockResult.allowed) {
      try { console.warn('[COMPLETE_API][blocked]', { cartId: finalCartId, orderId, reason: lockResult.reason }) } catch { }

      // If already completed, return the existing order (idempotency)
      if (lockResult.existingOrderId) {
        try {
          const existingOrder = await medusaApiClient.getOrder(lockResult.existingOrderId)
          return NextResponse.json({
            ok: true,
            result: { order: existingOrder },
            message: 'Order already exists'
          })
        } catch (e) {
          // If we can't fetch the order, just return the error
        }
      }

      return NextResponse.json({
        error: 'completion_blocked',
        reason: lockResult.reason,
        existingOrderId: lockResult.existingOrderId,
      }, { status: 409 })
    }

    // SECURITY FIX: Lock acquired, ensure it's released in finally block
    const completionLock = lockResult.lock!

    try {
      // Security: If orderId provided, validate with Cashfree before completing
      if (orderId) {
        // SECURITY FIX: Verify orderId belongs to this cartId using new mapping service
        const mapping = await getOrderCartMapping(orderId)

        if (!mapping) {
          console.error('[COMPLETE_API][security_violation] No mapping found')
          return NextResponse.json({
            error: 'invalid_order',
            message: 'This payment does not belong to your cart',
          }, { status: 403 })
        }

        if (mapping.cartId !== finalCartId) {
          console.error('[COMPLETE_API][security_violation] Cart ID mismatch')
          return NextResponse.json({
            error: 'invalid_order',
            message: 'This payment does not belong to your cart',
          }, { status: 403 })
        }

        const validation = await validateCashfreeOrder(orderId)
        if (!validation.valid) {
          try { console.error('[COMPLETE_API][validation_failed]', { orderId, error: validation.error, status: validation.status }) } catch { }
          return NextResponse.json({
            error: 'payment_validation_failed',
            details: validation.error,
            orderStatus: validation.status,
          }, { status: 400 })
        }
        try { console.log('[COMPLETE_API][validation_success]', { orderId, status: validation.status, amount: validation.amount }) } catch { }

        // SECURITY FIX C2: Verify paid amount matches cart total before completing
        // This prevents payment bypass where attacker pays INR 1 for a full-price order
        if (validation.amount !== undefined) {
          try {
            const amountCheckBaseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
            const amountCheckKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

            const amountCheckCartRes = await fetch(
              `${amountCheckBaseUrl}/store/carts/${finalCartId}`,
              {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'x-publishable-api-key': amountCheckKey || '',
                },
              }
            )

            if (amountCheckCartRes.ok) {
              const amountCheckCartData = await amountCheckCartRes.json()
              const cartTotalRupees = amountCheckCartData?.cart?.total // Medusa v2 stores INR in rupees

              if (typeof cartTotalRupees === 'number' && cartTotalRupees > 0) {
                const paidAmount = validation.amount // Cashfree returns in rupees
                const amountDiff = Math.abs(paidAmount - cartTotalRupees)

                if (amountDiff > 0.01) { // 1 paisa tolerance for floating-point rounding
                  console.error('[COMPLETE_API][amount_mismatch_violation]', {
                    orderId,
                    cartId: finalCartId,
                    paidAmount,
                    cartTotalRupees,
                    diff: amountDiff,
                  })
                  return NextResponse.json({
                    error: 'amount_mismatch',
                    message: 'The paid amount does not match the cart total. This order cannot be completed.',
                  }, { status: 400 })
                }

                console.log('[COMPLETE_API][amount_verified]', { orderId, cartId: finalCartId, paidAmount, cartTotalRupees })
              }
            } else {
              // Cart fetch failed — fail closed
              console.error('[COMPLETE_API][amount_check_cart_fetch_failed]', { cartId: finalCartId, status: amountCheckCartRes.status })
              return NextResponse.json({
                error: 'amount_verification_failed',
                message: 'Could not verify payment amount. Please contact support.',
              }, { status: 502 })
            }
          } catch (amountCheckError) {
            console.error('[COMPLETE_API][amount_check_error]', { cartId: finalCartId, orderId, error: String(amountCheckError) })
            return NextResponse.json({
              error: 'amount_verification_failed',
              message: 'Amount verification failed. Please contact support.',
            }, { status: 502 })
          }
        }
      }

      // Double-check: Verify cart hasn't been completed by another request
      const doubleCheckKey = `order:completed:${finalCartId}`
      const existingCompletion = await kvGet<any>(doubleCheckKey)

      if (existingCompletion?.status === 'completed') {
        console.warn('[COMPLETE_API][race_condition_detected]', {
          cartId: finalCartId,
          existingOrderId: existingCompletion.orderId,
          message: 'Cart was completed by another request despite lock'
        })

        // Release lock and return existing order
        await releaseCompletionLock(completionLock)

        try {
          const existingOrder = await medusaApiClient.getOrder(existingCompletion.orderId)
          return NextResponse.json({
            ok: true,
            result: { order: existingOrder },
            message: 'Order already exists'
          })
        } catch (e) {
          return NextResponse.json({
            error: 'order_already_completed',
            orderId: existingCompletion.orderId
          }, { status: 409 })
        }
      }

      // Complete cart, mark success, store metadata, and auto-capture via shared utility
      const completionResult = await completeCartFromPayment({
        cartId: finalCartId,
        cashfreeOrderId: orderId,
        customerId: authenticatedCustomerId,
        idempotencyKey,
      })

      if (!completionResult.success) {
        console.error('[COMPLETE_API][completion_failed]', {
          cartId: finalCartId,
          orderId,
          error: completionResult.error,
        })
        return NextResponse.json(
          { ok: false, error: completionResult.error || 'complete_failed' },
          { status: 400 }
        )
      }

      const createdOrder = completionResult.order
      const createdOrderId = completionResult.orderId
      const result = { order: createdOrder }

      // If we have a customer and an order, attempt a post-completion sync using order shipping address
      // SKIP if we already synced before completion
      if (authenticatedCustomerId && createdOrderId && !preCompletionSyncAttempted) {
        try {
          // SECURITY FIX: Skip sync for authenticated real customers to prevent duplicate account creation
          const isRealCustomer = authenticatedCustomerId.startsWith('cus_') && !authenticatedCustomerId.includes('@guest.local')

          if (isRealCustomer) {
            try {
              console.log('[COMPLETE_API][sync][skipped_authenticated]', {
                orderId: createdOrderId,
                reason: 'Real authenticated customer - no sync needed'
              })
            } catch { }
          } else {
            // Only sync for guest customers
            // Fetch order details to get shipping address
            const orderDetails = await medusaApiClient.getOrder(createdOrderId)
            const sa: any = (orderDetails as any)?.shipping_address || {}
            const first_name = (sa?.first_name && String(sa.first_name).trim()) || 'Customer'
            const last_name = (sa?.last_name && String(sa.last_name).trim()) || ''
            const phone = (sa?.phone && String(sa.phone).trim()) || ''

            if (phone) {
              const identityMethod = /@guest\.local$/i.test(authenticatedCustomerId) ? 'phone' : 'email'
              const formData = {
                first_name,
                last_name,
                phone,
                address: {
                  address_1: sa?.address_1 || '',
                  city: sa?.city || '',
                  postal_code: sa?.postal_code || '',
                  province: sa?.province || '',
                  country_code: (sa?.country_code || 'in').toString().toLowerCase(),
                  phone: phone,
                },
              }
              const syncRes = await fetch(`${new URL(req.url).origin}/api/checkout/customer/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: authenticatedCustomerId,
                  cartId: finalCartId,
                  orderId: createdOrderId,
                  formData,
                  orderCreated: true,
                  identityMethod,
                  whatsapp_authenticated: identityMethod === 'phone',
                  email_authenticated: identityMethod === 'email',
                }),
              })
              try { console.log('[COMPLETE_API][sync][status]', { status: syncRes.status }) } catch { }
            } else {
              try { console.log('[COMPLETE_API][sync][skipped]', { reason: 'no_phone_in_shipping_address' }) } catch { }
            }
          }
        } catch (e: any) {
          try { console.log('[COMPLETE_API][sync][error]', { error: e?.message || String(e) }) } catch { }
        }
      } else if (preCompletionSyncAttempted) {
        try {
          console.log('[COMPLETE_API][post_sync][skipped]', {
            reason: 'already_synced_before_completion',
            orderId: createdOrderId
          })
        } catch { }
      }

      // CRITICAL: Refresh authentication session after successful order
      // This extends the session TTL (keep-alive) for multi-order checkout flows
      // Top 1% Practice: Keep sessions alive on activity to prevent re-authentication
      try {
        console.log('[COMPLETE_API][SESSION_REFRESH][start]', {
          orderId: createdOrderId,
          hasEmail: !!customerInfo.email,
          hasPhone: !!customerInfo.phone
        })

        const refreshed = await refreshAuthSession(
          customerInfo.email,
          customerInfo.phone
        )

        if (refreshed) {
          console.log('[COMPLETE_API][SESSION_REFRESH][success]', {
            orderId: createdOrderId,
            impact: 'Session TTL extended for future orders'
          })
        } else {
          console.warn('[COMPLETE_API][SESSION_REFRESH][not_found]', {
            orderId: createdOrderId,
            impact: 'User may need to re-authenticate for next order',
            hasEmail: !!customerInfo.email,
            hasPhone: !!customerInfo.phone
          })
        }
      } catch (refreshError: any) {
        // Non-blocking - order already completed successfully
        console.error('[COMPLETE_API][SESSION_REFRESH][error]', {
          orderId: createdOrderId,
          error: refreshError?.message || String(refreshError),
          impact: 'User may need to re-authenticate for next order'
        })
      }

      return NextResponse.json({ ok: true, result })

    } catch (e: any) {
      console.error('[COMPLETE_API][error]', {
        cartId: finalCartId,
        orderId,
        error: e?.message || String(e)
      })
      return NextResponse.json({ ok: false, error: e?.message || 'complete_failed' }, { status: 400 })
    } finally {
      // SECURITY FIX: Always release lock, even on error
      await releaseCompletionLock(completionLock)
    }
  } catch (e: any) {
    console.error('[COMPLETE_API][outer_error]', {
      error: e?.message || String(e)
    })
    return NextResponse.json({ error: 'server_error', message: e?.message || String(e) }, { status: 500 })
  }
}


