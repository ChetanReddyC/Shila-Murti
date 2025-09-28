type SendResult = { ok: boolean; messageId?: string; error?: string }

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0'
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || ''
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'login_code'
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'
const TEMPLATE_PARAM_COUNT = parseInt(process.env.WHATSAPP_TEMPLATE_PARAM_COUNT || '1', 10)
const BUTTON_URL_INDEX = process.env.WHATSAPP_TEMPLATE_BUTTON_URL_INDEX || '0'
const BUTTON_URL_PARAM = process.env.WHATSAPP_TEMPLATE_BUTTON_URL_PARAM
const BUTTON_URL_USE_OTP = process.env.WHATSAPP_TEMPLATE_BUTTON_URL_USE_OTP === 'true'

function normalizeTo(to: string): string {
  // Cloud API typically expects country code and number without '+' or symbols
  // First remove all non-digit characters
  let normalized = (to || '').replace(/\D/g, '');
  
  // If the number starts with 0 but isn't 000..., remove the leading 0
  if (normalized.startsWith('0') && normalized.length > 1) {
    normalized = normalized.substring(1);
  }
  
  // If the number starts with 91 and is Indian number, keep the country code
  // Otherwise, assume it's a local number and add 91 for India
  if (!normalized.startsWith('91')) {
    normalized = '91' + normalized;
  }
  
  return normalized;
}

export async function sendWhatsAppLoginCode(toPhoneE164: string, otp: string): Promise<SendResult> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    // Not configured → simulate success for local dev
    return { ok: true, messageId: `dev-${Date.now()}` }
  }

  // Store WhatsApp authentication metadata
  const authMetadata = {
    phone: toPhoneE164,
    phone_normalized: normalizeTo(toPhoneE164),
    otp_sent: true,
    timestamp: new Date().toISOString(),
    expires_in: 300, // 5 minutes
    status: 'pending'
  };

  // Store authentication metadata in session or database
  // This is a placeholder for actual implementation
  // In a real app, you would store this in a database or session store

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`
  const template: any = {
    name: TEMPLATE_NAME,
    language: { code: TEMPLATE_LANG },
  }
  const components: any[] = []
  if (TEMPLATE_PARAM_COUNT > 0) {
    components.push({
      type: 'body',
      parameters: [
        { type: 'text', text: otp },
      ],
    })
  }
  // Optional URL button parameter (for templates that require it)
  if (BUTTON_URL_PARAM || BUTTON_URL_USE_OTP) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: BUTTON_URL_INDEX,
      parameters: [
        { type: 'text', text: BUTTON_URL_PARAM || otp },
      ],
    })
  }
  if (components.length > 0) template.components = components

  const body = {
    messaging_product: 'whatsapp',
    to: normalizeTo(toPhoneE164),
    type: 'template',
    template,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: text || `HTTP ${res.status}` }
  }
  const json = await res.json().catch(() => ({} as any))
  const messageId = json?.messages?.[0]?.id || `wa-${Date.now()}`
  return { ok: true, messageId }
}


