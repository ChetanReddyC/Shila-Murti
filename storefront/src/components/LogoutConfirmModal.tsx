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

  // Handle backdrop click to close modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

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
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close logout confirmation dialog"
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

          <h2 id="logout-confirm-title" className={styles.title}>
            Confirm Logout
          </h2>
          
          <p id="logout-confirm-description" className={styles.description}>
            Are you sure you want to log out? You'll need to sign in again to access your account and view your orders.
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
    </div>
  )
}
