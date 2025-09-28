import { NextRequest, NextResponse } from 'next/server'
import { medusaApiClient } from '@/utils/medusaApiClient'
import { kvGet } from '@/lib/kv'

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

    // Complete cart inline so we can trigger post-completion sync
    try {
      const result = await medusaApiClient.completeCart(cartId)
      try { console.log('[COMPLETE_API][complete][response]', { cartId, hasOrder: Boolean((result as any)?.order), hasCart: Boolean((result as any)?.cart) }) } catch {}

      // If we have a customer and an order, attempt a post-completion sync using order shipping address
      const createdOrderId = (result as any)?.order?.id as string | undefined
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


