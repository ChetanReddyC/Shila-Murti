type SendResult = { ok: boolean; id?: string; error?: string }

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@example.com'

export async function sendMagicLink(toEmail: string, url: string): Promise<SendResult> {
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


