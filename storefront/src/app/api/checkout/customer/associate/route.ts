import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * Customer-Cart Association API
 * 
 * Associates an existing customer with a cart before completion to prevent
 * Medusa from automatically creating a duplicate customer.
 */

export async function POST(req: NextRequest) {
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
    
    console.log('[CustomerAssociate] Associating customer with cart:', { cartId, customerId })
    
    // Backend configuration
    const BACKEND_URL = process.env.MEDUSA_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    const ADMIN_TOKEN = process.env.MEDUSA_ADMIN_TOKEN || ''
    
    if (!ADMIN_TOKEN) {
      console.warn('[CustomerAssociate] No admin token available, skipping direct association')
      return new Response(JSON.stringify({
        ok: true,
        message: 'Customer association will be handled during checkout sync',
        skipped: true
      }), { status: 200 })
    }
    
    try {
      // Use Medusa admin API to update cart with customer
      const response = await fetch(`${BACKEND_URL}/admin/carts/${cartId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-medusa-access-token': ADMIN_TOKEN
        },
        body: JSON.stringify({
          customer_id: customerId
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      const responseText = await response.text().catch(() => '')
      
      if (response.ok) {
        console.log('[CustomerAssociate] Successfully associated customer with cart')
        return new Response(JSON.stringify({
          ok: true,
          message: 'Customer successfully associated with cart',
          cartId,
          customerId
        }), { status: 200 })
      } else {
        console.warn('[CustomerAssociate] Admin API association failed:', {
          status: response.status,
          response: responseText
        })
        
        // Don't fail the checkout - let the sync handle it
        return new Response(JSON.stringify({
          ok: true,
          message: 'Customer association will be handled during checkout sync',
          fallback: true,
          adminError: responseText
        }), { status: 200 })
      }
      
    } catch (error: any) {
      console.warn('[CustomerAssociate] Admin API error:', error.message)
      
      // Don't fail the checkout - let the sync handle it
      return new Response(JSON.stringify({
        ok: true,
        message: 'Customer association will be handled during checkout sync',
        fallback: true,
        error: error.message
      }), { status: 200 })
    }
    
  } catch (error: any) {
    console.error('[CustomerAssociate] Request processing error:', error)
    
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