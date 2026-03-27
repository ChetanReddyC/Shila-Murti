import { NextRequest, NextResponse } from 'next/server'
import { sendContactEmail } from '@/lib/providers/email'

// --- Rate Limiter (#2) ---
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX = 5
const rateLimitMap = new Map<string, { count: number; firstRequest: number }>()

// Clean up stale entries every 15 minutes
setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of rateLimitMap) {
        if (now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
            rateLimitMap.delete(ip)
        }
    }
}, RATE_LIMIT_WINDOW_MS)

function isRateLimited(ip: string): boolean {
    const now = Date.now()
    const entry = rateLimitMap.get(ip)

    if (!entry || now - entry.firstRequest > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { count: 1, firstRequest: now })
        return false
    }

    entry.count++
    return entry.count > RATE_LIMIT_MAX
}

// --- Input Limits (#7) ---
const MAX_LENGTHS = { name: 100, email: 254, subject: 200, message: 5000 } as const

export async function POST(req: NextRequest) {
    try {
        // Rate limiting (#2)
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429 }
            )
        }

        // CSRF protection (#4)
        const origin = req.headers.get('origin')
        const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL
        if (allowedOrigin) {
            if (!origin || new URL(origin).origin !== new URL(allowedOrigin).origin) {
                return NextResponse.json(
                    { error: 'Forbidden' },
                    { status: 403 }
                )
            }
        } else if (!origin) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        const body = await req.json()
        let { name, email, subject, message } = body

        // Type validation (#26)
        if (
            typeof name !== 'string' ||
            typeof email !== 'string' ||
            typeof subject !== 'string' ||
            typeof message !== 'string'
        ) {
            return NextResponse.json(
                { error: 'Invalid input types' },
                { status: 400 }
            )
        }

        // Trim whitespace (#6)
        name = name.trim()
        email = email.trim()
        subject = subject.trim()
        message = message.trim()

        // Validate required fields
        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            )
        }

        // Enforce max lengths (#7)
        if (
            name.length > MAX_LENGTHS.name ||
            email.length > MAX_LENGTHS.email ||
            subject.length > MAX_LENGTHS.subject ||
            message.length > MAX_LENGTHS.message
        ) {
            return NextResponse.json(
                { error: 'One or more fields exceed maximum length' },
                { status: 400 }
            )
        }

        // Stricter email validation (#5)
        // No control chars, reasonable local/domain lengths, max 254 total
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        const [localPart, domain] = email.split('@')
        if (
            !emailRegex.test(email) ||
            email.length > 254 ||
            !localPart || localPart.length > 64 ||
            !domain || domain.length > 253 ||
            // eslint-disable-next-line no-control-regex
            /[\x00-\x1f]/.test(email)
        ) {
            return NextResponse.json(
                { error: 'Invalid email address' },
                { status: 400 }
            )
        }

        const result = await sendContactEmail({ name, email, subject, message })

        if (!result.ok) {
            console.error('Contact email send failed:', result.error)
            return NextResponse.json(
                { error: 'Failed to send message. Please try again later.' },
                { status: 500 }
            )
        }

        // #25 — Don't leak internal message ID
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Contact API error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
