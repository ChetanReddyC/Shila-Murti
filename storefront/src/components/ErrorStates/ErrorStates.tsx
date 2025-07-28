import React from 'react';
import { ProductsServiceError } from '../../services/productsService';
import styles from './ErrorStates.module.css';

interface BaseErrorStateProps {
  onRetry?: () => void;
  retryCount?: number;
  maxRetries?: number;
}

interface ErrorStateProps extends BaseErrorStateProps {
  error: ProductsServiceError;
}

// Network Error Component
export const NetworkErrorState: React.FC<BaseErrorStateProps> = ({ 
  onRetry, 
  retryCount = 0, 
  maxRetries = 3 
}) => (
  <div className={styles.errorContainer}>
    <div className={styles.errorIcon}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="m2 2 20 20" />
        <path d="M8.5 2h7" />
        <path d="M9 9v3a3 3 0 0 0 6 0v-3" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    </div>
    <h3 className={styles.errorTitle}>Connection Problem</h3>
    <p className={styles.errorMessage}>
      We're having trouble connecting to our servers. Please check your internet connection and try again.
    </p>
    <div className={styles.errorActions}>
      {onRetry && retryCount < maxRetries && (
        <button onClick={onRetry} className={styles.primaryButton}>
          Try Again ({maxRetries - retryCount} attempts left)
        </button>
      )}
      <button 
        onClick={() => window.location.reload()} 
        className={styles.secondaryButton}
      >
        Reload Page
      </button>
    </div>
  </div>
);

// API Error Component
export const ApiErrorState: React.FC<BaseErrorStateProps & { statusCode?: number }> = ({ 
  onRetry, 
  retryCount = 0, 
  maxRetries = 3,
  statusCode 
}) => (
  <div className={styles.errorContainer}>
    <div className={styles.errorIcon}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
    <h3 className={styles.errorTitle}>Server Error</h3>
    <p className={styles.errorMessage}>
      {statusCode === 404 
        ? "The requested products could not be found."
        : statusCode === 500
        ? "Our servers are experiencing issues. Please try again in a few moments."
        : "We encountered a problem while fetching products from our servers."
      }
    </p>
    <div className={styles.errorActions}>
      {onRetry && retryCount < maxRetries && (
        <button onClick={onRetry} className={styles.primaryButton}>
          Try Again ({maxRetries - retryCount} attempts left)
        </button>
      )}
      <button 
        onClick={() => window.location.reload()} 
        className={styles.secondaryButton}
      >
        Reload Page
      </button>
    </div>
  </div>
);

// Data Error Component
export const DataErrorState: React.FC<BaseErrorStateProps> = ({ 
  onRetry, 
  retryCount = 0, 
  maxRetries = 3 
}) => (
  <div className={styles.errorContainer}>
    <div className={styles.errorIcon}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10,9 9,9 8,9" />
      </svg>
    </div>
    <h3 className={styles.errorTitle}>Data Processing Error</h3>
    <p className={styles.errorMessage}>
      We received data from the server, but encountered an issue while processing it. This might be a temporary problem.
    </p>
    <div className={styles.errorActions}>
      {onRetry && retryCount < maxRetries && (
        <button onClick={onRetry} className={styles.primaryButton}>
          Try Again ({maxRetries - retryCount} attempts left)
        </button>
      )}
      <button 
        onClick={() => window.location.reload()} 
        className={styles.secondaryButton}
      >
        Reload Page
      </button>
    </div>
  </div>
);

// Timeout Error Component
export const TimeoutErrorState: React.FC<BaseErrorStateProps> = ({ 
  onRetry, 
  retryCount = 0, 
  maxRetries = 3 
}) => (
  <div className={styles.errorContainer}>
    <div className={styles.errorIcon}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    </div>
    <h3 className={styles.errorTitle}>Request Timeout</h3>
    <p className={styles.errorMessage}>
      The request is taking longer than expected. This might be due to slow network conditions or server load.
    </p>
    <div className={styles.errorActions}>
      {onRetry && retryCount < maxRetries && (
        <button onClick={onRetry} className={styles.primaryButton}>
          Try Again ({maxRetries - retryCount} attempts left)
        </button>
      )}
      <button 
        onClick={() => window.location.reload()} 
        className={styles.secondaryButton}
      >
        Reload Page
      </button>
    </div>
  </div>
);

// Empty State Component
export const EmptyState: React.FC<BaseErrorStateProps> = ({ onRetry }) => (
  <div className={styles.errorContainer}>
    <div className={styles.emptyIcon}>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    </div>
    <h3 className={styles.emptyTitle}>No Products Found</h3>
    <p className={styles.emptyMessage}>
      We couldn't find any products to display at the moment. This might be temporary.
    </p>
    <div className={styles.errorActions}>
      {onRetry && (
        <button onClick={onRetry} className={styles.primaryButton}>
          Refresh
        </button>
      )}
    </div>
  </div>
);

// Main Error State Component that chooses the appropriate error type
export const ErrorState: React.FC<ErrorStateProps> = ({ 
  error, 
  onRetry, 
  retryCount = 0, 
  maxRetries = 3 
}) => {
  const commonProps = { onRetry, retryCount, maxRetries };

  switch (error.type) {
    case 'network':
      return <NetworkErrorState {...commonProps} />;
    case 'api':
      return <ApiErrorState {...commonProps} />;
    case 'data':
      return <DataErrorState {...commonProps} />;
    case 'timeout':
      return <TimeoutErrorState {...commonProps} />;
    default:
      return (
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className={styles.errorTitle}>Something went wrong</h3>
          <p className={styles.errorMessage}>
            {error.message || 'An unexpected error occurred while loading products.'}
          </p>
          <div className={styles.errorActions}>
            {onRetry && retryCount < maxRetries && (
              <button onClick={onRetry} className={styles.primaryButton}>
                Try Again ({maxRetries - retryCount} attempts left)
              </button>
            )}
            <button 
              onClick={() => window.location.reload()} 
              className={styles.secondaryButton}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
  }
};

export default ErrorState;