'use client'

import { useEffect } from 'react'
import { registerPasskey } from '@/lib/passkey/register'

// Disable static generation for this page since it uses URL params
export const dynamic = 'force-dynamic';

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

      // Note: Removed automatic passkey registration prompt for better UX
      // Users can set up passkeys later from their account settings

      // Check if we're in a checkout flow
      const isCheckoutFlow = state && state.startsWith('checkout-');

      if (isCheckoutFlow) {
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


