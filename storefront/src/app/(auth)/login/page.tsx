'use client'

import React, { useCallback, useState } from 'react'
import { usePasskey, PublicKeyRequestOptionsJSON } from '@/hooks/usePasskey'
import ComboMfaModal from '@/components/ComboMfaModal'
import { signIn } from 'next-auth/react'
import styles from './loginPage.module.css'
import SetupPasskeyButton from '@/components/SetupPasskeyButton'

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

async function verifyPasskey(assertion: unknown, identifier: Identifier, canonicalUserId: string): Promise<{ comboRequired?: boolean; token?: string }> {
  const res = await fetch('/api/auth/passkey/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(typeof assertion === 'object' && assertion ? (assertion as Record<string, unknown>) : {}),
      userId: canonicalUserId,  // Use the canonical user ID (customerId) for verification
      ...identifier,
    }),
  })
  if (!res.ok) throw new Error('Passkey verification failed')
  const result = await res.json()
  // Ensure comboRequired is explicitly set to false for successful passkey auth
  return { ...result, comboRequired: false }
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
    
    // Check if user already has a passkey registered
    try {
      const policyRes = await fetch('/api/auth/passkey/policy', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(id) 
      })
      const policy = await policyRes.json().catch(() => ({}))
      
      // If user has a passkey, attempt passkey authentication first
      if (policyRes.ok && policy?.hasPasskey) {
        // Before attempting, check if platform authenticator is available
        const isAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable
        if (typeof isAvailable === 'function') {
          const available = await isAvailable()
          if (available) {
            setStatus('Attempting passkey authentication…')
            const fetched = await fetchPasskeyRequestOptions(id)
            if (fetched) {
              const { options, userId: canonicalUserId } = fetched
              const { data, error } = await authenticate(options)
              
              if (!error && data) {
                try {
                  // Always send the canonical userId (customerId) back for verification lookup
                  const result = await verifyPasskey({ ...data, userId: canonicalUserId }, id, canonicalUserId)
                  if (!result.comboRequired) {
                    setStatus('Authenticated with passkey.')
                    // If we got a credential id back, trigger a background refresh of passkey list later
                    try { 
                      if (result?.credentialId && typeof window !== 'undefined') {
                        window.sessionStorage.setItem('lastPasskeyCredential', result.credentialId) 
                      }
                    } catch {}
                    // Ensure we have a Medusa customer and persist its id for account features
                    try {
                      const ensure = await fetch('/api/account/customer/ensure', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(id) 
                      })
                      const ej = await ensure.json().catch(() => ({}))
                      if (ej?.customerId && typeof window !== 'undefined') {
                        window.sessionStorage.setItem('customerId', String(ej.customerId))
                      }
                    } catch {}
                    // Bind session to the identifier, include customerId when available in sessionStorage
                    let customerId: string | undefined
                    try { 
                      if (typeof window !== 'undefined') {
                        customerId = sessionStorage.getItem('customerId') || undefined 
                      }
                    } catch {}
                    
                    console.log('[Login] Attempting signIn with:', { identifier: (id.email || id.phone) as string, customerId })
                    const signInResult = await signIn('session', { 
                      identifier: (id.email || id.phone) as string, 
                      customerId, 
                      hasPasskey: true, 
                      redirect: true, 
                      callbackUrl: '/account' 
                    })
                    console.log('[Login] signIn result:', signInResult)
                    return
                  }
                } catch (err) {
                  console.error('[Login] Passkey verification error:', err)
                  setStatus('Passkey verification failed. Falling back to MFA.')
                }
              } else {
                setStatus('Passkey authentication failed. Falling back to MFA.')
              }
            } else {
              setStatus('Could not retrieve passkey options. Falling back to MFA.')
            }
          } else {
            setStatus('Passkey not available on this device. Falling back to MFA.')
          }
        } else {
          setStatus('Platform authenticator not available. Falling back to MFA.')
        }
      } else {
        setStatus('No passkey registered for this account. Proceeding with MFA.')
      }
    } catch (err) {
      console.error('[Login] Policy check error:', err)
      setStatus('Error checking passkey status. Proceeding with MFA.')
    }

    // Fallback to combo-MFA
    setStatus('Requiring combo‑MFA for authentication.')
    setComboRequired(true)
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


