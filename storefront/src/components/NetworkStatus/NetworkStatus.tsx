'use client';

import React, { useState, useEffect } from 'react';
import styles from './NetworkStatus.module.css';

export interface NetworkStatusProps {
  onNetworkChange?: (isOnline: boolean) => void;
  showOfflineMessage?: boolean;
  className?: string;
}

export default function NetworkStatus({
  onNetworkChange,
  showOfflineMessage = true,
  className = ''
}: NetworkStatusProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowMessage(true);
      onNetworkChange?.(true);
      
      // Hide the "back online" message after 3 seconds
      setTimeout(() => setShowMessage(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowMessage(true);
      onNetworkChange?.(false);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onNetworkChange]);

  if (!showMessage || (isOnline && !showOfflineMessage)) {
    return null;
  }

  return (
    <div className={`${styles.container} ${isOnline ? styles.online : styles.offline} ${className}`}>
      <div className={styles.content}>
        <div className={styles.iconContainer}>
          {isOnline ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0 0L12 12m-6.364 6.364L12 12m6.364-6.364L12 12" />
            </svg>
          )}
        </div>
        <div className={styles.messageContainer}>
          <span className={styles.message}>
            {isOnline 
              ? 'Connection restored! Your cart operations will now work normally.' 
              : 'No internet connection. Cart operations may not work until connection is restored.'
            }
          </span>
        </div>
        <button
          onClick={() => setShowMessage(false)}
          className={styles.dismissButton}
          type="button"
          aria-label="Dismiss network status message"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}