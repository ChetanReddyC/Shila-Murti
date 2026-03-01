import { NextRequest, NextResponse } from 'next/server'
import { sendContactEmail } from '@/lib/providers/email'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { name, email, subject, message } = body

        // Validate required fields
        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            )
        }

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
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

        return NextResponse.json({ success: true, id: result.id })
    } catch (error) {
        console.error('Contact API error:', error)
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        )
    }
}
