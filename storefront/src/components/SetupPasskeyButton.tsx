'use client'

import React, { useState } from 'react'

async function registerPasskey(userId: string, username: string) {
  console.log('[PasskeyReg] Starting registration with userId:', userId, 'username:', username)
  const res = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username }),
  })
  if (!res.ok) throw new Error('options_failed')
  const { options } = await res.json()
  console.log('[PasskeyReg] Got options:', { userId: options.user.id, username: options.user.name })
  // Convert to proper types for WebAuthn
  const b64ToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: b64ToBytes(options.challenge),
    user: {
      ...options.user,
      // Use TextEncoder for user id (do not base64 decode arbitrary string)
      id: new TextEncoder().encode(options.user.id),
    },
    excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
      ...c,
      id: b64ToBytes(c.id),
    })),
  }

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential
  const att = cred.response as AuthenticatorAttestationResponse
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
  console.log('[PasskeyReg] Verifying with userId:', userId, 'username:', username, 'credentialId:', payload.id)
  const verify = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, username, credential: payload }),
  })
  if (!verify.ok) throw new Error('verify_failed')
  console.log('[PasskeyReg] Registration successful!')
  return true
}

function arrayBufferToBase64Url(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export default function SetupPasskeyButton({ userId, username, onRegistered }: { userId: string; username: string; onRegistered?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  return (
    <div style={{ textAlign: 'center' }}>
      <button 
        disabled={busy} 
        onClick={async () => {
          try {
            setBusy(true); setStatus('Setting up passkey…')
            await registerPasskey(userId, username)
            setStatus('Passkey registered on this device.')
            
            // Update session storage and policy cache to indicate passkey registration
            try {
              if (typeof window !== 'undefined') {
                // Set sessionStorage flags
                sessionStorage.setItem('hasPasskey', 'true')
                sessionStorage.setItem('passkeyUserId', userId)
                
                // Update localStorage policy cache to prevent nudge
                const identifierValue = username || userId
                const policyKey = `passkeyPolicy_${identifierValue}`
                const cacheData = {
                  hasPasskey: true,
                  expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
                }
                localStorage.setItem(policyKey, JSON.stringify(cacheData))
                
                // Mark as registered for this user
                const registeredKey = `passkeyRegistered_${identifierValue}`
                localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))
              }
            } catch (sessionError) {
              console.warn('[SetupPasskeyButton] Failed to update passkey storage flags:', sessionError)
            }
            
            try { onRegistered && onRegistered() } catch {}
          } catch (e: any) {
            setStatus(`Failed to register passkey${e?.message ? `: ${e.message}` : ''}`)
          } finally { setBusy(false) }
        }}
        style={{
          height: 44,
          padding: '0 24px',
          backgroundColor: '#141414',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.7 : 1,
          transition: 'all 0.2s ease',
          minWidth: 200,
        }}
        onMouseOver={(e) => {
          if (!busy) {
            e.currentTarget.style.backgroundColor = '#2a2a2a'
          }
        }}
        onMouseOut={(e) => {
          if (!busy) {
            e.currentTarget.style.backgroundColor = '#141414'
          }
        }}
      >
        {busy ? 'Setting up passkey…' : 'Set up passkey on this device'}
      </button>
      {status && (
        <div 
          aria-live="polite" 
          style={{ 
            fontSize: 12, 
            marginTop: 8, 
            color: status.includes('Failed') ? '#dc2626' : '#16a34a',
            fontWeight: 500
          }}
        >
          {status}
        </div>
      )}
    </div>
  )
}


