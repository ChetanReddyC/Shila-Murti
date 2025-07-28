import { useState, useEffect, useRef, useCallback } from 'react';
import { ImageOptimizer, ImageLoadState, ImageError, ImageErrorType } from '../utils/imageOptimization';

export interface UseLazyImageOptions {
  src: string;
  fallbackSrc?: string;
  placeholder?: string;
  rootMargin?: string;
  threshold?: number;
  priority?: boolean;
  onLoad?: (src: string) => void;
  onError?: (error: ImageError) => void;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface UseLazyImageResult {
  src: string;
  state: ImageLoadState;
  error: ImageError | null;
  retry: () => void;
  ref: React.RefObject<HTMLElement>;
}

export const useLazyImage = (options: UseLazyImageOptions): UseLazyImageResult => {
  const {
    src,
    fallbackSrc,
    placeholder,
    rootMargin = '50px',
    threshold = 0.1,
    priority = false,
    onLoad,
    onError,
    retryAttempts = 3,
    retryDelay = 1000
  } = options;

  const [currentSrc, setCurrentSrc] = useState<string>(
    placeholder || ImageOptimizer.generatePlaceholder()
  );
  const [state, setState] = useState<ImageLoadState>(
    priority ? ImageLoadState.LOADING : ImageLoadState.PLACEHOLDER
  );
  const [error, setError] = useState<ImageError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const elementRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const createImageError = useCallback((type: ImageErrorType, message: string, src: string): ImageError => {
    return {
      type,
      message,
      src,
      timestamp: Date.now()
    };
  }, []);

  const loadImage = useCallback(async (imageSrc: string): Promise<void> => {
    setState(ImageLoadState.LOADING);
    setError(null);

    try {
      // Optimize the image URL
      const optimizedSrc = ImageOptimizer.optimizeImageUrl(imageSrc);
      
      // Preload the image
      await ImageOptimizer.preloadImage(optimizedSrc);
      
      // Image loaded successfully
      setCurrentSrc(optimizedSrc);
      setState(ImageLoadState.LOADED);
      onLoad?.(optimizedSrc);
      
    } catch (loadError) {
      console.warn(`Failed to load image: ${imageSrc}`, loadError);
      
      // Determine error type
      let errorType = ImageErrorType.UNKNOWN;
      if (loadError instanceof Error) {
        if (loadError.message.includes('404')) {
          errorType = ImageErrorType.NOT_FOUND;
        } else if (loadError.message.includes('403')) {
          errorType = ImageErrorType.FORBIDDEN;
        } else if (loadError.message.includes('500')) {
          errorType = ImageErrorType.SERVER_ERROR;
        } else if (loadError.message.includes('timeout')) {
          errorType = ImageErrorType.TIMEOUT;
        } else {
          errorType = ImageErrorType.NETWORK;
        }
      }

      const imageError = createImageError(
        errorType,
        loadError instanceof Error ? loadError.message : 'Unknown error',
        imageSrc
      );

      // Try fallback image if available and we haven't tried it yet
      if (fallbackSrc && imageSrc !== fallbackSrc && retryCount === 0) {
        console.log(`Trying fallback image: ${fallbackSrc}`);
        setRetryCount(1);
        await loadImage(fallbackSrc);
        return;
      }

      // Set error state
      setError(imageError);
      setState(ImageLoadState.ERROR);
      onError?.(imageError);

      // Use error placeholder
      setCurrentSrc(ImageOptimizer.generatePlaceholder(400, 300, '#FEE2E2'));
    }
  }, [fallbackSrc, onLoad, onError, retryCount, createImageError]);

  const retry = useCallback(() => {
    if (retryCount < retryAttempts) {
      setRetryCount(prev => prev + 1);
      
      // Clear any existing retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Retry with exponential backoff
      const delay = retryDelay * Math.pow(2, retryCount);
      retryTimeoutRef.current = setTimeout(() => {
        loadImage(src);
      }, delay);
    }
  }, [retryCount, retryAttempts, retryDelay, src, loadImage]);

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (priority) {
      // Load immediately if priority is set
      loadImage(src);
      return;
    }

    if (!elementRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && state === ImageLoadState.PLACEHOLDER) {
            loadImage(src);
            // Disconnect observer after loading starts
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
        threshold
      }
    );

    observer.observe(elementRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [src, state, priority, rootMargin, threshold, loadImage]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when src changes
  useEffect(() => {
    setRetryCount(0);
    setError(null);
    
    if (priority) {
      setState(ImageLoadState.LOADING);
      loadImage(src);
    } else {
      setState(ImageLoadState.PLACEHOLDER);
      setCurrentSrc(placeholder || ImageOptimizer.generatePlaceholder());
    }
  }, [src, priority, placeholder, loadImage]);

  return {
    src: currentSrc,
    state,
    error,
    retry,
    ref: elementRef
  };
};

export default useLazyImage;