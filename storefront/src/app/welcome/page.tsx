'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './welcome.module.css'

export default function WelcomePage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(5)
  const [email, setEmail] = useState('')
  const [autoCloseAttempted, setAutoCloseAttempted] = useState(false)

  useEffect(() => {
    // Extract email from URL params
    const params = new URLSearchParams(window.location.search)
    const emailParam = params.get('email')
    if (emailParam) {
      setEmail(emailParam)
    }

    // Set verification marker for the original tab
    try {
      const state = params.get('state') || ''
      const phone = params.get('phone') || ''
      if (emailParam) {
        const key = `magic_verified:${emailParam}${state ? `:${state}` : ''}`
        localStorage.setItem(key, String(Date.now()))
        if (phone) {
          sessionStorage.setItem('mfa_phone', phone)
        }
      }
    } catch { }

    // Countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          attemptAutoClose()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const attemptAutoClose = () => {
    if (autoCloseAttempted) return
    setAutoCloseAttempted(true)

    try {
      window.close()
      // If window.close() doesn't work, redirect to home after a delay
      setTimeout(() => {
        router.push('/')
      }, 2000)
    } catch {
      router.push('/')
    }
  }

  const handleManualClose = () => {
    attemptAutoClose()
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoDot} />
            <span className={styles.brandName}>Shila Murthi</span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.successIcon}>✅</div>
          <h1 className={styles.title}>Authentication Successful!</h1>

          {email && (
            <p className={styles.subtitle}>
              Your email <strong>{email}</strong> has been verified.
            </p>
          )}

          <div className={styles.instructions}>
            <p>Please return to your previous tab to continue.</p>
            <p className={styles.autoClose}>
              {countdown > 0 ? (
                <>This window will close automatically in <strong>{countdown}</strong> seconds.</>
              ) : (
                <>Attempting to close window...</>
              )}
            </p>
          </div>

          <button
            onClick={handleManualClose}
            className={styles.closeButton}
          >
            Close Window Manually
          </button>
        </div>

        <div className={styles.footer}>
          <p>You can safely close this window and return to shopping.</p>
        </div>
      </div>
    </div>
  )
}