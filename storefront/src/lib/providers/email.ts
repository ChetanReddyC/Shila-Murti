type SendResult = { ok: boolean; id?: string; error?: string }

// Type declarations only — actual values read at call time (#17)
const ENV_DEFAULTS = {
  EMAIL_FROM: 'no-reply@example.com',
  CONTACT_EMAIL_FROM: 'support-required@shilamurti.com',
} as const

/** Escape HTML special characters to prevent XSS (#1) */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/** Strip CRLF to prevent email header injection (#3) */
function sanitizeHeader(str: string): string {
  return str.replace(/[\r\n]/g, '')
}

export async function sendMagicLink(toEmail: string, url: string): Promise<SendResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
  const EMAIL_FROM = process.env.EMAIL_FROM || ENV_DEFAULTS.EMAIL_FROM

  // Prefer Resend if configured
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: toEmail,
        from: EMAIL_FROM,
        subject: 'Your login link',
        html: `<a href="${url}">Log in</a>`,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => `HTTP ${res.status}`)
      return { ok: false, error: `[resend] ${txt}` }
    }
    const json = await res.json().catch(() => ({} as any))
    return { ok: true, id: json?.id || `resend-${Date.now()}` }
  }

  // Fallback to SendGrid REST if configured
  if (SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: EMAIL_FROM },
        subject: 'Your login link',
        content: [{ type: 'text/html', value: `<a href="${url}">Log in</a>` }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => `HTTP ${res.status}`)
      return { ok: false, error: `[sendgrid] ${txt}` }
    }
    return { ok: true, id: `sendgrid-${Date.now()}` }
  }

  // Dev no-op
  return { ok: true, id: `dev-email-${Date.now()}` }
}

type ContactFormData = {
  name: string
  email: string
  subject: string
  message: string
}

export async function sendContactEmail(data: ContactFormData): Promise<SendResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL || ''
  const CONTACT_EMAIL_FROM = process.env.CONTACT_EMAIL_FROM || ENV_DEFAULTS.CONTACT_EMAIL_FROM

  const { name, email, subject, message } = data

  if (!CONTACT_EMAIL) {
    console.error('CONTACT_EMAIL env var is not set')
    return { ok: false, error: 'Contact email not configured' }
  }

  // #18 — Fail loudly in production if no email provider is configured
  if (process.env.NODE_ENV === 'production' && !RESEND_API_KEY && !SENDGRID_API_KEY) {
    console.error('No email provider API key configured in production')
    return { ok: false, error: 'Email service not configured' }
  }

  // Sanitize all user inputs for HTML (#1) and headers (#3)
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(sanitizeHeader(email))
  const safeSubject = escapeHtml(subject)
  const safeMessage = escapeHtml(message)
  const headerEmail = sanitizeHeader(email)
  const headerSubject = sanitizeHeader(subject)

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1a1a2e; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">New Contact Form Submission</h2>
      </div>
      <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px; width: 100px; vertical-align: top;">Name</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #111827; font-size: 14px; font-weight: 500;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px; vertical-align: top;">Email</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #111827; font-size: 14px;">
              <a href="mailto:${safeEmail}" style="color: #2563eb; text-decoration: none;">${safeEmail}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280; font-size: 14px; vertical-align: top;">Subject</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #111827; font-size: 14px; font-weight: 500;">${safeSubject}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Message</td>
            <td style="padding: 12px 0; color: #111827; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${safeMessage}</td>
          </tr>
        </table>
      </div>
      <div style="padding: 16px 32px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">This email was sent from the Shila Murti contact form.</p>
      </div>
    </div>
  `

  // Prefer Resend if configured
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: CONTACT_EMAIL,
        from: CONTACT_EMAIL_FROM,
        reply_to: headerEmail,
        subject: `[Contact Form] ${headerSubject}`,
        html,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => `HTTP ${res.status}`)
      return { ok: false, error: `[resend] ${txt}` }
    }
    const json = await res.json().catch(() => ({} as any))
    return { ok: true, id: json?.id || `resend-${Date.now()}` }
  }

  // Fallback to SendGrid (#16)
  if (SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: CONTACT_EMAIL }] }],
        from: { email: CONTACT_EMAIL_FROM },
        reply_to: { email: headerEmail },
        subject: `[Contact Form] ${headerSubject}`,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => `HTTP ${res.status}`)
      return { ok: false, error: `[sendgrid] ${txt}` }
    }
    return { ok: true, id: `sendgrid-${Date.now()}` }
  }

  // Dev no-op
  console.log('[dev] Contact email:', { to: CONTACT_EMAIL, from: CONTACT_EMAIL_FROM, subject: headerSubject, name, email: headerEmail })
  return { ok: true, id: `dev-contact-${Date.now()}` }
}
