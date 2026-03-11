'use client'

import React, { useEffect, useRef } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import styles from './PasskeyPromptModal.module.css'
import { getCustomerIdentifierForPasskeys } from '../utils/hybridCustomerStorage'

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

  // Focus management
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

  // Handle successful passkey registration
  const handlePasskeyRegistered = () => {
    onRegistered()
    onClose()
  }

  if (!isOpen) return null

  // Extract user ID and username for SetupPasskeyButton
  const userId = getCustomerIdentifierForPasskeys() || userIdentifier || 'user'
  const username = userIdentifier || 'user'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-prompt-title"
      aria-describedby="passkey-prompt-description"
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
          ref={closeButtonRef}
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 id="passkey-prompt-title" className={styles.title}>
          Secure your account
        </h3>

        <p id="passkey-prompt-description" className={styles.description}>
          Set up a passkey to skip OTP verification next time using your device's biometrics.
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
  )
}
