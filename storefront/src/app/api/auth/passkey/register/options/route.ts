import type { NextRequest } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { kvSet } from '@/lib/kv'

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Shila Murthi'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const { userId, username } = await req.json().catch(() => ({}))
  if (!userId || !username) {
    return new Response(JSON.stringify({ error: 'missing_user' }), { status: 400 })
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userId,
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
  })

  // Store challenge bound to user for verification
  await kvSet(`webauthn:reg:${userId}`, { challenge: options.challenge }, 5 * 60)

  return new Response(JSON.stringify({ options, origin: ORIGIN }), { status: 200 })
}


