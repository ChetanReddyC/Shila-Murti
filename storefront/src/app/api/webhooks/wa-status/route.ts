import type { NextRequest } from 'next/server'
import { kafkaEmit } from '@/lib/kafka'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  // Accept both direct status callbacks and Cloud API change payloads
  // a) { message_id, status }
  if (body?.message_id && body?.status) {
    try { await kafkaEmit('auth.wa_status', { message_id: body.message_id, status: body.status, timestamp: Date.now() }) } catch {}
    return new Response('ok', { status: 200 })
  }
  // b) Cloud API webhook: { entry: [ { changes: [ { value: { statuses: [ { id, status } ] } } ] } ] }
  const status = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]
  if (status?.id && status?.status) {
    try { await kafkaEmit('auth.wa_status', { message_id: status.id, status: status.status, timestamp: Date.now() }) } catch {}
    return new Response('ok', { status: 200 })
  }
  return new Response('bad', { status: 400 })
}


