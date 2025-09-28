'use client';

import { useState, useCallback } from 'react';
import { ApiError } from '../utils/medusaApiClient';

export interface ErrorState {
  error: string | null;
  type: 'error' | 'warning' | 'info';
  isRetryable: boolean;
  originalError?: Error;
}

export interface UseErrorHandlerReturn {
  errorState: ErrorState;
  setError: (error: string | Error | null, type?: 'error' | 'warning' | 'info') => void;
  clearError: () => void;
  handleApiError: (error: unknown) => string;
  isNetworkError: (error: unknown) => boolean;
  isRetryableError: (error: unknown) => boolean;
  getErrorMessage: (error: unknown) => string;
}

export function useErrorHandler(): UseErrorHandlerReturn {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    type: 'error',
    isRetryable: false,
    originalError: undefined
  });

  const setError = useCallback((
    error: string | Error | null, 
    type: 'error' | 'warning' | 'info' = 'error'
  ) => {
    if (!error) {
      setErrorState({
        error: null,
        type: 'error',
        isRetryable: false,
        originalError: undefined
      });
      return;
    }

    const errorMessage = typeof error === 'string' ? error : error.message;
    const isRetryable = typeof error === 'object' ? isRetryableError(error) : false;

    setErrorState({
      error: errorMessage,
      type,
      isRetryable,
      originalError: typeof error === 'object' ? error : undefined
    });
  }, []);

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      type: 'error',
      isRetryable: false,
      originalError: undefined
    });
  }, []);

  const isNetworkError = useCallback((error: unknown): boolean => {
    if (error instanceof ApiError) {
      return error.type === 'network' || error.type === 'timeout';
    }
    
    if (error instanceof Error) {
      return (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('CORS') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError')
      );
    }
    
    return false;
  }, []);

  const isRetryableError = useCallback((error: unknown): boolean => {
    if (error instanceof ApiError) {
      // Network errors and server errors (5xx) are retryable
      return (
        error.type === 'network' || 
        error.type === 'timeout' ||
        (error.status !== undefined && error.status >= 500)
      );
    }
    
    if (error instanceof Error) {
      // Network-related errors are retryable
      return isNetworkError(error);
    }
    
    return false;
  }, [isNetworkError]);

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof ApiError) {
      // Handle specific API error types with user-friendly messages
      switch (error.type) {
        case 'network':
          return 'Unable to connect to the server. Please check your internet connection and try again.';
        case 'timeout':
          return 'The request took too long to complete. Please try again.';
        case 'api':
          if (error.status === 404) {
            return 'The requested item was not found. It may have been removed or is temporarily unavailable.';
          } else if (error.status === 400) {
            return error.message || 'Invalid request. Please check your input and try again.';
          } else if (error.status === 401) {
            return 'Authentication required. Please refresh the page and try again.';
          } else if (error.status === 403) {
            return 'Access denied. You do not have permission to perform this action.';
          } else if (error.status && error.status >= 500) {
            return 'Server error occurred. Please try again in a few moments.';
          }
          return error.message || 'An error occurred while processing your request.';
        default:
          return error.message || 'An unexpected error occurred.';
      }
    }
    
    if (error instanceof Error) {
      // Handle specific error patterns
      if (error.message.includes('insufficient stock') || error.message.includes('out of stock')) {
        return 'This item is currently out of stock or has insufficient quantity available.';
      } else if (error.message.includes('variant not found')) {
        return 'This product variant is no longer available.';
      } else if (error.message.includes('cart not found') || error.message.includes('expired')) {
        return 'Your cart session has expired. Please refresh the page and try again.';
      } else if (error.message.includes('quota') || error.message.includes('storage')) {
        return 'Browser storage is full. Please clear some space and try again.';
      } else if (isNetworkError(error)) {
        return 'Unable to connect to the server. Please check your internet connection and try again.';
      }
      
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    return 'An unexpected error occurred. Please try again.';
  }, [isNetworkError]);

  const handleApiError = useCallback((error: unknown): string => {
    const errorMessage = getErrorMessage(error);
    const type = isNetworkError(error) ? 'warning' : 'error';
    
    setError(errorMessage, type);
    
    // Log error for debugging
    
    return errorMessage;
  }, [getErrorMessage, isNetworkError, isRetryableError, setError]);

  return {
    errorState,
    setError,
    clearError,
    handleApiError,
    isNetworkError,
    isRetryableError,
    getErrorMessage
  };
}