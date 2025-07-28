import React from 'react';
import styles from './LoadingSkeleton.module.css';

interface LoadingSkeletonProps {
  className?: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ className }) => {
  return (
    <div className={`${styles.skeleton} ${className || ''}`}>
      <div className={styles.shimmer}></div>
    </div>
  );
};

export default LoadingSkeleton;