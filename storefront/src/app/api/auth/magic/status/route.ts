import { kvGet } from '@/lib/kv'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = (searchParams.get('email') || '').toLowerCase()
  if (!email) return new Response(JSON.stringify({ verified: false }), { status: 200 })
  // Strict verification: require a positive marker set by confirm route
  const ok = await kvGet(`magic:ok:${email}`)
  const verified = Boolean(ok)
  return new Response(JSON.stringify({ verified }), { status: 200 })
}


