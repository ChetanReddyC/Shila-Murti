'use client'

import React, { useEffect, useRef } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import styles from './PasskeyPromptModal.module.css'

interface PasskeyPromptModalProps {
  isOpen: boolean
  onClose: () => void
  onRegistered: () => void
  userIdentifier: string
}

export default function PasskeyPromptModal({ 
  isOpen, 
  onClose, 
  onRegistered, 
  userIdentifier 
}: PasskeyPromptModalProps) {
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

  // Handle successful passkey registration
  const handlePasskeyRegistered = () => {
    onRegistered()
    onClose()
  }

  if (!isOpen) return null

  // Extract user ID and username for SetupPasskeyButton
  const userId = (typeof window !== 'undefined' && sessionStorage.getItem('customerId')) || userIdentifier || 'user'
  const username = userIdentifier || 'user'

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="passkey-prompt-title"
      aria-describedby="passkey-prompt-description"
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
            aria-label="Close passkey registration prompt"
          >
            ×
          </button>
        </div>

        {/* Modal content */}
        <div className={styles.content}>
          <h2 id="passkey-prompt-title" className={styles.title}>
            Secure your account with a passkey
          </h2>
          
          <p id="passkey-prompt-description" className={styles.description}>
            Skip OTP verification next time by setting up a passkey on this device. 
            Passkeys use Windows Hello, Touch ID, or your device's built-in security 
            to provide fast and secure authentication.
          </p>

          <div className={styles.benefits}>
            <h3 className={styles.benefitsTitle}>Benefits of passkeys:</h3>
            <ul className={styles.benefitsList}>
              <li>No more waiting for OTP codes</li>
              <li>More secure than passwords</li>
              <li>Works with your device's biometrics</li>
              <li>Faster checkout experience</li>
            </ul>
          </div>

          <div className={styles.actions}>
            <SetupPasskeyButton 
              userId={userId}
              username={username}
              onRegistered={handlePasskeyRegistered}
            />
            <button 
              className={styles.notNowBtn}
              onClick={onClose}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}