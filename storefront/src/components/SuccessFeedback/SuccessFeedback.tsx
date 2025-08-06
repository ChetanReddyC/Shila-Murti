'use client';

import React from 'react';
import styles from './SuccessFeedback.module.css';

export interface SuccessFeedbackProps {
  message: string | null;
  onDismiss?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  className?: string;
}

export default function SuccessFeedback({
  message,
  onDismiss,
  autoHide = true,
  autoHideDelay = 3000,
  className = ''
}: SuccessFeedbackProps) {
  React.useEffect(() => {
    if (message && autoHide && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [message, autoHide, autoHideDelay, onDismiss]);

  if (!message) return null;

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.content}>
        <div className={styles.iconContainer}>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className={styles.messageContainer}>
          <span className={styles.message}>{message}</span>
        </div>
        {onDismiss && (
          <div className={styles.actions}>
            <button
              onClick={onDismiss}
              className={styles.dismissButton}
              type="button"
              aria-label="Dismiss success message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {autoHide && (
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{ animationDuration: `${autoHideDelay}ms` }}
          />
        </div>
      )}
    </div>
  );
}