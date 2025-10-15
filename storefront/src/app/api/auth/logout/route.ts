import { NextRequest } from 'next/server'
import { kvDel } from '@/lib/kv'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { signBridgeToken } from '@/lib/auth/signing'
import { blacklistJWT } from '@/lib/auth/jwtBlacklist'
import { getToken } from 'next-auth/jwt'

export async function POST(req: NextRequest) {
  try {
    // Get current session and token
    const session = await getServerSession(authOptions)
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const customerId = (session as any)?.customerId
    const email = (session as any)?.user?.email
    
    // CRITICAL: Blacklist the JWT jti to prevent reuse
    const jti = (token as any)?.jti
    if (jti) {
      const parsedMaxAge = Number(process.env.SESSION_MAX_AGE_SEC)
      const sessionMaxAge = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0
        ? Math.floor(parsedMaxAge)
        : 3600
      await blacklistJWT(jti, sessionMaxAge)
      console.log('[LOGOUT] Blacklisted JWT:', jti)
    }
    
    // Revoke JWT token on backend if customer is authenticated
    if (customerId) {
      const body = await req.json().catch(() => ({ revokeAll: false }))
      const revokeAll = body?.revokeAll === true
      
      const bridgeToken = await signBridgeToken({ sub: customerId, mfaComplete: true })
      if (bridgeToken) {
        const BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
        try {
          await fetch(`${BASE_URL}/store/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${bridgeToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ revokeAll })
          })
        } catch (backendError) {
          console.error('[LOGOUT] Failed to revoke backend token:', backendError)
        }
      }
    }
    const phone = (session as any)?.user?.phone

    // Clean up KV store entries for this user
    const cleanupPromises = []
    
    if (customerId) {
      cleanupPromises.push(kvDel(`otp:ok:+${customerId}`))
      cleanupPromises.push(kvDel(`magic:ok:${customerId}`))
    }
    
    if (email) {
      cleanupPromises.push(kvDel(`otp:ok:${email}`))
      cleanupPromises.push(kvDel(`magic:ok:${email}`))
    }
    
    if (phone) {
      cleanupPromises.push(kvDel(`otp:ok:+${phone.replace(/\D/g, '')}`))
      cleanupPromises.push(kvDel(`magic:ok:${phone}`))
    }
    
    // Execute all cleanup operations
    await Promise.allSettled(cleanupPromises)

    // Return success response
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'logout_failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}