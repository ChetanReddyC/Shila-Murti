'use client'

import { useEffect, useState } from 'react'
import styles from './done.module.css'

export const dynamic = 'force-dynamic';

export default function MagicDonePage() {
  const [closeFailed, setCloseFailed] = useState(false)
  const [email, setEmail] = useState('')
  const [isCheckout, setIsCheckout] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState('/checkout')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const emailParam = (params.get('email') || '').toLowerCase()
    const state = params.get('state') || ''
    const phone = params.get('phone') || ''
    const cartId = params.get('cartId') || ''
    const isCheckoutFlow = state.startsWith('checkout-')

    setEmail(emailParam)
    setIsCheckout(isCheckoutFlow)

    if (isCheckoutFlow && cartId) {
      const cp = new URLSearchParams()
      cp.set('verified', 'true')
      if (emailParam) cp.set('email', emailParam)
      if (cartId) cp.set('cartId', cartId)
      if (phone) cp.set('phone', phone)
      setCheckoutUrl(`/checkout?${cp.toString()}`)
    }

    // Store phone if provided
    if (phone) {
      try { sessionStorage.setItem('mfa_phone', phone) } catch {}
    }

    // For checkout flows: call verify endpoint to get customerId,
    // then write to localStorage so the original checkout tab picks it up.
    // We add a 2s delay to give Cloudflare KV time to propagate the marker.
    if (isCheckoutFlow && emailParam) {
      const runVerify = async () => {
        // Wait for KV propagation — the confirm route just wrote the marker
        await new Promise(r => setTimeout(r, 2000))

        let customerId: string | null = null

        // Retry verify up to 4 times (the endpoint also retries internally)
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
          try {
            const res = await fetch('/api/auth/session/checkout/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: emailParam,
                cartId,
                phone: phone || '',
                formData: {
                  first_name: 'Customer',
                  last_name: '',
                  phone: phone || '',
                  address: { country_code: 'in' }
                }
              })
            })
            const json = await res.json().catch(() => ({}))
            if (res.ok && json?.ok === true && json.customerId) {
              customerId = String(json.customerId)
              break
            }
          } catch {}
        }

        // Write to localStorage — the original checkout tab's cross-tab handler reads this
        try {
          localStorage.setItem('magic_verification_success', JSON.stringify({
            verified: true,
            email: emailParam,
            phone,
            cartId,
            customerId, // null if verify failed, original tab's polling will handle it
            timestamp: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000)
          }))
        } catch {}

        // Also set the per-email marker
        try {
          const key = `magic_verified:${emailParam}${state ? `:${state}` : ''}`
          localStorage.setItem(key, String(Date.now()))
        } catch {}

        setStatus(customerId ? 'success' : 'error')

        // Try to close this tab
        try { window.close() } catch {}
        // If still open after 600ms, show the UI
        setTimeout(() => setCloseFailed(true), 600)
      }

      runVerify()
    } else {
      // Non-checkout flow: just set markers and close
      if (emailParam) {
        try {
          const key = `magic_verified:${emailParam}${state ? `:${state}` : ''}`
          localStorage.setItem(key, String(Date.now()))
        } catch {}
      }
      try { window.close() } catch {}
      setTimeout(() => setCloseFailed(true), 600)
    }
  }, [])

  // Show "Verifying..." while waiting, nothing while attempting close
  if (!closeFailed) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.content} style={{ padding: '60px 24px' }}>
            <h1 className={styles.title}>Verifying your email...</h1>
            <p className={styles.subtitle}>This will only take a moment.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoDot} />
            <span className={styles.brandName}>Shila Murthi</span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.successIcon}>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="28" cy="28" r="28" fill="#48BB78" />
              <path d="M18 28L25 35L38 22" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 className={styles.title}>Verification Successful!</h1>

          {email && (
            <p className={styles.subtitle}>
              <strong>{email}</strong> has been verified.
            </p>
          )}

          <div className={styles.instructions}>
            {isCheckout ? (
              <>
                <p>Return to your checkout tab to complete your order.</p>
                <p className={styles.hint}>Your checkout is being updated automatically.</p>
              </>
            ) : (
              <p>Return to your previous tab to continue.</p>
            )}
          </div>

          <div className={styles.actions}>
            <button
              onClick={() => { try { window.close() } catch {} }}
              className={styles.closeButton}
            >
              Close This Tab
            </button>

            {isCheckout && (
              <>
                <span className={styles.divider}>or</span>
                <a href={checkoutUrl} className={styles.checkoutLink}>
                  Go to Checkout
                </a>
              </>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <p>You can safely close this tab.</p>
        </div>
      </div>
    </div>
  )
}
