import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  
  if (!orderId) {
    return new Response(JSON.stringify({ ok: false, error: 'order_id_required' }), { status: 400 })
  }

  // Get customer ID from query params
  const url = new URL(req.url)
  const customerId = url.searchParams.get('customer_id')
  
  if (!customerId) {
    return new Response(JSON.stringify({ ok: false, error: 'customer_id_required' }), { status: 400 })
  }

  // Generate bridge token to authenticate as customer
  const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
  
  if (!token) {
    console.error('[INVOICE_DOWNLOAD][TOKEN_ERROR]', 'Failed to generate bridge token')
    return new Response(JSON.stringify({ ok: false, error: 'auth_failed' }), { status: 500 })
  }

  // Fetch the invoice PDF from backend
  const res = await storeFetch(`/store/custom/orders/${orderId}/invoices`, { 
    bearerToken: token,
    headers: { 'Accept': 'application/pdf' }
  })
  
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[INVOICE_DOWNLOAD][FETCH_ERROR]', { status: res.status, body: text?.slice?.(0, 200) })
    return new Response(JSON.stringify({ ok: false, error: 'fetch_failed' }), { status: res.status })
  }
  
  // Get the PDF buffer
  const buffer = await res.arrayBuffer()
  
  // Return the PDF with proper headers
  return new Response(buffer, { 
    status: 200, 
    headers: { 
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${orderId}.pdf"`,
      'Content-Length': buffer.byteLength.toString()
    } 
  })
}
