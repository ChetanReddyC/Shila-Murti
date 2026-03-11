'use client'

import React, { useEffect, useRef } from 'react'
import styles from './LogoutConfirmModal.module.css'

interface LogoutConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export default function LogoutConfirmModal({
  isOpen,
  onClose,
  onConfirm
}: LogoutConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management - focus the confirm button when modal opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus()
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

  // Handle confirm button click
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-description"
      className={styles.overlay}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 id="logout-confirm-title" className={styles.title}>
          Confirm Logout
        </h3>

        <p id="logout-confirm-description" className={styles.subtitle}>
          Are you sure you want to log out? You'll need to sign in again to access your account.
        </p>

        <div className={styles.actions}>
          <button
            ref={confirmButtonRef}
            className={styles.confirmBtn}
            onClick={handleConfirm}
          >
            Yes, Logout
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
