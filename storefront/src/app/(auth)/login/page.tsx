'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { usePasskey, PublicKeyRequestOptionsJSON } from '@/hooks/usePasskey'
import { signIn } from 'next-auth/react'
import styles from './loginPage.module.css'
import { setCustomerId as setCustomerIdHybrid } from '../../../utils/hybridCustomerStorage'

// Load debug helper in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  import('../../../utils/passkeyDebugHelper').catch(() => {})
}

type Identifier = {
  email?: string
  phone?: string
}

type AuthMethod = 'phone' | 'email'

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

async function verifyPasskey(assertion: unknown, identifier: Identifier, canonicalUserId: string): Promise<{ comboRequired?: boolean; token?: string; credentialId?: string }> {
  const res = await fetch('/api/auth/passkey/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(typeof assertion === 'object' && assertion ? (assertion as Record<string, unknown>) : {}),
      userId: canonicalUserId,
      ...identifier,
    }),
  })
  if (!res.ok) throw new Error('Passkey verification failed')
  const result = await res.json()
  return { ...result, comboRequired: false }
}

export default function LoginPage() {
  const { authenticate, authenticateConditional, isConditionalMediationAvailable } = usePasskey()
  const [identifier, setIdentifier] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [conditionalUIActive, setConditionalUIActive] = useState<boolean>(false)
  
  // Authentication method selection
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone')
  const [showAuthMethods, setShowAuthMethods] = useState<boolean>(false)
  
  // Phone authentication state
  const [phone, setPhone] = useState<string>('')
  const [otpSending, setOtpSending] = useState<boolean>(false)
  const [otpSent, setOtpSent] = useState<boolean>(false)
  const [otpCode, setOtpCode] = useState<string>('')
  const [otpVerifying, setOtpVerifying] = useState<boolean>(false)
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const autoSubmitTimerRef = useRef<any>(null)
  
  // Email authentication state
  const [email, setEmail] = useState<string>('')
  const [magicSending, setMagicSending] = useState<boolean>(false)
  const [magicSent, setMagicSent] = useState<boolean>(false)
  const [magicVerified, setMagicVerified] = useState<boolean>(false)
  const magicPollTimerRef = useRef<any>(null)

  // Attempt passkey silently when identifier is prefilled via sessionStorage
  React.useEffect(() => {
    const stored = typeof window !== 'undefined' ? (sessionStorage.getItem('identifier') || '') : ''
    if (stored && !identifier) setIdentifier(stored)
  }, [identifier])

  // Conditional UI: Start listening for passkey autofill on page load
  useEffect(() => {
    let abortController: AbortController | null = null
    
    const startConditionalUI = async () => {
      try {
        // Check if conditional mediation is supported
        const isSupported = await isConditionalMediationAvailable()
        if (!isSupported) {
          console.log('[ConditionalUI] Not supported on this browser')
          return
        }

        console.log('[ConditionalUI] Starting conditional mediation...')
        setConditionalUIActive(true)
        
        // Create abort controller to cancel the request if needed
        abortController = new AbortController()
        
        // Get a generic challenge for conditional UI (doesn't need user identifier)
        const optionsRes = await fetch('/api/auth/passkey/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conditionalUI: true }),
          signal: abortController.signal,
        })
        
        if (!optionsRes.ok) {
          console.warn('[ConditionalUI] Failed to get options')
          return
        }
        
        const { options, userId: canonicalUserId } = await optionsRes.json()
        
        // Start conditional authentication (non-blocking, waits for user input)
        const { data, error: authError } = await authenticateConditional(options)
        
        if (authError) {
          // User cancelled or no passkey available - this is normal, not an error
          console.log('[ConditionalUI] Not used:', authError)
          return
        }
        
        if (data) {
          console.log('[ConditionalUI] Passkey selected from autofill!')
          setStatus('Authenticating with passkey...')
          
          // Verify the passkey
          const verifyRes = await fetch('/api/auth/passkey/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...data,
              userId: canonicalUserId,
              conditionalUI: true,
            }),
          })
          
          if (!verifyRes.ok) {
            setError('Passkey authentication failed')
            return
          }
          
          const result = await verifyRes.json()
          console.log('🔵 [ConditionalUI] Verify response:', result)
          
          // Extract identifier from result (email or phone)
          const userIdentifier = result.email || result.phone || canonicalUserId
          console.log('🔵 [ConditionalUI] Extracted userIdentifier:', userIdentifier, 'from result.email:', result.email, 'result.phone:', result.phone, 'fallback:', canonicalUserId)
          
          // Mark passkey authentication success
          try {
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('hasPasskey', 'true')
              if (result?.credentialId) {
                sessionStorage.setItem('lastPasskeyCredential', result.credentialId)
                sessionStorage.setItem('currentPasskeyCredential', result.credentialId)
              }
              const policyKey = `passkeyPolicy_${userIdentifier}`
              const cacheData = { hasPasskey: true, expiresAt: Date.now() + (60 * 60 * 1000) }
              localStorage.setItem(policyKey, JSON.stringify(cacheData))
              const registeredKey = `passkeyRegistered_${userIdentifier}`
              localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))
            }
          } catch (storageError) {
            console.warn('[ConditionalUI] Failed to update storage:', storageError)
          }
          
          // Ensure customer exists
          let ensuredCustomerId: string | undefined
          try {
            const id = userIdentifier.includes('@') ? { email: userIdentifier } : { phone: userIdentifier }
            console.log('🔵 [ConditionalUI] Ensuring customer for:', id)
            const ensure = await fetch('/api/account/customer/ensure', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(id) 
            })
            const ej = await ensure.json().catch(() => ({}))
            console.log('🔵 [ConditionalUI] Customer ensure response:', ej)
            if (ej?.customerId) {
              ensuredCustomerId = String(ej.customerId)
              try {
                await setCustomerIdHybrid(ensuredCustomerId)
                console.log('✅ [ConditionalUI] Customer ID set in hybrid storage:', ensuredCustomerId)
              } catch (e) {
                console.error('❌ [ConditionalUI] Failed to set customer ID:', e)
              }
            }
          } catch (err) {
            console.error('❌ [ConditionalUI] Customer ensure failed:', err)
          }
          
          // Sign in with the ensured customer ID
          // IMPORTANT: Use redirect: false to wait for session creation
          console.log('🔵 [ConditionalUI] About to sign in with:', { 
            identifier: userIdentifier, 
            customerId: ensuredCustomerId, 
            hasPasskey: true 
          })
          
          setStatus('Authenticated! Redirecting...')
          const conditionalSignInResult = await signIn('session', { 
            identifier: userIdentifier, 
            customerId: ensuredCustomerId, 
            hasPasskey: true, 
            redirect: false  // Don't redirect immediately - wait for session
          })
          
          console.log('✅ [ConditionalUI] signIn result:', conditionalSignInResult)
          
          if (conditionalSignInResult?.ok) {
            console.log('✅ [ConditionalUI] Session created, redirecting to /account...')
            // Small delay to ensure session cookie is set
            await new Promise(resolve => setTimeout(resolve, 300))
            window.location.href = '/account'
          } else {
            console.error('❌ [ConditionalUI] SignIn failed:', conditionalSignInResult?.error)
            setError('Failed to create session. Please try again.')
          }
        }
      } catch (err: any) {
        // AbortError is expected when user navigates away
        if (err?.name !== 'AbortError') {
          console.warn('[ConditionalUI] Error:', err)
        }
      }
    }
    
    // Only run conditional UI if we're not already showing auth methods
    if (!showAuthMethods) {
      startConditionalUI()
    }
    
    // Cleanup: abort the request if component unmounts or auth methods are shown
    return () => {
      if (abortController) {
        abortController.abort()
      }
      setConditionalUIActive(false)
    }
  }, [showAuthMethods, isConditionalMediationAvailable, authenticateConditional])

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('Checking sign-in options…')
    setError('')

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
        const isAvailable = (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable
        if (typeof isAvailable === 'function') {
          const available = await isAvailable()
          if (available) {
            setStatus('Attempting passkey authentication…')
            const fetched = await fetchPasskeyRequestOptions(id)
            if (fetched) {
              const { options, userId: canonicalUserId } = fetched
              const { data, error: authError } = await authenticate(options)
              
              if (!authError && data) {
                try {
                  const result = await verifyPasskey({ ...data, userId: canonicalUserId }, id, canonicalUserId)
                  if (!result.comboRequired) {
                    setStatus('Authenticated with passkey. Redirecting...')
                    
                    // Mark passkey authentication success
                    try {
                      if (typeof window !== 'undefined') {
                        const identifierValue = id.email || id.phone || ''
                        sessionStorage.setItem('hasPasskey', 'true')
                        if (result?.credentialId) {
                          sessionStorage.setItem('lastPasskeyCredential', result.credentialId)
                          sessionStorage.setItem('currentPasskeyCredential', result.credentialId)
                        }
                        const policyKey = `passkeyPolicy_${identifierValue}`
                        const cacheData = { hasPasskey: true, expiresAt: Date.now() + (60 * 60 * 1000) }
                        localStorage.setItem(policyKey, JSON.stringify(cacheData))
                        const registeredKey = `passkeyRegistered_${identifierValue}`
                        localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))
                      }
                    } catch (storageError) {
                      console.warn('[Login] Failed to update passkey storage flags:', storageError)
                    }
                    
                    // Ensure customer exists and get customerId
                    let ensuredCustomerId: string | undefined
                    try {
                      const ensure = await fetch('/api/account/customer/ensure', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(id) 
                      })
                      const ej = await ensure.json().catch(() => ({}))
                      if (ej?.customerId) {
                        ensuredCustomerId = String(ej.customerId)
                        try {
                          await setCustomerIdHybrid(ensuredCustomerId)
                        } catch (e) {
                          console.error('[Login] Failed to set customer ID:', e)
                        }
                      }
                    } catch (err) {
                      console.error('[Login] Failed to ensure customer:', err)
                    }
                    
                    // Sign in with the ensured customer ID
                    // IMPORTANT: Use redirect: false to wait for session creation
                    const passkeySignInResult = await signIn('session', { 
                      identifier: (id.email || id.phone) as string, 
                      customerId: ensuredCustomerId, 
                      hasPasskey: true, 
                      redirect: false  // Don't redirect immediately - wait for session
                    })
                    console.log('[Login] Passkey signIn result:', passkeySignInResult)
                    
                    if (passkeySignInResult?.ok) {
                      console.log('[Login] Session created, redirecting to /account...')
                      // Small delay to ensure session cookie is set
                      await new Promise(resolve => setTimeout(resolve, 300))
                      window.location.href = '/account'
                    } else {
                      console.error('[Login] Passkey signIn failed:', passkeySignInResult?.error)
                      setStatus('Session creation failed. Please try again.')
                    }
                    return
                  }
                } catch (err) {
                  setStatus('Passkey verification failed.')
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[Login] Error checking passkey:', err)
    }

    // Show authentication method selection
    setStatus('')
    setShowAuthMethods(true)
    
    // Pre-fill phone or email based on identifier
    if (identifier.includes('@')) {
      setEmail(identifier)
      setAuthMethod('email')
    } else {
      setPhone(identifier)
      setAuthMethod('phone')
    }
  }, [authenticate, identifier])

  // Handle OTP input change with auto-focus
  const handleOtpInputChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      // Create array with proper length
      const newOtpArray = Array(6).fill('')
      const currentCode = otpCode.padEnd(6, '')
      
      // Fill existing digits
      for (let i = 0; i < 6; i++) {
        newOtpArray[i] = currentCode[i] || ''
      }
      
      // Update current index
      newOtpArray[index] = value
      const completeCode = newOtpArray.join('')
      setOtpCode(completeCode)
      
      // Auto-focus next input
      if (value.length === 1 && index < 5) {
        otpInputRefs.current[index + 1]?.focus()
      }
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  // Send OTP
  const sendOtp = async () => {
    try {
      setError('')
      if (!phone.trim()) {
        setError('Please enter a valid phone number')
        return
      }
      setOtpSending(true)
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.error || 'Failed to send OTP')
      }
      setOtpSent(true)
      setShowOtpModal(true)
      setStatus('OTP sent via WhatsApp. Please check your phone.')
    } catch (e: any) {
      setError(e?.message || 'Failed to send OTP. Please try again.')
    } finally {
      setOtpSending(false)
    }
  }

  // Verify OTP
  const verifyOtp = useCallback(async () => {
    try {
      setError('')
      if (!otpCode || !/^\d{6}$/.test(otpCode)) {
        setError('Please enter a valid 6-digit OTP code')
        return
      }
      setOtpVerifying(true)
      
      // Verify OTP
      const vr = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otpCode })
      })
      const vj = await vr.json().catch(() => ({}))
      if (!vr.ok || vj?.ok !== true) {
        throw new Error('Invalid OTP code')
      }

      // Ensure customer exists
      const ensure = await fetch('/api/account/customer/ensure', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ phone }) 
      })
      const ej = await ensure.json().catch(() => ({}))
      if (!ensure.ok || !ej?.customerId) {
        throw new Error('Failed to create account')
      }

      // Store customer ID using hybrid storage
      try {
        await setCustomerIdHybrid(String(ej.customerId))
      } catch (e) {
        console.error('[Login] Failed to set customer ID:', e)
      }

      // CRITICAL: Clear passkey flags since this is OTP login (not passkey)
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('hasPasskey', 'false')
          sessionStorage.removeItem('lastPasskeyCredential')
          sessionStorage.removeItem('currentPasskeyCredential')
          
          // CRITICAL: Clear ALL passkey-related cache from localStorage
          // This is more aggressive but ensures the nudge shows regardless of identifier format
          try {
            const keysToRemove: string[] = []
            
            // Find all passkey-related keys
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key && (
                key.startsWith('passkeyPolicy_') || 
                key.startsWith('passkeyRegistered_') ||
                key.startsWith('passkeyNudgeDismissed_') ||
                key.startsWith('passkeyNudgeLastShown_')
              )) {
                keysToRemove.push(key)
              }
            }
            
            // Remove all found keys
            keysToRemove.forEach(key => {
              try {
                localStorage.removeItem(key)
              } catch (e) {
                console.warn('[Login] Failed to remove key:', key, e)
              }
            })
            
            console.log('[Login] Cleared ALL passkey cache for OTP login:', keysToRemove.length, 'keys removed')
          } catch (e) {
            console.warn('[Login] Failed to clear passkey cache:', e)
          }
        }
      } catch (clearError) {
        console.warn('[Login] Failed to clear passkey flags:', clearError)
      }

      setStatus('Phone verified successfully! Redirecting...')
      
      // CRITICAL: Logout first to clear any old JWT token with hasPasskey: true
      try {
        await fetch('/api/auth/signout', { method: 'POST' })
        console.log('[Login] Logged out to clear old session')
        // Small delay to ensure logout completes
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch (e) {
        console.warn('[Login] Logout failed, continuing:', e)
      }
      
      // Sign in without hasPasskey flag (this is OTP login)
      // IMPORTANT: Use redirect: false to wait for session creation
      console.log('[Login] Signing in with:', { phone, customerId: ej.customerId, hasPasskey: false })
      const signInResult = await signIn('session', { 
        identifier: phone, 
        customerId: ej.customerId,
        hasPasskey: false,
        redirect: false  // Don't redirect immediately - wait for session
      })
      console.log('[Login] SignIn result:', signInResult)
      
      if (signInResult?.ok) {
        console.log('[Login] Session created successfully, redirecting to /account...')
        // Small delay to ensure session cookie is set
        await new Promise(resolve => setTimeout(resolve, 300))
        // Manual redirect after session is confirmed
        window.location.href = '/account'
      } else {
        console.error('[Login] SignIn failed:', signInResult?.error)
        throw new Error(signInResult?.error || 'Failed to create session')
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to verify OTP. Please try again.')
    } finally {
      setOtpVerifying(false)
    }
  }, [otpCode, phone])

  // Send magic link
  const sendMagic = async () => {
    try {
      setError('')
      const em = email.trim().toLowerCase()
      if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        setError('Please enter a valid email address')
        return
      }
      setMagicSending(true)
      const state = `login-${Date.now()}`
      const mr = await fetch('/api/auth/magic/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, state })
      })
      const mj = await mr.json().catch(() => ({}))
      if (!mr.ok || mj?.ok !== true) {
        throw new Error(mj?.error || 'Failed to send magic link')
      }
      setMagicSent(true)
      setStatus('Magic link sent! Please check your email.')
      
      // Start polling for verification
      if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current)
      let attempts = 0
      magicPollTimerRef.current = setInterval(async () => {
        attempts += 1
        try {
          const url = `/api/auth/magic/status?email=${encodeURIComponent(em)}&state=${encodeURIComponent(state)}`
          const sr = await fetch(url)
          const sj = await sr.json().catch(() => ({}))
          if (sj?.verified) {
            clearInterval(magicPollTimerRef.current)
            magicPollTimerRef.current = null
            setMagicVerified(true)
            
            // Ensure customer exists
            const ensure = await fetch('/api/account/customer/ensure', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ email: em }) 
            })
            const ej = await ensure.json().catch(() => ({}))
            if (ensure.ok && ej?.customerId) {
              try {
                await setCustomerIdHybrid(String(ej.customerId))
              } catch (e) {
                console.error('[Login] Failed to set customer ID:', e)
              }
              
              // CRITICAL: Clear passkey flags since this is Magic Link login (not passkey)
              try {
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('hasPasskey', 'false')
                  sessionStorage.removeItem('lastPasskeyCredential')
                  sessionStorage.removeItem('currentPasskeyCredential')
                  
                  // CRITICAL: Clear ALL passkey-related cache from localStorage
                  // This is more aggressive but ensures the nudge shows regardless of identifier format
                  try {
                    const keysToRemove: string[] = []
                    
                    // Find all passkey-related keys
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i)
                      if (key && (
                        key.startsWith('passkeyPolicy_') || 
                        key.startsWith('passkeyRegistered_') ||
                        key.startsWith('passkeyNudgeDismissed_') ||
                        key.startsWith('passkeyNudgeLastShown_')
                      )) {
                        keysToRemove.push(key)
                      }
                    }
                    
                    // Remove all found keys
                    keysToRemove.forEach(key => {
                      try {
                        localStorage.removeItem(key)
                      } catch (e) {
                        console.warn('[Login] Failed to remove key:', key, e)
                      }
                    })
                    
                    console.log('[Login] Cleared ALL passkey cache for Magic Link login:', keysToRemove.length, 'keys removed')
                  } catch (e) {
                    console.warn('[Login] Failed to clear passkey cache:', e)
                  }
                  
                  console.log('[Login] Cleared passkey flags for Magic Link login')
                }
              } catch (clearError) {
                console.warn('[Login] Failed to clear passkey flags:', clearError)
              }
              
              setStatus('Email verified successfully! Redirecting...')
              
              // CRITICAL: Logout first to clear any old JWT token with hasPasskey: true
              try {
                await fetch('/api/auth/signout', { method: 'POST' })
                console.log('[Login] Logged out to clear old session')
                // Small delay to ensure logout completes
                await new Promise(resolve => setTimeout(resolve, 300))
              } catch (e) {
                console.warn('[Login] Logout failed, continuing:', e)
              }
              
              // Sign in without hasPasskey flag (this is Magic Link login)
              // IMPORTANT: Use redirect: false to wait for session creation
              console.log('[Login] Signing in with:', { email: em, customerId: ej.customerId, hasPasskey: false })
              const signInResult = await signIn('session', { 
                identifier: em, 
                customerId: ej.customerId,
                hasPasskey: false,
                redirect: false  // Don't redirect immediately - wait for session
              })
              console.log('[Login] SignIn result:', signInResult)
              
              if (signInResult?.ok) {
                console.log('[Login] Session created successfully, redirecting to /account...')
                // Small delay to ensure session cookie is set
                await new Promise(resolve => setTimeout(resolve, 300))
                // Manual redirect after session is confirmed
                window.location.href = '/account'
              } else {
                console.error('[Login] SignIn failed:', signInResult?.error)
                // Don't throw error here, just show status
                setStatus('Failed to create session. Please try again.')
              }
            }
          }
        } catch {}
        
        // Stop after 5 minutes
        if (attempts >= 150) {
          clearInterval(magicPollTimerRef.current)
          magicPollTimerRef.current = null
        }
      }, 2000)
    } catch (e: any) {
      setError(e?.message || 'Failed to send magic link. Please try again.')
    } finally {
      setMagicSending(false)
    }
  }

  // Auto-submit when OTP is complete
  useEffect(() => {
    if (otpCode.length === 6 && /^\d{6}$/.test(otpCode) && !otpVerifying) {
      // Clear any existing timer
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current)
      }
      
      // Small delay to show the last digit before submitting
      autoSubmitTimerRef.current = setTimeout(() => {
        verifyOtp()
      }, 300)
    }
    
    // Cleanup
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode, otpVerifying])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (magicPollTimerRef.current) clearInterval(magicPollTimerRef.current)
    }
  }, [])

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        <h2 className={styles.title}>Login</h2>
        
        {!showAuthMethods ? (
          <div className={styles.loginForm}>
            <form onSubmit={onSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="identifier" className={styles.fieldLabel}>
                  Email Address or Mobile Number
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  className={styles.input}
                  type="text"
                  placeholder="Enter your email or mobile"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username webauthn"
                />
              </div>
              <div className={styles.formGroup}>
                <button
                  className={styles.primaryBtn}
                  type="submit"
                  disabled={!identifier.trim()}
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className={styles.methodSection}>
            <div className={styles.methodTitle}>Select Authentication Method</div>
            
            <div className={styles.methodOptions}>
              <label className={styles.methodOption}>
                <input
                  type="radio"
                  name="authMethod"
                  value="phone"
                  checked={authMethod === 'phone'}
                  onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
                />
                <div className={styles.methodLabel}>
                  <div>WhatsApp OTP</div>
                  <div className={styles.methodDescription}>Get a code via WhatsApp</div>
                </div>
              </label>
              
              <label className={styles.methodOption}>
                <input
                  type="radio"
                  name="authMethod"
                  value="email"
                  checked={authMethod === 'email'}
                  onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
                />
                <div className={styles.methodLabel}>
                  <div>Email Magic Link</div>
                  <div className={styles.methodDescription}>Get a sign-in link via email</div>
                </div>
              </label>
            </div>

            {authMethod === 'phone' && (
              <div className={styles.authForm}>
                <div className={styles.formGroup}>
                  <label className={styles.fieldLabel} htmlFor="phone">
                    Phone Number (WhatsApp)
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    className={styles.input}
                    type="text"
                    placeholder="+1 555 555 5555"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <button 
                    className={styles.primaryBtn}
                    onClick={sendOtp} 
                    disabled={otpSending || !phone.trim()}
                  >
                    {otpSending ? 'Sending...' : (otpSent ? 'Resend OTP' : 'Send OTP')}
                  </button>
                </div>
              </div>
            )}

            {authMethod === 'email' && (
              <div className={styles.authForm}>
                <div className={styles.formGroup}>
                  <label className={styles.fieldLabel} htmlFor="email">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    className={styles.input}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <button 
                    className={styles.primaryBtn}
                    onClick={sendMagic} 
                    disabled={magicSending || !email.trim()}
                  >
                    {magicSending ? 'Sending...' : (magicSent ? 'Resend Link' : 'Send Magic Link')}
                  </button>
                </div>

                {magicSent && !magicVerified && (
                  <div className={`${styles.infoMessage} ${styles.info}`}>
                    ✉️ Check your email for the magic link. Click it to sign in automatically.
                  </div>
                )}

                {magicVerified && (
                  <div className={`${styles.infoMessage} ${styles.success}`}>
                    ✅ Email verified! Signing you in...
                  </div>
                )}
              </div>
            )}

            <div className={styles.formGroup}>
              <button 
                className={styles.secondaryBtn}
                onClick={() => {
                  setShowAuthMethods(false)
                  setOtpSent(false)
                  setMagicSent(false)
                  setMagicVerified(false)
                  setOtpCode('')
                  setShowOtpModal(false)
                  setError('')
                  setStatus('')
                }}
              >
                ← Back
              </button>
            </div>
          </div>
        )}

        {status && (
          <p className={`${styles.infoMessage} ${styles.info}`} aria-live="polite">
            {status}
          </p>
        )}

        {error && (
          <p className={`${styles.infoMessage} ${styles.error}`} aria-live="assertive">
            {error}
          </p>
        )}

        <p className={styles.signupText}>
          <span className={styles.signupLink}>Don&apos;t have an account? Sign up</span>
        </p>
      </div>

      {/* OTP Modal */}
      {showOtpModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Verify with WhatsApp OTP</h2>
              <p className={styles.modalDescription}>A 6-digit code has been sent to your WhatsApp number.</p>
            </div>
            <div className={styles.otpInputContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  ref={(el) => { otpInputRefs.current[index] = el }}
                  className={styles.otpInput}
                  maxLength={1}
                  type="text"
                  inputMode="numeric"
                  value={otpCode[index] || ''}
                  onChange={(e) => handleOtpInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                />
              ))}
            </div>
            <button
              className={styles.verifyBtn}
              onClick={verifyOtp}
              disabled={otpVerifying || otpCode.length !== 6}
            >
              {otpVerifying ? 'Verifying...' : 'Verify'}
            </button>
            <div className={styles.modalActions}>
              <button 
                className={styles.modalLink}
                onClick={sendOtp}
                disabled={otpSending}
              >
                {otpSending ? 'Sending...' : 'Resend OTP'}
              </button>
              <button 
                className={styles.modalLink}
                onClick={() => {
                  setShowOtpModal(false)
                  setOtpCode('')
                }}
              >
                Change Number
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
