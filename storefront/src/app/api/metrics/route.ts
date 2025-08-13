export const runtime = 'nodejs'

import type { NextRequest } from 'next/server'
import { getMetricsClient } from '@/lib/metrics'

export async function GET(_req: NextRequest) {
  const client = await getMetricsClient().catch(() => null)
  if (!client) return new Response('# metrics_unavailable', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  try {
    const body = await client.register.metrics()
    return new Response(body, { status: 200, headers: { 'Content-Type': client.register.contentType } })
  } catch {
    return new Response('# metrics_unavailable', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
}


