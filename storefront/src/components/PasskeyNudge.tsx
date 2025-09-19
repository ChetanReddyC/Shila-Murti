'use client'

import React, { useEffect, useState, useRef } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import { useSession } from 'next-auth/react'

export default function PasskeyNudge() {
  const { data: session } = useSession()
  const [show, setShow] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Helper to get a stable identifier for the user
  const getUserIdentifier = () => {
    const primary = (session?.user as any)?.phone || (session?.user as any)?.email
    let userId: string | null = null
    try { userId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null } catch {}
    return userId || primary || null
  }

  // Helper to get the original (unmasked) identifier for passkey registration
  const getOriginalIdentifier = () => {
    const original = (session?.user as any)?.originalPhone || (session?.user as any)?.originalEmail
    let userId: string | null = null
    try { userId = typeof window !== 'undefined' ? sessionStorage.getItem('customerId') : null } catch {}
    return userId || original || null
  }

  // Helper to check if user already has passkey (ONLY reason to skip nudge)
  const shouldSkipNudge = (identifier: string) => {
    if (typeof window === 'undefined') return true
    
    // ONLY skip if user has already registered a passkey on this device
    // Check if we have a cached policy result indicating user has passkey
    const policyKey = `passkeyPolicy_${identifier}`
    const cachedPolicy = localStorage.getItem(policyKey)
    if (cachedPolicy) {
      try {
        const policy = JSON.parse(cachedPolicy)
        if (policy.hasPasskey === true && policy.expiresAt > Date.now()) {
          return true // User has passkey, don't show nudge
        }
      } catch {}
    }
    
    // NOTE: We do NOT check for dismissal here - dismissal is temporary only
    return false
  }

  useEffect(() => {
    // Show nudge only if we have an identifier and no passkey exists for this user
    if (!session?.user) return
    
    const identifier = getUserIdentifier()
    if (!identifier) return
    
    if (shouldSkipNudge(identifier)) {
      setShow(false)
      return
    }
    
    // Check for temporary dismissal (session-only)
    const tempDismissedKey = `passkeyNudgeDismissed_${identifier}`
    const tempDismissed = sessionStorage.getItem(tempDismissedKey) === '1'
    if (tempDismissed) {
      setShow(false)
      return
    }
    
    // Show prompt by default for new users instead of relying on API
    // The localStorage logic in shouldSkipNudge will handle users who have already registered
    setShow(true)
  }, [session])

  // React to passkey registration from another tab (storage event)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      try {
        if (!e.key || !e.newValue) return
        
        // Listen for passkey registration success from other tabs
        if (e.key.startsWith('passkeyRegistered_')) {
          const identifier = getUserIdentifier()
          if (identifier && e.key === `passkeyRegistered_${identifier}`) {
            console.log('[PasskeyNudge] Detected passkey registration in another tab, hiding nudge')
            setShow(false)
            
            // Update our cached policy to reflect the new passkey
            const policyKey = `passkeyPolicy_${identifier}`
            const cacheData = {
              hasPasskey: true,
              expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
            }
            localStorage.setItem(policyKey, JSON.stringify(cacheData))
          }
        }
        
        // NOTE: We don't listen for dismissal events since dismissal is session-only
        // Each tab should show the prompt independently until passkey is registered
      } catch (e) {
        console.warn('[PasskeyNudge] Error handling storage event:', e)
      }
    }
    
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [session])

  // Handle escape key to close modal
  useEffect(() => {
    if (!show) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const identifier = getUserIdentifier()
        if (identifier) dismissNudge(identifier)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [show])

  // Focus management for accessibility
  useEffect(() => {
    if (show && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      if (firstElement) {
        firstElement.focus()
      }
    }
  }, [show])

  // Helper to temporarily dismiss the nudge for this session only
  const dismissNudge = (identifier: string) => {
    // Use sessionStorage for temporary dismissal (will show again in new session/tab)
    const dismissedKey = `passkeyNudgeDismissed_${identifier}`
    sessionStorage.setItem(dismissedKey, '1')
    setShow(false)
    console.log('[PasskeyNudge] Temporarily dismissed for this session:', identifier)
  }

  // Helper to mark passkey as registered for this user
  const markPasskeyRegistered = (identifier: string) => {
    // Mark as registered for cross-tab communication
    const registeredKey = `passkeyRegistered_${identifier}`
    localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))
    
    // Update policy cache
    const policyKey = `passkeyPolicy_${identifier}`
    const cacheData = {
      hasPasskey: true,
      expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
    }
    localStorage.setItem(policyKey, JSON.stringify(cacheData))
    
    setShow(false)
    console.log('[PasskeyNudge] Marked passkey as registered for identifier:', identifier)
  }

  // Handle backdrop click to close modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      const identifier = getUserIdentifier()
      if (identifier) dismissNudge(identifier)
    }
  }

  if (!show) return null

  const identifier = getUserIdentifier()
  if (!identifier) return null

  const userId = (typeof window !== 'undefined' && sessionStorage.getItem('customerId')) || identifier || 'user'
  const username = getOriginalIdentifier() || identifier || 'user'

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="passkey-modal-title"
      aria-describedby="passkey-modal-description"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 32,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => dismissNudge(identifier)}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            fontSize: 24,
            color: '#666',
            cursor: 'pointer',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}
          aria-label="Close passkey setup prompt"
        >
          ×
        </button>

        {/* Modal content */}
        <div style={{ paddingRight: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ 
              fontSize: 48, 
              marginBottom: 16,
              filter: 'grayscale(0.2)',
            }}>
              🔐
            </div>
            <h2 
              id="passkey-modal-title"
              style={{ 
                fontSize: 24, 
                fontWeight: 700, 
                color: '#141414', 
                margin: 0, 
                marginBottom: 8 
              }}
            >
              Set up a passkey on this device
            </h2>
            <p 
              id="passkey-modal-description"
              style={{ 
                fontSize: 16, 
                color: '#565656', 
                margin: 0, 
                lineHeight: 1.5 
              }}
            >
              Skip OTP verification next time by registering a passkey with Windows Hello, Touch ID, or your device's built-in security.
            </p>
          </div>

          {/* Benefits section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ 
              fontSize: 16, 
              fontWeight: 600, 
              color: '#141414', 
              margin: 0, 
              marginBottom: 12 
            }}>
              Benefits of passkeys:
            </h3>
            <ul style={{ 
              margin: 0, 
              paddingLeft: 20, 
              color: '#565656', 
              fontSize: 14,
              lineHeight: 1.6
            }}>
              <li>No more waiting for OTP codes</li>
              <li>More secure than passwords</li>
              <li>Works with your device's biometrics</li>
              <li>Faster checkout experience</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <SetupPasskeyButton 
              userId={userId} 
              username={username} 
              onRegistered={() => markPasskeyRegistered(identifier)} 
            />
            <button
              onClick={() => dismissNudge(identifier)}
              style={{ 
                height: 44, 
                padding: '0 20px', 
                border: '1px solid rgba(20,20,20,0.12)', 
                borderRadius: 8, 
                background: '#fff',
                color: '#565656',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#fff'
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


