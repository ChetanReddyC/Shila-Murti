import { NextRequest } from 'next/server'
import { kvDel } from '@/lib/kv'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function POST(req: NextRequest) {
  try {
    // Get current session
    const session = await getServerSession(authOptions)
    const customerId = (session as any)?.customerId
    const email = (session as any)?.user?.email
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
    console.error('Logout error:', error)
    return new Response(
      JSON.stringify({ ok: false, error: 'logout_failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}