import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  ref: React.RefObject<HTMLDivElement | null>;
}

// ============================================================================
// GLOBAL CACHES - Shared across all hook instances for efficiency
// ============================================================================

// Cache of permanently failed URLs to prevent repeated attempts
const failedUrlCache = new Map<string, { error: ImageError; timestamp: number }>();
const FAILED_URL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-flight requests deduplication cache
const pendingRequests = new Map<string, Promise<string>>();

// Successful load cache
const successCache = new Set<string>();

/**
 * Clears expired entries from the failed URL cache
 */
function cleanupFailedCache(): void {
  const now = Date.now();
  const entries = Array.from(failedUrlCache.entries());
  for (const entry of entries) {
    const [url, data] = entry;
    if (now - data.timestamp > FAILED_URL_CACHE_TTL) {
      failedUrlCache.delete(url);
    }
  }
}

// Run cleanup periodically
if (typeof window !== 'undefined') {
  setInterval(cleanupFailedCache, 60 * 1000); // Every minute
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

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
    retryAttempts = 2, // Reduced from 3 to limit requests
    retryDelay = 1000
  } = options;

  // ============================================================================
  // STATE - Only state that should trigger re-renders
  // ============================================================================

  const [currentSrc, setCurrentSrc] = useState<string>(
    placeholder || ImageOptimizer.generatePlaceholder()
  );
  const [state, setState] = useState<ImageLoadState>(
    priority ? ImageLoadState.LOADING : ImageLoadState.PLACEHOLDER
  );
  const [error, setError] = useState<ImageError | null>(null);

  // ============================================================================
  // REFS - Mutable values that should NOT trigger re-renders
  // ============================================================================

  const elementRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use refs for values that loadImage depends on but shouldn't cause recreation
  const retryCountRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const currentSrcRef = useRef(src);
  const mountedRef = useRef(true);

  // Store callbacks in refs to avoid dependency issues
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  }, [onLoad, onError]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // HELPERS
  // ============================================================================

  const createImageError = useCallback((
    type: ImageErrorType,
    message: string,
    imageSrc: string
  ): ImageError => ({
    type,
    message,
    src: imageSrc,
    timestamp: Date.now()
  }), []);

  // ============================================================================
  // CORE LOADING LOGIC - Memoized with STABLE dependencies
  // ============================================================================

  const loadImage = useCallback(async (imageSrc: string): Promise<void> => {
    // Guard: Already loading
    if (isLoadingRef.current) {
      return;
    }

    // Guard: Component unmounted
    if (!mountedRef.current) {
      return;
    }

    // Guard: Already successfully loaded this exact URL
    if (successCache.has(imageSrc)) {
      const optimizedSrc = ImageOptimizer.optimizeImageUrl(imageSrc);
      setCurrentSrc(optimizedSrc);
      setState(ImageLoadState.LOADED);
      return;
    }

    // Guard: Check if this URL has recently failed (circuit breaker)
    const cachedFailure = failedUrlCache.get(imageSrc);
    if (cachedFailure && Date.now() - cachedFailure.timestamp < FAILED_URL_CACHE_TTL) {
      // URL failed recently, use fallback or error state
      if (fallbackSrc && imageSrc !== fallbackSrc && !failedUrlCache.has(fallbackSrc)) {
        // Try fallback instead
        await loadImage(fallbackSrc);
        return;
      }

      // Set error state without making another request
      if (mountedRef.current) {
        setError(cachedFailure.error);
        setState(ImageLoadState.ERROR);
        setCurrentSrc(ImageOptimizer.generatePlaceholder(400, 300, '#FEE2E2'));
      }
      return;
    }

    // Mark as loading
    isLoadingRef.current = true;

    if (mountedRef.current) {
      setState(ImageLoadState.LOADING);
      setError(null);
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Check for pending request (deduplication)
      let loadPromise = pendingRequests.get(imageSrc);

      if (!loadPromise) {
        // Create new load promise
        loadPromise = (async () => {
          const optimizedSrc = ImageOptimizer.optimizeImageUrl(imageSrc);
          await ImageOptimizer.preloadImage(optimizedSrc);
          return optimizedSrc;
        })();

        pendingRequests.set(imageSrc, loadPromise);
      }

      const optimizedSrc = await loadPromise;

      // Remove from pending after successful load
      pendingRequests.delete(imageSrc);

      // Mark as successful
      successCache.add(imageSrc);

      // Update state if still mounted and src hasn't changed
      if (mountedRef.current && currentSrcRef.current === src) {
        setCurrentSrc(optimizedSrc);
        setState(ImageLoadState.LOADED);
        hasLoadedRef.current = true;
        onLoadRef.current?.(optimizedSrc);
      }

    } catch (loadError) {
      // Remove from pending on error
      pendingRequests.delete(imageSrc);

      // Component unmounted during load
      if (!mountedRef.current) {
        return;
      }

      // Determine error type
      let errorType = ImageErrorType.UNKNOWN;
      if (loadError instanceof Error) {
        const msg = loadError.message.toLowerCase();
        if (msg.includes('404') || msg.includes('not found')) {
          errorType = ImageErrorType.NOT_FOUND;
        } else if (msg.includes('403')) {
          errorType = ImageErrorType.FORBIDDEN;
        } else if (msg.includes('500')) {
          errorType = ImageErrorType.SERVER_ERROR;
        } else if (msg.includes('timeout') || msg.includes('abort')) {
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

      // Cache the failure to prevent repeated attempts
      failedUrlCache.set(imageSrc, { error: imageError, timestamp: Date.now() });

      // Try fallback image if available
      if (fallbackSrc && imageSrc !== fallbackSrc && !failedUrlCache.has(fallbackSrc)) {
        isLoadingRef.current = false;
        await loadImage(fallbackSrc);
        return;
      }

      // Check if we should retry
      if (retryCountRef.current < retryAttempts) {
        retryCountRef.current++;
        isLoadingRef.current = false;

        // Exponential backoff
        const delay = retryDelay * Math.pow(2, retryCountRef.current - 1);

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && currentSrcRef.current === src) {
            // Clear the failure cache entry before retrying
            failedUrlCache.delete(imageSrc);
            loadImage(imageSrc);
          }
        }, delay);

        return;
      }

      // All retries exhausted - set final error state
      if (mountedRef.current) {
        setError(imageError);
        setState(ImageLoadState.ERROR);
        setCurrentSrc(ImageOptimizer.generatePlaceholder(400, 300, '#FEE2E2'));
        onErrorRef.current?.(imageError);
      }

    } finally {
      isLoadingRef.current = false;
    }
  }, [src, fallbackSrc, retryAttempts, retryDelay, createImageError]);

  // ============================================================================
  // MANUAL RETRY - User-triggered retry
  // ============================================================================

  const retry = useCallback(() => {
    // Reset retry counter for manual retry
    retryCountRef.current = 0;
    hasLoadedRef.current = false;
    isLoadingRef.current = false;

    // Clear cached failure for this URL
    failedUrlCache.delete(src);
    if (fallbackSrc) {
      failedUrlCache.delete(fallbackSrc);
    }

    // Clear success cache in case image was updated
    successCache.delete(src);
    if (fallbackSrc) {
      successCache.delete(fallbackSrc);
    }

    // Trigger load
    loadImage(src);
  }, [src, fallbackSrc, loadImage]);

  // ============================================================================
  // INTERSECTION OBSERVER - Lazy loading trigger
  // ============================================================================

  useEffect(() => {
    // Skip if priority loading (will load immediately)
    if (priority) {
      return;
    }

    const element = elementRef.current;
    if (!element) {
      return;
    }

    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !hasLoadedRef.current && !isLoadingRef.current) {
          loadImage(src);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [src, priority, rootMargin, threshold, loadImage]);

  // ============================================================================
  // INITIAL LOAD - For priority images
  // ============================================================================

  useEffect(() => {
    if (priority && !hasLoadedRef.current && !isLoadingRef.current) {
      loadImage(src);
    }
  }, [priority, src, loadImage]);

  // ============================================================================
  // SOURCE CHANGE HANDLER - Reset state when src changes
  // ============================================================================

  useEffect(() => {
    // Track the current src
    const prevSrc = currentSrcRef.current;
    currentSrcRef.current = src;

    // Skip if src hasn't actually changed
    if (prevSrc === src) {
      return;
    }

    // Reset state for new source
    retryCountRef.current = 0;
    hasLoadedRef.current = false;
    isLoadingRef.current = false;

    // Cancel any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset UI state
    setError(null);

    if (priority) {
      setState(ImageLoadState.LOADING);
      loadImage(src);
    } else {
      setState(ImageLoadState.PLACEHOLDER);
      setCurrentSrc(placeholder || ImageOptimizer.generatePlaceholder());
    }
  }, [src, priority, placeholder, loadImage]);

  // ============================================================================
  // CLEANUP - On unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return useMemo(() => ({
    src: currentSrc,
    state,
    error,
    retry,
    ref: elementRef
  }), [currentSrc, state, error, retry]);
};

export default useLazyImage;