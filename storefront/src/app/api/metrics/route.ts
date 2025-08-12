export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { getMetricsClient } from '@/lib/metrics'

export async function GET(_req: NextRequest) {
  try {
    const client = await getMetricsClient()
    const body = await client.register.metrics()
    return new Response(body, { status: 200, headers: { 'Content-Type': client.register.contentType } })
  } catch (e) {
    return new Response('metrics_unavailable', { status: 500 })
  }
}


