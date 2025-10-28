import { NextRequest, NextResponse } from 'next/server'
import { medusaApiClient } from '@/utils/medusaApiClient'
import { kvGet } from '@/lib/kv'
import { captureCashfreePayment } from '@/utils/cashfreeCapture'
import {
  acquireCompletionLock,
  markCompletionSuccess,
  validateCashfreeOrder,
  releaseCompletionLock,
} from '@/utils/orderCompletionGuard'
import { captureMedusaPayment, getPaymentIdFromOrder } from '@/utils/medusaPaymentCapture'
import { getOrderCartMapping } from '@/lib/cashfreeMapping'
import { validateCheckoutAuth, extractCustomerInfo } from '@/utils/checkoutAuthValidation'

export async function POST(req: NextRequest) {
  console.log('============ COMPLETE API CALLED ============')
  console.log('============ COMPLETE API CALLED ============')
  console.log('============ COMPLETE API CALLED ============')
  try {
    const { searchParams } = new URL(req.url)
    const cartId = searchParams.get('cartId')
    const body = await req.json().catch(() => ({})) as any
    const orderId = typeof body?.orderId === 'string' ? body.orderId : undefined
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined
    
    console.log('============ CART ID:', cartId, 'ORDER ID:', orderId, 'CUSTOMER ID:', customerId, '============')
    
    // DEBUG: Log received parameters without sensitive payloads
    console.log('[COMPLETE_API][START]', {
      cartId,
      orderId,
      customerId,
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
      customerId: authResult.customerId
    })

    // CRITICAL FIX: Use authenticated customerId for cart association
    const authenticatedCustomerId = authResult.customerId || customerId
    
    console.log('[COMPLETE_API][BEFORE_ASSOCIATE]', {
      cartId,
      authenticatedCustomerId,
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
              customerId: authenticatedCustomerId,
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
      console.log('[COMPLETE_API][ASSOCIATING_CUSTOMER]', { cartId, customerId: authenticatedCustomerId })
      try {
        const origin = new URL(req.url).origin
        const assoc = await fetch(`${origin}/api/checkout/customer/associate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartId, customerId: authenticatedCustomerId })
        })
        console.log('[COMPLETE_API][ASSOCIATE_STATUS]', { status: assoc.status, customerId: authenticatedCustomerId })
      } catch (e: any) {
        console.log('[COMPLETE_API][ASSOCIATE_ERROR]', { error: e?.message || String(e) })
      }
    } else {
      console.log('[COMPLETE_API][SKIPPING_ASSOCIATION]', {
        reason: !cartId ? 'no_cartId' : 'no_customerId',
        cartId,
        authenticatedCustomerId
      })
    }
    if (orderId && !cartId) {
      // SECURITY FIX: Resolve cartId from secure mapping service
      try {
        const mapping = await getOrderCartMapping(orderId)
        if (mapping) {
          return await handleComplete(mapping.cartId, orderId)
        }
      } catch (err) {
        console.error('[COMPLETE_API][mapping_resolve_error]')
      }
    }
    if (!cartId) return NextResponse.json({ error: 'cartId required' }, { status: 400 })

    // SECURITY FIX: Acquire atomic distributed lock to prevent race conditions
    const lockResult = await acquireCompletionLock(cartId, orderId)
    if (!lockResult.allowed) {
      try { console.warn('[COMPLETE_API][blocked]', { cartId, orderId, reason: lockResult.reason }) } catch {}
      
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
        
        if (mapping.cartId !== cartId) {
          console.error('[COMPLETE_API][security_violation] Cart ID mismatch')
          return NextResponse.json({
            error: 'invalid_order',
            message: 'This payment does not belong to your cart',
          }, { status: 403 })
        }
        
        const validation = await validateCashfreeOrder(orderId)
        if (!validation.valid) {
          try { console.error('[COMPLETE_API][validation_failed]', { orderId, error: validation.error, status: validation.status }) } catch {}
          return NextResponse.json({
            error: 'payment_validation_failed',
            details: validation.error,
            orderStatus: validation.status,
          }, { status: 400 })
        }
        try { console.log('[COMPLETE_API][validation_success]', { orderId, status: validation.status, amount: validation.amount }) } catch {}
      }

      // Double-check: Verify cart hasn't been completed by another request
      const doubleCheckKey = `order:completed:${cartId}`
      const existingCompletion = await kvGet<any>(doubleCheckKey)
      
      if (existingCompletion?.status === 'completed') {
        console.warn('[COMPLETE_API][race_condition_detected]', {
          cartId,
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

      // Complete cart inline so we can trigger post-completion sync
      const result = await medusaApiClient.completeCart(cartId)
      try { console.log('[COMPLETE_API][complete][response]', { cartId, hasOrder: Boolean((result as any)?.order), hasCart: Boolean((result as any)?.cart) }) } catch {}

      const createdOrder = (result as any)?.order
      const createdOrderId = createdOrder?.id as string | undefined

      // Debug: Log full order structure to find payment ID location
      try {
        console.log('[COMPLETE_API][order_structure]', {
          orderId: createdOrderId,
          hasPayment: 'payment' in (createdOrder || {}),
          hasPayments: 'payments' in (createdOrder || {}),
          hasPaymentId: 'payment_id' in (createdOrder || {}),
          hasPaymentCollection: 'payment_collection' in (createdOrder || {}),
          orderKeys: Object.keys(createdOrder || {})
        })
      } catch {}

      // Mark completion as successful to prevent duplicates
      if (createdOrderId) {
        await markCompletionSuccess(cartId, createdOrderId)
        try { console.log('[COMPLETE_API][marked_success]', { cartId, orderId: createdOrderId }) } catch {}
      }

      // Store Cashfree order ID in Medusa order metadata for future refunds
      if (createdOrderId && orderId) {
        console.log('[COMPLETE_API][metadata_storage_attempt]', {
          createdOrderId,
          cashfreeOrderId: orderId
        })
        
        try {
          const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
          const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          
          const metadataUpdateResponse = await fetch(
            `${baseUrl}/store/custom/orders/${createdOrderId}/metadata`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-publishable-api-key': publishableKey || '',
                'x-internal-call': process.env.INTERNAL_API_SECRET || '',
              },
              body: JSON.stringify({
                cashfree_order_id: orderId,
              })
            }
          )

          if (metadataUpdateResponse.ok) {
            console.log('[COMPLETE_API][metadata_stored]', { 
              medusaOrderId: createdOrderId, 
              cashfreeOrderId: orderId 
            })
          } else {
            const errorText = await metadataUpdateResponse.text().catch(() => '')
            console.error('[COMPLETE_API][metadata_store_failed]', {
              medusaOrderId: createdOrderId,
              cashfreeOrderId: orderId,
              status: metadataUpdateResponse.status,
              error: errorText
            })
          }
        } catch (metadataError: any) {
          console.error('[COMPLETE_API][metadata_store_exception]', {
            medusaOrderId: createdOrderId,
            cashfreeOrderId: orderId,
            error: metadataError?.message || String(metadataError)
          })
        }
      }

      // Auto-capture payment after successful order creation
      // Try Cashfree capture first (if enabled), then fallback to Medusa capture
      if (orderId && createdOrder && createdOrderId) {
        const autoCaptureEnabled = process.env.CASHFREE_AUTO_CAPTURE === 'true'
        let capturedViaCashfree = false

        // Attempt 1: Cashfree API capture (only if feature enabled)
        if (autoCaptureEnabled) {
          try {
            const orderTotal = createdOrder?.total
            if (orderTotal) {
              const captureResult = await captureCashfreePayment(orderId, orderTotal / 100)
              try { console.log('[COMPLETE_API][cashfree_capture]', { orderId, success: captureResult.success }) } catch {}
              
              if (captureResult.success) {
                capturedViaCashfree = true
              } else {
                const isNotEnabled = 
                  captureResult.error?.includes('not enabled') || 
                  captureResult.data?.message?.includes('not enabled') ||
                  captureResult.data?.code === 'request_invalid'
                
                if (isNotEnabled) {
                  try { 
                    console.info('[COMPLETE_API][cashfree_capture][not_enabled]', { 
                      message: 'Preauthorization not enabled. Payment auto-settled by Cashfree. Will capture in Medusa.',
                      orderId
                    }) 
                  } catch {}
                } else {
                  try { console.warn('[COMPLETE_API][cashfree_capture][failed]', { orderId, error: captureResult.error }) } catch {}
                }
              }
            }
          } catch (captureError: any) {
            try { console.error('[COMPLETE_API][cashfree_capture][exception]', { orderId, error: captureError?.message || String(captureError) }) } catch {}
          }
        }

        // Attempt 2: Medusa payment capture (fallback when Cashfree already settled)
        if (!capturedViaCashfree) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
            const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
            
            // Fetch order with properly expanded payment_collections.payments
            let paymentId: string | undefined
            
            try {
              const orderResponse = await fetch(
                `${baseUrl}/store/orders/${createdOrderId}?fields=*payment_collections.payments`,
                {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-publishable-api-key': publishableKey || ''
                  }
                }
              )

              if (orderResponse.ok) {
                const orderData = await orderResponse.json()
                const order = orderData?.order
                paymentId = order?.payment_collections?.[0]?.payments?.[0]?.id
              } else {
                console.error('[COMPLETE_API][order_fetch_failed]', {
                  orderId: createdOrderId,
                  status: orderResponse.status
                })
              }
            } catch (fetchError: any) {
              console.error('[COMPLETE_API][order_fetch_exception]', {
                orderId: createdOrderId,
                error: fetchError?.message || String(fetchError)
              })
            }
            
            if (paymentId) {
              const medusaCaptureResult = await captureMedusaPayment(paymentId, createdOrderId)
              
              if (!medusaCaptureResult.success) {
                console.error('[COMPLETE_API][medusa_capture][failed]', { 
                  orderId: createdOrderId,
                  paymentId,
                  error: medusaCaptureResult.error
                })
              }
            } else {
              console.warn('[COMPLETE_API][medusa_capture][no_payment_id]', { 
                orderId: createdOrderId
              })
            }
          } catch (medusaCaptureError: any) {
            console.error('[COMPLETE_API][medusa_capture][exception]', { 
              orderId: createdOrderId,
              error: medusaCaptureError?.message || String(medusaCaptureError) 
            })
          }
        }
      }

      // If we have a customer and an order, attempt a post-completion sync using order shipping address
      // SKIP if we already synced before completion
      if (authenticatedCustomerId && createdOrderId && !preCompletionSyncAttempted) {
        try {
          // SECURITY FIX: Skip sync for authenticated real customers to prevent duplicate account creation
          const isRealCustomer = authenticatedCustomerId.startsWith('cus_') && !authenticatedCustomerId.includes('@guest.local')
          
          if (isRealCustomer) {
            try { 
              console.log('[COMPLETE_API][sync][skipped_authenticated]', { 
                customerId: authenticatedCustomerId, 
                orderId: createdOrderId,
                reason: 'Real authenticated customer - no sync needed' 
              }) 
            } catch {}
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
                  cartId,
                  orderId: createdOrderId,
                  formData,
                  orderCreated: true,
                  identityMethod,
                  whatsapp_authenticated: identityMethod === 'phone',
                  email_authenticated: identityMethod === 'email',
                }),
              })
              try { console.log('[COMPLETE_API][sync][status]', { status: syncRes.status }) } catch {}
            } else {
              try { console.log('[COMPLETE_API][sync][skipped]', { reason: 'no_phone_in_shipping_address' }) } catch {}
            }
          }
        } catch (e: any) {
          try { console.log('[COMPLETE_API][sync][error]', { error: e?.message || String(e) }) } catch {}
        }
      } else if (preCompletionSyncAttempted) {
        try { 
          console.log('[COMPLETE_API][post_sync][skipped]', { 
            reason: 'already_synced_before_completion',
            orderId: createdOrderId
          }) 
        } catch {}
      }

      return NextResponse.json({ ok: true, result })
      
    } catch (e: any) {
      console.error('[COMPLETE_API][error]', {
        cartId,
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

async function handleComplete(cartId: string, cashfreeOrderId?: string) {
  // Legacy helper retained for compatibility
  try {
    const result = await medusaApiClient.completeCart(cartId)
    const createdOrder = (result as any)?.order
    const createdOrderId = createdOrder?.id as string | undefined
    
    console.log('[COMPLETE_API][handleComplete]', { 
      cartId, 
      createdOrderId,
      cashfreeOrderId,
      hasOrder: Boolean(createdOrder)
    })
    
    // Store Cashfree order ID in metadata if provided
    if (createdOrderId && cashfreeOrderId) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
        const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
        
        console.log('[COMPLETE_API][handleComplete_metadata_attempt]', {
          createdOrderId,
          cashfreeOrderId
        })
        
        const metadataUpdateResponse = await fetch(
          `${baseUrl}/store/custom/orders/${createdOrderId}/metadata`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-publishable-api-key': publishableKey || '',
              'x-internal-call': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              cashfree_order_id: cashfreeOrderId,
            })
          }
        )

        if (metadataUpdateResponse.ok) {
          console.log('[COMPLETE_API][handleComplete_metadata_stored]', { 
            medusaOrderId: createdOrderId, 
            cashfreeOrderId 
          })
        } else {
          const errorText = await metadataUpdateResponse.text().catch(() => '')
          console.error('[COMPLETE_API][handleComplete_metadata_failed]', {
            medusaOrderId: createdOrderId,
            cashfreeOrderId,
            status: metadataUpdateResponse.status,
            error: errorText
          })
        }
      } catch (metadataError: any) {
        console.error('[COMPLETE_API][handleComplete_metadata_exception]', {
          medusaOrderId: createdOrderId,
          cashfreeOrderId,
          error: metadataError?.message || String(metadataError)
        })
      }
    }
    
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'complete_failed' }, { status: 400 })
  }
}


