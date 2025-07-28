import React, { forwardRef } from 'react';
import { useLazyImage, UseLazyImageOptions } from '../../hooks/useLazyImage';
import { ImageLoadState, ImageError } from '../../utils/imageOptimization';
import styles from './OptimizedImage.module.css';

export interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError'> {
  src: string;
  alt: string;
  fallbackSrc?: string;
  placeholder?: string;
  priority?: boolean;
  showRetryButton?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  onLoad?: (src: string) => void;
  onError?: (error: ImageError) => void;
  containerClassName?: string;
  loadingClassName?: string;
  errorClassName?: string;
  retryButtonClassName?: string;
}

const OptimizedImage = forwardRef<HTMLImageElement, OptimizedImageProps>(({
  src,
  alt,
  fallbackSrc,
  placeholder,
  priority = false,
  showRetryButton = true,
  retryAttempts = 3,
  retryDelay = 1000,
  onLoad,
  onError,
  className,
  containerClassName,
  loadingClassName,
  errorClassName,
  retryButtonClassName,
  ...imgProps
}, ref) => {
  const lazyImageOptions: UseLazyImageOptions = {
    src,
    fallbackSrc,
    placeholder,
    priority,
    onLoad,
    onError,
    retryAttempts,
    retryDelay
  };

  const { 
    src: currentSrc, 
    state, 
    error, 
    retry, 
    ref: containerRef 
  } = useLazyImage(lazyImageOptions);

  const renderLoadingState = () => (
    <div className={`${styles.loadingContainer} ${loadingClassName || ''}`}>
      <div className={styles.loadingSpinner} />
      <span className={styles.loadingText}>Loading image...</span>
    </div>
  );

  const renderErrorState = () => (
    <div className={`${styles.errorContainer} ${errorClassName || ''}`}>
      <div className={styles.errorIcon}>⚠️</div>
      <div className={styles.errorContent}>
        <p className={styles.errorMessage}>
          {error?.type === 'network' ? 'Network error loading image' :
           error?.type === '404' ? 'Image not found' :
           error?.type === 'timeout' ? 'Image loading timed out' :
           'Failed to load image'}
        </p>
        {showRetryButton && (
          <button 
            className={`${styles.retryButton} ${retryButtonClassName || ''}`}
            onClick={retry}
            type="button"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );

  const renderImage = () => (
    <img
      ref={ref}
      src={currentSrc}
      alt={alt}
      className={`${styles.image} ${className || ''} ${
        state === ImageLoadState.LOADED ? styles.imageLoaded : ''
      }`}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...imgProps}
    />
  );

  return (
    <div 
      ref={containerRef}
      className={`${styles.container} ${containerClassName || ''}`}
      data-image-state={state}
    >
      {state === ImageLoadState.LOADING && renderLoadingState()}
      {state === ImageLoadState.ERROR && renderErrorState()}
      {(state === ImageLoadState.LOADED || state === ImageLoadState.PLACEHOLDER) && renderImage()}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;