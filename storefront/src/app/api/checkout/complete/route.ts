import { NextRequest, NextResponse } from 'next/server'
import { medusaApiClient } from '@/utils/medusaApiClient'
import { kvGet } from '@/lib/kv'
import { captureCashfreePayment } from '@/utils/cashfreeCapture'
import {
  acquireCompletionLock,
  markCompletionSuccess,
  validateCashfreeOrder,
} from '@/utils/orderCompletionGuard'
import { captureMedusaPayment, getPaymentIdFromOrder } from '@/utils/medusaPaymentCapture'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cartId = searchParams.get('cartId')
    const body = await req.json().catch(() => ({})) as any
    const orderId = typeof body?.orderId === 'string' ? body.orderId : undefined
    const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined
    try { console.log('[COMPLETE_API][start]', { cartId, orderId, customerIdPresent: Boolean(customerId) }) } catch {}

    // Best-effort: if we have both cartId and customerId, try to associate before completing
    if (cartId && customerId) {
      try {
        const origin = new URL(req.url).origin
        const assoc = await fetch(`${origin}/api/checkout/customer/associate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cartId, customerId })
        })
        try { console.log('[COMPLETE_API][associate][status]', { status: assoc.status }) } catch {}
      } catch (e: any) {
        try { console.log('[COMPLETE_API][associate][error]', { error: e?.message || String(e) }) } catch {}
      }
    }
    if (orderId && !cartId) {
      // Try resolve from in-memory map (dev only)
      const map: Map<string, string> | undefined = (global as any).orderCartMap
      const mapped = map?.get(orderId)
      if (mapped) {
        return await handleComplete(mapped)
      }
      // Try KV-backed mapping
      try {
        const kvMapped = await kvGet<string>(`cf:order:cart:${orderId}`)
        if (kvMapped) {
          return await handleComplete(kvMapped)
        }
      } catch (err) {
      }
    }
    if (!cartId) return NextResponse.json({ error: 'cartId required' }, { status: 400 })

    // Security: Acquire completion lock to prevent duplicates and race conditions
    const lockResult = await acquireCompletionLock(cartId, orderId)
    if (!lockResult.allowed) {
      try { console.warn('[COMPLETE_API][blocked]', { cartId, orderId, reason: lockResult.reason }) } catch {}
      return NextResponse.json({
        error: 'completion_blocked',
        reason: lockResult.reason,
        existingOrderId: lockResult.existingOrderId,
      }, { status: 409 })
    }

    // Security: If orderId provided, validate with Cashfree before completing
    if (orderId) {
      // SECURITY FIX: Verify orderId belongs to this cartId (prevent payment hijacking)
      const mappedCartId = await kvGet<string>(`cf:order:cart:${orderId}`)
      if (!mappedCartId) {
        // Fallback to in-memory map
        const map: Map<string, string> | undefined = (global as any).orderCartMap
        const memMappedCartId = map?.get(orderId)
        if (!memMappedCartId || memMappedCartId !== cartId) {
          console.error('[COMPLETE_API][security_violation]', { 
            orderId, 
            cartId, 
            mappedCartId: memMappedCartId,
            reason: 'orderId does not belong to this cartId' 
          })
          return NextResponse.json({
            error: 'invalid_order',
            message: 'This payment does not belong to your cart',
          }, { status: 403 })
        }
      } else if (mappedCartId !== cartId) {
        console.error('[COMPLETE_API][security_violation]', { 
          orderId, 
          cartId, 
          mappedCartId,
          reason: 'orderId belongs to different cartId' 
        })
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

    // Complete cart inline so we can trigger post-completion sync
    try {
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
              try { console.log('[COMPLETE_API][cashfree_capture]', { orderId, success: captureResult.success, data: captureResult.data }) } catch {}
              
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
      if (customerId && createdOrderId) {
        try {
          // Fetch order details to get shipping address
          const orderDetails = await medusaApiClient.getOrder(createdOrderId)
          const sa: any = (orderDetails as any)?.shipping_address || {}
          const first_name = (sa?.first_name && String(sa.first_name).trim()) || 'Customer'
          const last_name = (sa?.last_name && String(sa.last_name).trim()) || ''
          const phone = (sa?.phone && String(sa.phone).trim()) || ''

          if (phone) {
            const identityMethod = /@guest\.local$/i.test(customerId) ? 'phone' : 'email'
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
                customerId,
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
        } catch (e: any) {
          try { console.log('[COMPLETE_API][sync][error]', { error: e?.message || String(e) }) } catch {}
        }
      }

      return NextResponse.json({ ok: true, result })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || 'complete_failed' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'server_error', message: e?.message || String(e) }, { status: 500 })
  }
}

async function handleComplete(cartId: string) {
  // Legacy helper retained for compatibility; not used in new flow above.
  try {
    const result = await medusaApiClient.completeCart(cartId)
    try { console.log('[COMPLETE_API][complete][response]', { cartId, hasOrder: Boolean((result as any)?.order), hasCart: Boolean((result as any)?.cart) }) } catch {}
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'complete_failed' }, { status: 400 })
  }
}


