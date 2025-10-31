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