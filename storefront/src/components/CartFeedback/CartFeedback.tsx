'use client';

import React from 'react';
import ErrorFeedback from '../ErrorFeedback/ErrorFeedback';
import SuccessFeedback from '../SuccessFeedback/SuccessFeedback';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';
import styles from './CartFeedback.module.css';

export interface CartFeedbackProps {
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  loadingMessage?: string;
  onRetry?: () => void;
  onDismissError?: () => void;
  onDismissSuccess?: () => void;
  showRetry?: boolean;
  className?: string;
}

export default function CartFeedback({
  loading = false,
  error = null,
  success = null,
  loadingMessage,
  onRetry,
  onDismissError,
  onDismissSuccess,
  showRetry = false,
  className = ''
}: CartFeedbackProps) {
  const hasAnyFeedback = loading || error || success;

  if (!hasAnyFeedback) {
    return null;
  }

  return (
    <div className={`${styles.container} ${className}`}>
      {loading && (
        <div className={styles.loadingContainer}>
          <LoadingSpinner 
            size="small" 
            color="primary" 
            message={loadingMessage}
          />
        </div>
      )}
      
      {error && !loading && (
        <ErrorFeedback
          error={error}
          onRetry={onRetry}
          onDismiss={onDismissError}
          showRetry={showRetry}
        />
      )}
      
      {success && !loading && !error && (
        <SuccessFeedback
          message={success}
          onDismiss={onDismissSuccess}
          autoHide={true}
          autoHideDelay={3000}
        />
      )}
    </div>
  );
}