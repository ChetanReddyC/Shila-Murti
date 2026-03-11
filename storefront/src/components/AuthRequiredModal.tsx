'use client'

import React, { useEffect, useRef } from 'react'
import styles from './AuthRequiredModal.module.css'

interface AuthRequiredModalProps {
  isOpen: boolean
  onClose: () => void
  onVerifyNow: () => void
  message?: string
}

export default function AuthRequiredModal({
  isOpen,
  onClose,
  onVerifyNow,
  message
}: AuthRequiredModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const verifyButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management
  useEffect(() => {
    if (isOpen && verifyButtonRef.current) {
      verifyButtonRef.current.focus()
    }
  }, [isOpen])

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Handle verify now button click
  const handleVerifyNow = () => {
    onVerifyNow()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-required-title"
      aria-describedby="auth-required-description"
      className={styles.overlay}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 id="auth-required-title" className={styles.title}>
          Verification Required
        </h3>

        <p id="auth-required-description" className={styles.description}>
          {message || 'Please verify your identity before placing an order. This keeps your account secure.'}
        </p>

        <div className={styles.verificationMethods}>
          <h3 className={styles.methodsTitle}>Verification methods:</h3>
          <ul className={styles.methodsList}>
            <li>
              <strong>Login:</strong> Sign in with your existing account
            </li>
            <li>
              <strong>WhatsApp OTP:</strong> Receive a code via WhatsApp
            </li>
            <li>
              <strong>Email Link:</strong> Get a secure link to your email
            </li>
          </ul>
        </div>

        <div className={styles.actions}>
          <button
            ref={verifyButtonRef}
            className={styles.verifyBtn}
            onClick={handleVerifyNow}
          >
            Verify Now
          </button>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
