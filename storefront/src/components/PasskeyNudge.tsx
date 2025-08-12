'use client'

import React, { useEffect, useState } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import { useSession } from 'next-auth/react'

export default function PasskeyNudge() {
  const { data: session } = useSession()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Show nudge only if we have an identifier and we haven't dismissed it this visit
    if (!session?.user) return
    const dismissed = typeof window !== 'undefined' && sessionStorage.getItem('passkeyNudgeDismissed') === '1'
    if (!dismissed) setShow(true)
  }, [session])

  if (!show) return null

  const identifier = (session?.user as any)?.email || (session?.user as any)?.phone
  const userId = identifier || 'user'
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
        <SetupPasskeyButton userId={userId} username={username} />
        <button
          onClick={() => { sessionStorage.setItem('passkeyNudgeDismissed', '1'); setShow(false) }}
          style={{ height: 36, padding: '0 12px', border: '1px solid rgba(20,20,20,0.12)', borderRadius: 8, background: '#fff' }}
        >Dismiss</button>
      </div>
    </div>
  )
}


