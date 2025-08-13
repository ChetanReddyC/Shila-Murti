'use client'

import React, { useCallback, useState } from 'react'
import { usePasskey, PublicKeyRequestOptionsJSON } from '@/hooks/usePasskey'
import ComboMfaModal from '@/components/ComboMfaModal'
import { signIn } from 'next-auth/react'
import styles from './loginPage.module.css'
import SetupPasskeyButton from '@/components/SetupPasskeyButton'
import PasskeyNudge from '@/components/PasskeyNudge'

type Identifier = {
  email?: string
  phone?: string
}

async function fetchPasskeyRequestOptions(identifier: Identifier): Promise<{ options: PublicKeyRequestOptionsJSON; userId: string } | null> {
  try {
    const res = await fetch('/api/auth/passkey/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...identifier, userId: identifier.email || identifier.phone }),
    })
    if (!res.ok) return null
    return (await res.json()) as any
  } catch {
    return null
  }
}

async function verifyPasskey(assertion: unknown, identifier: Identifier): Promise<{ comboRequired?: boolean; token?: string }> {
  const res = await fetch('/api/auth/passkey/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(typeof assertion === 'object' && assertion ? (assertion as Record<string, unknown>) : {}),
      userId: identifier.email || identifier.phone,
      ...identifier,
    }),
  })
  if (!res.ok) throw new Error('Passkey verification failed')
  return res.json()
}

export default function LoginPage() {
  const { authenticate } = usePasskey()
  const [identifier, setIdentifier] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [comboRequired, setComboRequired] = useState<boolean>(false)

  // Attempt passkey silently when identifier is prefilled via sessionStorage
  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? (sessionStorage.getItem('identifier') || '') : ''
    if (stored && !identifier) setIdentifier(stored)
  }, [identifier])

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('Checking sign-in options…')
    setComboRequired(false)

    const id: Identifier = identifier.includes('@') ? { email: identifier } : { phone: identifier }
    // Policy gate: ask server if passkey should be attempted for this identifier
    try {
      const policyRes = await fetch('/api/auth/passkey/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id) })
      const policy = await policyRes.json().catch(() => ({}))
      if (!policyRes.ok || !policy?.hasPasskey) {
        setStatus('Passkey not available; requiring combo‑MFA.')
        setComboRequired(true)
        return
      }
      // Before attempting, check if platform authenticator is available; if not, skip to combo-MFA
      const isAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable
      if (typeof isAvailable === 'function') {
        const available = await isAvailable()
        if (!available) {
          setStatus('Passkey not available on this device; requiring combo‑MFA.')
          setComboRequired(true)
          return
        }
      }
    } catch {
      // If checks fail, continue with optimistic passkey attempt
    }

    setStatus('Attempting passkey…')
    const fetched = await fetchPasskeyRequestOptions(id)
    if (!fetched) {
      setStatus('Passkey not available; requiring combo‑MFA.')
      setComboRequired(true)
      return
    }
    const { options, userId: canonicalUserId } = fetched

    const { data, error } = await authenticate(options)
    if (error || !data) {
      setStatus('Passkey failed; requiring combo‑MFA.')
      setComboRequired(true)
      return
    }

    try {
      // Always send the canonical userId (customerId) back for verification lookup
      const result = await verifyPasskey({ ...data, userId: canonicalUserId }, id)
      if (result.comboRequired) {
        setStatus('Device not recognized; requiring combo‑MFA.')
        setComboRequired(true)
        return
      }
      setStatus('Authenticated with passkey.')
      // If we got a credential id back, trigger a background refresh of passkey list later
      try { if (result?.token && typeof window !== 'undefined') window.sessionStorage.setItem('lastPasskeyCredential', result.token) } catch {}
      // Ensure we have a Medusa customer and persist its id for account features
      try {
        const ensure = await fetch('/api/account/customer/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id) })
        const ej = await ensure.json().catch(() => ({}))
        if (ej?.customerId && typeof window !== 'undefined') {
          window.sessionStorage.setItem('customerId', String(ej.customerId))
        }
      } catch {}
      // Bind session to the identifier, include customerId when available in sessionStorage
      let customerId: string | undefined
      try { if (typeof window !== 'undefined') customerId = sessionStorage.getItem('customerId') || undefined } catch {}
      await signIn('session', { identifier: (id.email || id.phone) as string, customerId, redirect: true, callbackUrl: '/account' })
    } catch (err) {
      setStatus('Passkey verification error; requiring combo‑MFA.')
      setComboRequired(true)
    }
  }, [authenticate, identifier])

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logoDot} />
          <h1 className={styles.title}>Sign in</h1>
        </div>
        <p className={styles.subtitle}>Use your email or phone number. We’ll try a passkey first, then verify via OTP + magic link if needed.</p>
        <form onSubmit={onSubmit}>
          <label className={styles.fieldLabel} htmlFor="identifier">Email or phone</label>
          <input
            id="identifier"
            name="identifier"
            className={styles.input}
            type="text"
            placeholder="you@example.com or +1 555 555 5555"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
          <div className={styles.actions}>
            <button className={styles.primaryBtn} type="submit" disabled={!identifier.trim()}>Continue</button>
          </div>
        </form>
        <p aria-live="polite" className={styles.status}>{status}</p>
        <p className={styles.helperRow}>Having trouble? <a className={styles.link} href="/contact">Contact support</a></p>
        <div style={{ marginTop: 16 }}>
          {/* Post-elevation prompt uses PasskeyNudge in authenticated contexts; keep demo button for initial UX if needed */}
          <PasskeyNudge />
        </div>
      </div>
      <ComboMfaModal
        open={comboRequired}
        identifier={identifier.includes('@') ? { email: identifier } : { phone: identifier }}
        onClose={() => setComboRequired(false)}
        onComplete={() => { setStatus('MFA complete. Logged in.'); setComboRequired(false) }}
      />
    </div>
  )
}


