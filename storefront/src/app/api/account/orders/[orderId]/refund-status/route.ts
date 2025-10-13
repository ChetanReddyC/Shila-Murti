import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customer_id')

    if (!customerId) {
      return NextResponse.json({ message: 'Customer ID required' }, { status: 400 })
    }

    // Get auth token from session
    const authHeader = req.headers.get('authorization')
    
    // Forward request to backend
    const baseUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    const response = await fetch(
      `${baseUrl}/store/custom/orders/${orderId}/refund-status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || '',
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
