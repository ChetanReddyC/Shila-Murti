'use client'

import React, { useState } from 'react'

async function registerPasskey(userId: string, username: string) {
  const res = await fetch('/api/auth/passkey/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username }),
  })
  if (!res.ok) throw new Error('options_failed')
  const { options } = await res.json()
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
  const verify = await fetch('/api/auth/passkey/register/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, credential: payload }),
  })
  if (!verify.ok) throw new Error('verify_failed')
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
    <div>
      <button disabled={busy} onClick={async () => {
        try {
          setBusy(true); setStatus('Setting up passkey…')
          await registerPasskey(userId, username)
          setStatus('Passkey registered on this device.')
          try { onRegistered && onRegistered() } catch {}
        } catch (e: any) {
          console.error('[Passkey Register] failed', e)
          setStatus(`Failed to register passkey${e?.message ? `: ${e.message}` : ''}`)
        } finally { setBusy(false) }
      }}>Set up passkey on this device</button>
      <div aria-live="polite" style={{ fontSize: 12, marginTop: 6 }}>{status}</div>
    </div>
  )
}


