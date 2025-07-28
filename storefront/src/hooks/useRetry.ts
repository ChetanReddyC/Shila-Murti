import { useState, useCallback } from 'react';

interface UseRetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
}

interface UseRetryReturn {
  retryCount: number;
  isRetrying: boolean;
  canRetry: boolean;
  retry: (fn: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

export const useRetry = (options: UseRetryOptions = {}): UseRetryReturn => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    backoffMultiplier = 2,
    maxDelay = 10000
  } = options;

  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const calculateDelay = useCallback((attempt: number): number => {
    const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
    return Math.min(delay, maxDelay);
  }, [initialDelay, backoffMultiplier, maxDelay]);

  const retry = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    if (retryCount >= maxRetries || isRetrying) {
      return;
    }

    setIsRetrying(true);

    try {
      // Apply exponential backoff delay
      const delay = calculateDelay(retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Execute the retry function
      await fn();

      // Reset retry count on success
      setRetryCount(0);
    } catch (error) {
      // Increment retry count on failure
      setRetryCount(prev => prev + 1);
      throw error;
    } finally {
      setIsRetrying(false);
    }
  }, [retryCount, maxRetries, isRetrying, calculateDelay]);

  const reset = useCallback(() => {
    setRetryCount(0);
    setIsRetrying(false);
  }, []);

  const canRetry = retryCount < maxRetries && !isRetrying;

  return {
    retryCount,
    isRetrying,
    canRetry,
    retry,
    reset
  };
};