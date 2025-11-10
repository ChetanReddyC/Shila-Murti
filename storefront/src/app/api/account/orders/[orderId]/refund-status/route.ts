import { NextRequest, NextResponse } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const customerId = await getCustomerIdFromSession()

    if (!customerId) {
      console.error('[account/orders/refund-status] Session expired or not authenticated')
      return NextResponse.json({ message: 'Session expired' }, { status: 401 })
    }

    // Generate bridge token
    const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
    if (!token) {
      return NextResponse.json({ message: 'Auth failed' }, { status: 500 })
    }
    
    // Forward request to backend
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    const response = await fetch(
      `${baseUrl}/store/custom/orders/${orderId}/refund-status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[REFUND_STATUS_API_ERROR]', error)
    return NextResponse.json(
      { message: 'Internal server error', error: error?.message },
      { status: 500 }
    )
  }
}
