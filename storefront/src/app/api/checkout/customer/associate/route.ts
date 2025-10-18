import type { NextRequest } from 'next/server'
import { storeFetch } from '@/lib/medusaServer'

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
    try { console.log('[ASSOC_API][start]', { cartId, customerId }) } catch {}
    
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
    
    
    // Backend configuration
    const BACKEND_URL = process.env.MEDUSA_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    
    try {
      // Prefer secure server-side association via backend route (no token in Next runtime required)
      const response = await storeFetch(`/store/custom/associate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-call': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({ cart_id: cartId, customer_id: customerId }),
      })
      
      const responseText = await response.text().catch(() => '')
      
      if (response.ok) {
        try { console.log('[ASSOC_API][ok]', { cartId, customerId }) } catch {}
        return new Response(JSON.stringify({
          ok: true,
          message: 'Customer successfully associated with cart',
          cartId,
          customerId
        }), { status: 200 })
      } else {
        try { console.log('[ASSOC_API][fallback]', { cartId, customerId, status: response.status, body: responseText }) } catch {}
        
        // Don't fail the checkout - let the sync handle it
        return new Response(JSON.stringify({
          ok: true,
          message: 'Customer association will be handled during checkout sync',
          fallback: true,
          adminError: responseText
        }), { status: 200 })
      }
      
    } catch (error: any) {
      try { console.log('[ASSOC_API][error]', { cartId, customerId, error: error?.message }) } catch {}
      // Don't fail the checkout - let the sync handle it
      return new Response(JSON.stringify({
        ok: true,
        message: 'Customer association will be handled during checkout sync',
        fallback: true,
        error: error.message
      }), { status: 200 })
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