import type { NextRequest } from 'next/server'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch, getStoreBaseUrl } from '@/lib/medusaServer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export const runtime = 'nodejs'

/**
 * Helper: extract customer ID from NextAuth session.
 */
async function getCustomerIdFromSession(): Promise<string | null> {
    try {
        const session = await getServerSession(authOptions as any)
        if (!session || !(session as any)?.customerId) return null
        return (session as any).customerId
    } catch {
        return null
    }
}

/**
 * Helper: extract customer name from NextAuth session.
 */
async function getCustomerNameFromSession(): Promise<string | null> {
    try {
        const session = await getServerSession(authOptions as any)
        const name = (session as any)?.user?.name || (session as any)?.name
        return name || null
    } catch {
        return null
    }
}

// ────────────────────────────────────────────────────────────────
// GET /api/reviews?product_id=prod_xxx
// Public proxy — No auth required. Forwards to Medusa backend.
// ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const url = new URL(req.url)
    const productId = url.searchParams.get('product_id')

    if (!productId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'Missing product_id' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    try {
        const baseUrl = getStoreBaseUrl()
        const endpoint = `${baseUrl}/store/custom/reviews?product_id=${encodeURIComponent(productId)}`
        const apiKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''

        const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-publishable-api-key': apiKey,
            },
        })

        const text = await res.text()
        return new Response(text, {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error('[api/reviews][GET] Error:', error?.message)
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to fetch reviews' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}

// ────────────────────────────────────────────────────────────────
// POST /api/reviews
// Auth-required proxy — reads session, signs bridge token, POSTs
// to Medusa backend with bearer auth.
// Body: { product_id, author_name, rating, content }
// ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    // 1. Read session
    const customerId = await getCustomerIdFromSession()
    if (!customerId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'not_authenticated', message: 'Please sign in to submit a review' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // 2. Sign bridge token for Medusa backend
    const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
    if (!token) {
        console.error('[api/reviews][POST] Failed to sign bridge token')
        return new Response(
            JSON.stringify({ ok: false, error: 'auth_failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // 3. Forward body to Medusa
    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid request body' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    try {
        const res = await storeFetch('/store/custom/reviews', {
            method: 'POST',
            bearerToken: token,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body) as any,
        })

        const text = await res.text()
        return new Response(text, {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error('[api/reviews][POST] Error:', error?.message)
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to submit review' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}

// ────────────────────────────────────────────────────────────────
// PUT /api/reviews
// Auth-required proxy — forwards review edit to Medusa backend.
// Body: { review_id, author_name?, rating?, content? }
// ────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
    const customerId = await getCustomerIdFromSession()
    if (!customerId) {
        return new Response(
            JSON.stringify({ ok: false, error: 'not_authenticated', message: 'Please sign in to edit a review' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const token = await signBridgeToken({ sub: customerId, mfaComplete: true })
    if (!token) {
        console.error('[api/reviews][PUT] Failed to sign bridge token')
        return new Response(
            JSON.stringify({ ok: false, error: 'auth_failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return new Response(
            JSON.stringify({ ok: false, error: 'Invalid request body' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    try {
        const res = await storeFetch('/store/custom/reviews', {
            method: 'PUT',
            bearerToken: token,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body) as any,
        })

        const text = await res.text()
        return new Response(text, {
            status: res.status,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error('[api/reviews][PUT] Error:', error?.message)
        return new Response(
            JSON.stringify({ ok: false, error: 'Failed to update review' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
