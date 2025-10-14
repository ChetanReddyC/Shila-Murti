import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'nodejs'

async function getCustomerIdFromSession(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions as any)
    if (!session || !(session as any)?.customerId) {
      return null
    }
    return (session as any).customerId
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params
  
  if (!orderId) {
    return new Response(JSON.stringify({ ok: false, error: 'order_id_required' }), { status: 400 })
  }

  const customerId = await getCustomerIdFromSession()
  
  if (!customerId) {
    console.error('[account/orders/invoices] Session expired or not authenticated')
    return new Response(JSON.stringify({ ok: false, error: 'session_expired' }), { status: 401 })
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
