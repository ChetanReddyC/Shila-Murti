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
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management - focus the close button when modal opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus()
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

  // Handle backdrop click to close modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

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
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <div className={styles.closeRow}>
          <button
            ref={closeButtonRef}
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close authentication required dialog"
          >
            ×
          </button>
        </div>

        {/* Modal content */}
        <div className={styles.content}>
          {/* Icon */}
          <div className={styles.iconWrapper}>
            <svg 
              className={styles.icon} 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </div>

          <h2 id="auth-required-title" className={styles.title}>
            Authentication Required
          </h2>
          
          <p id="auth-required-description" className={styles.description}>
            {message || 'You must verify your identity before placing an order or making a payment. This helps us keep your account secure and prevent fraud.'}
          </p>

          <div className={styles.verificationMethods}>
            <h3 className={styles.methodsTitle}>Choose a verification method:</h3>
            <ul className={styles.methodsList}>
              <li>
                <strong>Login:</strong> If you already have an account, log in with your credentials
              </li>
              <li>
                <strong>WhatsApp OTP:</strong> Receive a verification code via WhatsApp
              </li>
              <li>
                <strong>Email Link:</strong> Get a secure verification link sent to your email
              </li>
            </ul>
          </div>

          <div className={styles.actions}>
            <button 
              className={styles.verifyBtn}
              onClick={handleVerifyNow}
            >
              Verify Identity Now
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
    </div>
  )
}
