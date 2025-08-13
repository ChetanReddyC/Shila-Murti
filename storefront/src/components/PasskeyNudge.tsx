'use client'

import React, { useEffect, useState } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import { registerPasskey } from '@/lib/passkey/register'
import { useSession } from 'next-auth/react'

export default function PasskeyNudge() {
  const { data: session } = useSession()
  const [show, setShow] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Show nudge only if we have an identifier and no passkey exists for this user
    if (!session?.user) return
    const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('passkeyNudgeDismissed') === '1'
    if (dismissed) { setShow(false); return }
    ;(async () => {
      try {
        setChecking(true)
        let userId: string | null = null
        try { userId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null } catch {}
        const primary = (session?.user as any)?.phone || (session?.user as any)?.email
        const body: any = userId ? { userId } : (String(primary || '').includes('@') ? { email: primary } : { phone: primary })
        const res = await fetch('/api/auth/passkey/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const json = await res.json().catch(() => ({}))
        if (res.ok && json && json.hasPasskey === false) {
          setShow(true)
        } else {
          setShow(false)
        }
      } catch {
        // If policy check fails, keep nudge hidden to avoid annoyance
        setShow(false)
      } finally { setChecking(false) }
    })()
  }, [session])

  // React to magic verification from another tab (storage event)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      try {
        if (!e.key || !e.newValue) return
        if (!e.key.startsWith('magic_verified:')) return
        // Re-run policy check when magic verified signal is received
        setShow(false)
        ;(async () => {
          try {
            let userId: string | null = null
            try { userId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null } catch {}
            const primary = (session?.user as any)?.phone || (session?.user as any)?.email
            const body: any = userId ? { userId } : (String(primary || '').includes('@') ? { email: primary } : { phone: primary })
            const res = await fetch('/api/auth/passkey/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            const json = await res.json().catch(() => ({}))
            if (res.ok && json && json.hasPasskey === false) {
              setShow(true)
            }
          } catch {}
        })()
      } catch {}
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [session])

  // Proactive: on focus, if show=true and platform supports passkeys for this user, prompt once
  React.useEffect(() => {
    if (!show) return
    const handler = async () => {
      try {
        const pubKeySupported = typeof window !== 'undefined' && !!(window.PublicKeyCredential)
        if (!pubKeySupported) return
        const credProps = (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable
        if (typeof credProps === 'function') {
          const available = await credProps()
          if (!available) return
        }
        const identifier = (session?.user as any)?.phone || (session?.user as any)?.email
        // Heuristic: if identifier is email and platform supports passkeys, ask permission to use passkey
        // Only run once per visibility cycle
        if (identifier) {
          const consent = window.confirm('Set up a passkey on this device for faster sign-in next time?')
          if (consent) {
            const userId = (typeof window !== 'undefined' && sessionStorage.getItem('customerId')) || identifier
            const ok = await registerPasskey(userId!, identifier)
            if (ok) {
              sessionStorage.setItem('passkeyNudgeDismissed', '1')
              setShow(false)
            }
          }
        }
      } catch {}
    }
    handler()
  }, [show, session])

  if (!show) return null

  const identifier = (session?.user as any)?.phone || (session?.user as any)?.email
  const userId = (typeof window !== 'undefined' && sessionStorage.getItem('customerId')) || identifier || 'user'
  const username = identifier || 'user'

  return (
    <div style={{
      margin: '16px 0',
      padding: 16,
      border: '1px solid rgba(20,20,20,0.12)',
      borderRadius: 12,
      background: '#fff',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#141414' }}>Set up a passkey on this device</div>
        <div style={{ fontSize: 12, color: '#565656' }}>Skip OTP next time by registering a passkey with Windows Hello / Touch ID.</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SetupPasskeyButton userId={userId} username={username} onRegistered={() => { sessionStorage.setItem('passkeyNudgeDismissed', '1'); setShow(false) }} />
        <button
          onClick={() => { sessionStorage.setItem('passkeyNudgeDismissed', '1'); setShow(false) }}
          style={{ height: 36, padding: '0 12px', border: '1px solid rgba(20,20,20,0.12)', borderRadius: 8, background: '#fff' }}
        >Dismiss</button>
      </div>
    </div>
  )
}


