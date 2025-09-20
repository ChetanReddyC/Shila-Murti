'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import styles from './ComboMfaModal.module.css'

interface ComboMfaModalProps {
  open: boolean
  identifier: { email?: string; phone?: string }
  onClose: () => void
  onComplete: () => void
}

export default function ComboMfaModal({ open, identifier, onClose, onComplete }: ComboMfaModalProps) {
  const [otp, setOtp] = useState('')
  const [otpStatus, setOtpStatus] = useState<string>('')
  const [magicStatus, setMagicStatus] = useState<string>('')
  const [magicOK, setMagicOK] = useState(false)
  const [otpOK, setOtpOK] = useState(false)
  const [otpSendDebug, setOtpSendDebug] = useState<string>('')
  const [otpVerifyDebug, setOtpVerifyDebug] = useState<string>('')
  const [magicSendDebug, setMagicSendDebug] = useState<string>('')
  const [emailInput, setEmailInput] = useState<string>(identifier.email || '')
  const [stateToken] = useState<string>(() => {
    // Correlate magic send/confirm/status to avoid false positives
    try { return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`) as string } catch { return `${Date.now()}-${Math.random()}` }
  })
  const startedRef = useRef(false)

  const startFlows = useCallback(async () => {
    try {
      // Kick off OTP send
      try { if (identifier.phone && typeof window !== 'undefined') sessionStorage.setItem('mfa_phone', identifier.phone) } catch {}
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identifier),
      })
      let body: any = {}
      try { body = await res.json() } catch {}
      const dbg = { at: new Date().toISOString(), request: { identifier }, response: { status: res.status, body } }
      setOtpSendDebug(JSON.stringify(dbg, null, 2))
      console.info('[ComboMFA] OTP send result', dbg)
      setOtpStatus('OTP sent via WhatsApp')
    } catch {
      setOtpStatus('Unable to send OTP')
    }

    if (identifier.email) {
      try {
        // Kick off magic link send if we already have an email
        let phoneForSend: string | undefined
        try { phoneForSend = typeof window !== 'undefined' ? sessionStorage.getItem('mfa_phone') || undefined : undefined } catch {}
        const res = await fetch('/api/auth/magic/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier.email, state: stateToken, phone: phoneForSend }),
        })
        let body: any = {}
          try { body = await res.json() } catch {}
        const dbg = { at: new Date().toISOString(), request: { email: identifier.email }, response: { status: res.status, body } }
        setMagicSendDebug(JSON.stringify(dbg, null, 2))
        console.info('[ComboMFA] Magic send result', dbg)
        setMagicStatus('Check your email for a login link')
      } catch {
        setMagicStatus('Unable to send magic link')
      }
    } else {
      setMagicStatus('Enter your email to receive a magic link')
    }
  }, [identifier])

  useEffect(() => {
    if (!open || startedRef.current) return
    startedRef.current = true
    startFlows()
  }, [open, startFlows])

  useEffect(() => {
    if (!open || magicOK) return
    let cancelled = false
    const id = setInterval(async () => {
      try {
        if (!emailInput) return
        const qs = `?email=${encodeURIComponent(emailInput)}&state=${encodeURIComponent(stateToken)}`
        const res = await fetch(`/api/auth/magic/status${qs}`)
        if (!res.ok) return
        const { verified } = await res.json()
        if (!cancelled && verified) {
          setMagicOK(true)
          setMagicStatus('Email link verified')
        }
      } catch {
        // ignore intermittent errors
      }
    }, 2500)
    return () => { cancelled = true; clearInterval(id) }
  }, [open, magicOK, emailInput])

  const verifyOtp = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setOtpStatus('Verifying OTP…')
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identifier, code: otp }),
      })
      let json: any = {}
      try { json = await res.json() } catch {}
      const dbg = { at: new Date().toISOString(), request: { ...identifier, code: otp }, response: { status: res.status, body: json } }
      setOtpVerifyDebug(JSON.stringify(dbg, null, 2))
      console.info('[ComboMFA] OTP verify result', dbg)
      if (!res.ok) throw new Error(json?.error || 'Invalid')
      setOtpOK(true)
      setOtpStatus('OTP verified')
    } catch {
      setOtpStatus('Invalid or expired OTP. Please resend and try again.')
    }
  }, [identifier, otp])

  useEffect(() => {
    if (open && magicOK && otpOK) {
      // Elevate session and redirect to home
      fetch('/api/auth/session/elevate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identifier),
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const identifierValue = json?.identifier || identifier.email || identifier.phone || 'user'
        // Persist customerId for passkey management & future passkey-first login
        try {
          if (json?.customerId && typeof window !== 'undefined') {
            window.sessionStorage.setItem('customerId', String(json.customerId))
          }
        } catch {}
        // Attempt to automatically register a passkey for this device after successful MFA
        try {
          const userId = (json?.customerId || identifierValue) as string
          const username = (identifier.email || identifier.phone || 'user') as string
          // Fetch register options
          const optRes = await fetch('/api/auth/passkey/register/options', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, username })
          })
          if (optRes.ok) {
            const { options } = await optRes.json()
            // Prepare publicKey options
            const b64ToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
            const publicKey: PublicKeyCredentialCreationOptions = {
              ...options,
              challenge: b64ToBytes(options.challenge),
              user: { ...options.user, id: new TextEncoder().encode(options.user.id) },
              excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({ ...c, id: b64ToBytes(c.id) })),
            }
            const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
            if (cred) {
              const att = cred.response as AuthenticatorAttestationResponse
              const arrayBufferToBase64Url = (buf: ArrayBuffer) => {
                const bytes = new Uint8Array(buf)
                let binary = ''
                for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i])
                return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
              }
              const payload = {
                id: cred.id,
                rawId: arrayBufferToBase64Url(cred.rawId),
                type: cred.type,
                response: {
                  clientDataJSON: arrayBufferToBase64Url(att.clientDataJSON),
                  attestationObject: arrayBufferToBase64Url(att.attestationObject),
                  transports: (cred as any).response.getTransports?.() || [],
                },
              }
              const verifyRes = await fetch('/api/auth/passkey/register/verify', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ userId, credential: payload }) 
              })
              
              // If passkey registration was successful, update session storage
              if (verifyRes.ok) {
                try {
                  if (typeof window !== 'undefined') {
                    sessionStorage.setItem('hasPasskey', 'true')
                    sessionStorage.setItem('passkeyUserId', userId)
                    sessionStorage.setItem('lastPasskeyCredential', cred.id)
                  }
                } catch (sessionError) {
                  console.warn('[ComboMfaModal] Failed to update session storage after passkey registration:', sessionError)
                }
              }
            }
          }
        } catch (passkeyError) {
          // If browser blocks automatic WebAuthn due to user activation policy, ignore; user can add from Security tab
          console.warn('[ComboMfaModal] Automatic passkey registration failed:', passkeyError)
        }
        // Bind a session using the identifier and include customerId for caching
        try {
          const customerIdForSession = json?.customerId ? String(json.customerId) : undefined
          await signIn('session', { identifier: identifierValue, customerId: customerIdForSession, hasPasskey: true, redirect: true, callbackUrl: '/' })
        } catch {
          // fallback no-op; user is redirected anyway
        }
      }).finally(() => {
        onComplete()
        try { if (typeof window !== 'undefined') window.sessionStorage.setItem('identifier', identifier.email || identifier.phone || '') } catch {}
        window.location.href = '/'
      })
    }
  }, [open, magicOK, otpOK, onComplete])

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="combo-mfa-title" className={styles.overlay}>
      <div className={styles.modal}>
        <h2 id="combo-mfa-title" className={styles.title}>Verify your login</h2>
        {/* WhatsApp-only OTP; no SMS fallback banner */}

        <section aria-labelledby="otp-section-title">
          <h3 id="otp-section-title" className={styles.sectionTitle}>Step A: Enter OTP</h3>
          <form onSubmit={verifyOtp} className={styles.row}>
            <input
              className={styles.input}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              aria-label="One-time code"
              required
            />
            <button className={styles.primaryBtn} type="submit" disabled={otp.length !== 6 || otpOK}>Verify</button>
          </form>
          <div aria-live="assertive" className={styles.status}>{otpStatus}</div>
          <div className={styles.debug}>
            {otpSendDebug && (
              <details>
                <summary>Debug: OTP send</summary>
                <pre>{otpSendDebug}</pre>
              </details>
            )}
            {otpVerifyDebug && (
              <details>
                <summary>Debug: OTP verify</summary>
                <pre>{otpVerifyDebug}</pre>
              </details>
            )}
          </div>
        </section>

        <section aria-labelledby="magic-section-title">
          <h3 id="magic-section-title" className={styles.sectionTitle}>Step B: Check your email</h3>
          <p aria-live="polite" className={styles.status}>{magicStatus}</p>
          {!identifier.email && (
            <form onSubmit={async (e) => {
              e.preventDefault()
              try {
                const res = await fetch('/api/auth/magic/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput, state: stateToken, phone: (typeof window !== 'undefined' ? sessionStorage.getItem('mfa_phone') || undefined : undefined) }),
                })
                let body: any = {}
                try { body = await res.json() } catch {}
                const dbg = { at: new Date().toISOString(), request: { email: emailInput }, response: { status: res.status, body } }
                setMagicSendDebug(JSON.stringify(dbg, null, 2))
                if (res.ok) setMagicStatus('Check your email for a login link')
                else setMagicStatus('Unable to send magic link')
              } catch {
                setMagicStatus('Unable to send magic link')
              }
            }}>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                required
                onChange={(e) => setEmailInput(e.target.value)}
                aria-label="Email for magic link"
              />
              <div style={{ marginTop: 8 }}>
                <button className={styles.primaryBtn} type="submit">Send magic link</button>
              </div>
            </form>
          )}
          <div className={styles.debug}>
            {magicSendDebug && (
              <details>
                <summary>Debug: Magic send</summary>
                <pre>{magicSendDebug}</pre>
              </details>
            )}
          </div>
        </section>

        <div className={styles.closeRow}>
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


