'use client'

import React, { useCallback, useEffect, useState } from 'react'
import SetupPasskeyButton from '@/components/SetupPasskeyButton'
import { getCustomerId } from '../../utils/hybridCustomerStorage'

export default function PasskeySection() {
  const [customerId, setCustomerId] = useState<string>('')
  const [userIdentifier, setUserIdentifier] = useState<string>('')
  const [creds, setCreds] = useState<Array<{ id: string; counter?: number; credentialDeviceType?: string }>>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  const refresh = useCallback(async () => {
    if (!customerId) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/account/passkeys`)
      const json = await res.json()
      if (res.ok) setCreds(Array.isArray(json.credentials) ? json.credentials : [])
      else if (checkSessionExpired(res, json)) {
        handleSessionExpiry(router, 'PASSKEY')
        return
      }
      else setError(json?.error || 'Unable to load credentials')
    } catch {
      setError('Unable to load credentials')
    } finally { setLoading(false) }
  }, [customerId, router])

  useEffect(() => {
    const loadCustomerId = async () => {
      try {
        const result = await getCustomerId()
        if (result.ok && result.customerId) {
          setCustomerId(result.customerId)
        }
      } catch (e) {
        console.error('[PasskeySection] Failed to get customer ID:', e)
      }
    }
    loadCustomerId()
    // Also try to infer from session identifier if present (best-effort)
    if (!stored) {
      try {
        const sid = window.sessionStorage.getItem('identifier')
        if (sid) setCustomerId(sid)
      } catch {}
    }
    
    // Get user identifier (phone/email) for passkey display name
    try {
      const identifier = window.sessionStorage.getItem('identifier') || ''
      if (identifier) setUserIdentifier(identifier)
    } catch {}
  }, [])

  useEffect(() => { 
    refresh()
    
    // Fetch customer profile to get phone/email for passkey username
    if (customerId) {
      ;(async () => {
        try {
          const res = await fetch(`/api/account/profile`)
          if (res.ok) {
            const data = await res.json()
            const customer = data?.customer || data || {}
            // Prefer phone, fallback to email
            const phone = customer.phone || customer.metadata?.phone
            const email = customer.email
            const identifier = phone || email
            if (identifier) setUserIdentifier(identifier)
          }
        } catch {}
      })()
    }
  }, [refresh, customerId])
  // Auto-prompt registration when entering /account if no credentials exist yet
  useEffect(() => {
    if (!customerId) return
    ;(async () => {
      try {
        const res = await fetch(`/api/account/passkeys`)
        const json = await res.json().catch(() => ({}))
        const count = Array.isArray(json?.credentials) ? json.credentials.length : 0
        if (count === 0) {
          // Programmatically click the setup button by invoking its logic
          const btn = document.querySelector('button:contains("Set up passkey on this device")') as HTMLButtonElement | null
          if (btn) btn.click()
        }
      } catch {}
    })()
  }, [customerId])
  // Also refresh when a passkey auth just happened (best-effort)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tid = setInterval(() => {
      try {
        const marker = window.sessionStorage.getItem('lastPasskeyCredential')
        if (marker) {
          window.sessionStorage.removeItem('lastPasskeyCredential')
          refresh()
        }
      } catch {}
    }, 2000)
    return () => clearInterval(tid)
  }, [refresh])

  // Re-check on window focus (covers the case where magic link completed in another tab)
  useEffect(() => {
    const onFocus = () => { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return (
    <div>
      <p style={{ fontSize: 13, color: '#565656', marginBottom: 8 }}>Manage your passkeys for passwordless sign in.</p>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Customer ID: {customerId || '—'}</div>
      <div style={{ marginBottom: 12 }}>
        <SetupPasskeyButton
          userId={customerId || 'user'}
          username={userIdentifier || customerId || 'user'}
          onRegistered={() => {
            // After successful registration, refresh the list to reflect the new credential
            refresh()
          }}
        />
      </div>
      {loading ? <div>Loading…</div> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {creds.length === 0 && <li style={{ color: '#888' }}>No registered passkeys on this account.</li>}
          {creds.map((c) => (
            <li key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Credential ID: {c.id.slice(0, 8)}…</div>
                {typeof c.counter === 'number' && <div style={{ fontSize: 12, color: '#666' }}>Sign count: {c.counter}</div>}
                {c.credentialDeviceType && <div style={{ fontSize: 12, color: '#666' }}>Device: {c.credentialDeviceType}</div>}
              </div>
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/account/passkeys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credentialId: c.id }) })
                    refresh()
                  } catch {}
                }}
                style={{ background: '#141414', color: '#fff', border: 0, borderRadius: 8, padding: '6px 10px' }}
              >Remove</button>
            </li>
          ))}
        </ul>
      )}
      {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
    </div>
  )
}


