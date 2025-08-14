'use client'

import { useEffect } from 'react'
import { registerPasskey } from '@/lib/passkey/register'

export default function MagicDonePage() {
  useEffect(() => {
    (async () => {
      let email = ''
      let state = ''
      try {
        const params = new URLSearchParams(window.location.search)
        email = (params.get('email') || '').toLowerCase()
        state = params.get('state') || ''
        const phone = params.get('phone') || ''
        if (email) {
          const key = `magic_verified:${email}${state ? `:${state}` : ''}`
          localStorage.setItem(key, String(Date.now()))
          if (phone) {
            try { sessionStorage.setItem('mfa_phone', phone) } catch {}
          }
        }
      } catch {}

      // Attempt proactive passkey registration on this page (user gesture via confirm)
      try {
        const hasPK = typeof window !== 'undefined' && !!(window.PublicKeyCredential)
        const isAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable
        let platformOK = hasPK
        if (typeof isAvailable === 'function') {
          platformOK = await isAvailable()
        }
        if (platformOK && (sessionStorage.getItem('mfa_phone') || email)) {
          const consent = window.confirm('Authentication complete. Set up a passkey on this device for faster sign-in next time?')
          if (consent) {
            // Ensure/get a stable user id for this identifier
            let preferred = sessionStorage.getItem('mfa_phone') || ''
            let userId = preferred ? preferred : email
            try {
              const res = await fetch('/api/account/customer/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferred ? { phone: preferred } : { email }) })
              const json = await res.json().catch(() => ({}))
              if (res.ok && json?.customerId) {
                userId = String(json.customerId)
                try { sessionStorage.setItem('customerId', userId) } catch {}
              }
            } catch {}
            try {
              const username = userId
              const ok = await registerPasskey(userId, username)
              if (ok) {
                try { sessionStorage.setItem('passkeyNudgeDismissed', '1') } catch {}
              }
            } catch {}
          }
        }
      } catch {}

      // Check if we're in a checkout flow with order confirmation active
      const orderConfirmationActive = sessionStorage.getItem('order_confirmation_active');
      const isCheckoutFlow = state && state.startsWith('checkout-');
      
      if (isCheckoutFlow || orderConfirmationActive) {
        // If in checkout flow, close this window/tab rather than redirect
        // This prevents disrupting the checkout flow in the original tab
        try {
          window.close();
          return; // In case close fails, don't redirect
        } catch {}
      }
      
      // If not in checkout or close failed, route back to the app root
      const base = (typeof window !== 'undefined') ? (window.location.origin || '') : ''
      window.location.replace(base || '/')
    })()
  }, [])

  return null
}


