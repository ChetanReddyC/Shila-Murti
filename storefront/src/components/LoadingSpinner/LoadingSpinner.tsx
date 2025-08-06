'use client';

import React from 'react';
import styles from './LoadingSpinner.module.css';

export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'white' | 'gray';
  message?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = 'medium',
  color = 'primary',
  message,
  className = ''
}: LoadingSpinnerProps) {
  const getSizeClass = () => {
    switch (size) {
      case 'small':
        return styles.small;
      case 'large':
        return styles.large;
      default:
        return styles.medium;
    }
  };

  const getColorClass = () => {
    switch (color) {
      case 'white':
        return styles.white;
      case 'gray':
        return styles.gray;
      default:
        return styles.primary;
    }
  };

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={`${styles.spinner} ${getSizeClass()} ${getColorClass()}`}>
        <div className={styles.circle1}></div>
        <div className={styles.circle2}></div>
        <div className={styles.circle3}></div>
        <div className={styles.circle4}></div>
      </div>
      {message && (
        <span className={styles.message}>{message}</span>
      )}
    </div>
  );
}