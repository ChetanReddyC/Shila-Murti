import { CartTotals, PriceCalculationContext } from './PriceCalculationService';
import { MedusaCart } from '../types/medusa';

export interface PriceError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  timestamp: Date;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  execute: (context: PriceCalculationContext, error: PriceError) => Promise<CartTotals | null>;
  canRecover: (error: PriceError) => boolean;
}

export interface ErrorHandlingOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  fallbackToBackend?: boolean;
  logErrors?: boolean;
  notifyUser?: boolean;
}

/**
 * Error handling service for price calculation failures and recovery strategies
 */
export class PriceErrorHandler {
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly ERROR_CODES = {
    CALCULATION_FAILED: 'CALCULATION_FAILED',
    SHIPPING_UNAVAILABLE: 'SHIPPING_UNAVAILABLE',
    CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
    INVALID_CART_STATE: 'INVALID_CART_STATE',
    API_TIMEOUT: 'API_TIMEOUT',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    DUPLICATE_CHARGES: 'DUPLICATE_CHARGES',
    NEGATIVE_TOTAL: 'NEGATIVE_TOTAL',
    BACKEND_MISMATCH: 'BACKEND_MISMATCH',
    NETWORK_ERROR: 'NETWORK_ERROR'
  } as const;

  private static recoveryStrategies: RecoveryStrategy[] = [];
  private static errorLog: PriceError[] = [];

  /**
   * Initialize error handler with recovery strategies
   */
  public static initialize(): void {
    this.recoveryStrategies = [
      this.createBackendFallbackStrategy(),
      this.createCacheRecoveryStrategy(),
      this.createDefaultValueStrategy(),
      this.createRetryStrategy()
    ];
  }

  /**
   * Handle price calculation error with recovery attempts
   */
  public static async handleError(
    error: Error | PriceError,
    context: PriceCalculationContext,
    options: ErrorHandlingOptions = {}
  ): Promise<{
    recovered: boolean;
    result?: CartTotals;
    finalError?: PriceError;
    recoveryUsed?: string;
  }> {
    const {
      enableRetry = true,
      maxRetries = this.DEFAULT_MAX_RETRIES,
      fallbackToBackend = true,
      logErrors = true
    } = options;

    // Convert Error to PriceError if needed
    const priceError = this.normalizeError(error, context);

    if (logErrors) {
      this.logError(priceError);
    }

    // Try recovery strategies
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(priceError)) {
        try {
          const result = await strategy.execute(context, priceError);
          if (result) {
            return {
              recovered: true,
              result,
              recoveryUsed: strategy.name
            };
          }
        } catch (recoveryError) {
          console.warn(`Recovery strategy ${strategy.name} failed:`, recoveryError);
        }
      }
    }

    // If all recovery attempts failed
    return {
      recovered: false,
      finalError: priceError
    };
  }

  /**
   * Create a price error from various error types
   */
  public static createError(
    code: string,
    message: string,
    severity: PriceError['severity'] = 'medium',
    context?: Record<string, any>
  ): PriceError {
    return {
      code,
      message,
      severity,
      context,
      timestamp: new Date(),
      recoverable: this.isRecoverableError(code),
      suggestedAction: this.getSuggestedAction(code)
    };
  }

  /**
   * Handle shipping calculation errors
   */
  public static handleShippingError(
    error: Error,
    cartId: string,
    selectedOptionId?: string
  ): PriceError {
    return this.createError(
      this.ERROR_CODES.SHIPPING_UNAVAILABLE,
      `Shipping calculation failed: ${error.message}`,
      'high',
      {
        cartId,
        selectedOptionId,
        originalError: error.message
      }
    );
  }

  /**
   * Handle validation errors
   */
  public static handleValidationError(
    validationErrors: string[],
    context: PriceCalculationContext
  ): PriceError {
    const message = `Price validation failed: ${validationErrors.join(', ')}`;
    
    return this.createError(
      this.ERROR_CODES.VALIDATION_FAILED,
      message,
      'medium',
      {
        validationErrors,
        cartId: context.cart.id,
        calculationMode: context.calculationMode
      }
    );
  }

  /**
   * Handle duplicate charge errors
   */
  public static handleDuplicateChargeError(
    duplicateTypes: string[],
    context: PriceCalculationContext
  ): PriceError {
    return this.createError(
      this.ERROR_CODES.DUPLICATE_CHARGES,
      `Duplicate charges detected: ${duplicateTypes.join(', ')}`,
      'high',
      {
        duplicateTypes,
        cartId: context.cart.id
      }
    );
  }

  /**
   * Handle currency mismatch errors
   */
  public static handleCurrencyMismatchError(
    expectedCurrency: string,
    actualCurrency: string,
    context: PriceCalculationContext
  ): PriceError {
    return this.createError(
      this.ERROR_CODES.CURRENCY_MISMATCH,
      `Currency mismatch: expected ${expectedCurrency}, got ${actualCurrency}`,
      'medium',
      {
        expectedCurrency,
        actualCurrency,
        cartId: context.cart.id
      }
    );
  }

  /**
   * Handle API timeout errors
   */
  public static handleApiTimeoutError(
    operation: string,
    timeout: number,
    context: PriceCalculationContext
  ): PriceError {
    return this.createError(
      this.ERROR_CODES.API_TIMEOUT,
      `API timeout during ${operation} (${timeout}ms)`,
      'high',
      {
        operation,
        timeout,
        cartId: context.cart.id
      }
    );
  }

  /**
   * Get error statistics
   */
  public static getErrorStatistics(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    recentErrors: PriceError[];
  } {
    const errorsByCode: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};

    this.errorLog.forEach(error => {
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    });

    // Get recent errors (last 10)
    const recentErrors = this.errorLog.slice(-10);

    return {
      totalErrors: this.errorLog.length,
      errorsByCode,
      errorsBySeverity,
      recentErrors
    };
  }

  /**
   * Clear error log
   */
  public static clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Check if error is recoverable
   */
  private static isRecoverableError(code: string): boolean {
    const recoverableCodes = [
      this.ERROR_CODES.API_TIMEOUT,
      this.ERROR_CODES.NETWORK_ERROR,
      this.ERROR_CODES.SHIPPING_UNAVAILABLE,
      this.ERROR_CODES.CURRENCY_MISMATCH
    ];

    return recoverableCodes.includes(code);
  }

  /**
   * Get suggested action for error code
   */
  private static getSuggestedAction(code: string): string {
    const actions: Record<string, string> = {
      [this.ERROR_CODES.CALCULATION_FAILED]: 'Retry calculation or use cached values',
      [this.ERROR_CODES.SHIPPING_UNAVAILABLE]: 'Use default shipping or prompt user to select different option',
      [this.ERROR_CODES.CURRENCY_MISMATCH]: 'Convert currency or use cart default currency',
      [this.ERROR_CODES.INVALID_CART_STATE]: 'Refresh cart data from backend',
      [this.ERROR_CODES.API_TIMEOUT]: 'Retry request or use cached data',
      [this.ERROR_CODES.VALIDATION_FAILED]: 'Review calculation logic and fix validation errors',
      [this.ERROR_CODES.DUPLICATE_CHARGES]: 'Remove duplicate charges and recalculate',
      [this.ERROR_CODES.NEGATIVE_TOTAL]: 'Check discount and tax calculations',
      [this.ERROR_CODES.BACKEND_MISMATCH]: 'Sync with backend or use backend values',
      [this.ERROR_CODES.NETWORK_ERROR]: 'Check network connection and retry'
    };

    return actions[code] || 'Contact support if error persists';
  }

  /**
   * Normalize error to PriceError format
   */
  private static normalizeError(error: Error | PriceError, context: PriceCalculationContext): PriceError {
    if ('code' in error && 'severity' in error) {
      return error as PriceError;
    }

    // Convert generic Error to PriceError
    const genericError = error as Error;
    let code = this.ERROR_CODES.CALCULATION_FAILED;
    let severity: PriceError['severity'] = 'medium';

    // Try to determine error type from message
    if (genericError.message.includes('timeout')) {
      code = this.ERROR_CODES.API_TIMEOUT;
      severity = 'high';
    } else if (genericError.message.includes('network')) {
      code = this.ERROR_CODES.NETWORK_ERROR;
      severity = 'high';
    } else if (genericError.message.includes('currency')) {
      code = this.ERROR_CODES.CURRENCY_MISMATCH;
      severity = 'medium';
    } else if (genericError.message.includes('shipping')) {
      code = this.ERROR_CODES.SHIPPING_UNAVAILABLE;
      severity = 'high';
    }

    return this.createError(
      code,
      genericError.message,
      severity,
      {
        originalError: genericError.name,
        stack: genericError.stack,
        cartId: context.cart.id
      }
    );
  }

  /**
   * Log error to internal log
   */
  private static logError(error: PriceError): void {
    this.errorLog.push(error);
    
    // Keep only last 100 errors to prevent memory issues
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }

    // Log to console based on severity
    const logMessage = `[PriceError] ${error.code}: ${error.message}`;
    
    switch (error.severity) {
      case 'critical':
        console.error(logMessage, error.context);
        break;
      case 'high':
        console.error(logMessage, error.context);
        break;
      case 'medium':
        console.warn(logMessage, error.context);
        break;
      case 'low':
        console.info(logMessage, error.context);
        break;
    }
  }

  /**
   * Create backend fallback recovery strategy
   */
  private static createBackendFallbackStrategy(): RecoveryStrategy {
    return {
      name: 'Backend Fallback',
      description: 'Use backend cart totals when calculation fails',
      canRecover: (error: PriceError) => {
        return [
          this.ERROR_CODES.CALCULATION_FAILED,
          this.ERROR_CODES.VALIDATION_FAILED,
          this.ERROR_CODES.DUPLICATE_CHARGES
        ].includes(error.code);
      },
      execute: async (context: PriceCalculationContext, error: PriceError) => {
        try {
          const cart = context.cart;
          
          // Use backend totals as fallback
          const fallbackTotals: CartTotals = {
            subtotal: cart.subtotal || 0,
            shipping: cart.shipping_total || 0,
            tax: cart.tax_total || 0,
            discount: cart.discount_total || 0,
            total: cart.total || 0,
            currency: cart.currency_code || 'INR',
            breakdown: [
              {
                type: 'item',
                description: 'Subtotal (from backend)',
                amount: cart.subtotal || 0
              },
              {
                type: 'shipping',
                description: 'Shipping (from backend)',
                amount: cart.shipping_total || 0
              },
              {
                type: 'tax',
                description: 'Tax (from backend)',
                amount: cart.tax_total || 0
              }
            ].filter(item => item.amount > 0),
            calculatedAt: new Date(),
            version: 'backend-fallback-1.0'
          };

          return fallbackTotals;
        } catch (fallbackError) {
          console.error('Backend fallback failed:', fallbackError);
          return null;
        }
      }
    };
  }

  /**
   * Create cache recovery strategy
   */
  private static createCacheRecoveryStrategy(): RecoveryStrategy {
    return {
      name: 'Cache Recovery',
      description: 'Use cached calculation results',
      canRecover: (error: PriceError) => {
        return [
          this.ERROR_CODES.API_TIMEOUT,
          this.ERROR_CODES.NETWORK_ERROR
        ].includes(error.code);
      },
      execute: async (context: PriceCalculationContext, error: PriceError) => {
        try {
          // In a real implementation, this would check localStorage or memory cache
          // For now, return null to indicate no cached data available
          return null;
        } catch (cacheError) {
          console.error('Cache recovery failed:', cacheError);
          return null;
        }
      }
    };
  }

  /**
   * Create default value recovery strategy
   */
  private static createDefaultValueStrategy(): RecoveryStrategy {
    return {
      name: 'Default Values',
      description: 'Use safe default values when calculation fails',
      canRecover: (error: PriceError) => {
        return error.severity === 'low' || error.severity === 'medium';
      },
      execute: async (context: PriceCalculationContext, error: PriceError) => {
        try {
          const cart = context.cart;
          
          // Create minimal safe totals
          const defaultTotals: CartTotals = {
            subtotal: cart.subtotal || 0,
            shipping: 0, // Default to no shipping
            tax: 0, // Default to no tax
            discount: 0, // Default to no discount
            total: cart.subtotal || 0,
            currency: cart.currency_code || 'INR',
            breakdown: [
              {
                type: 'item',
                description: 'Subtotal (default)',
                amount: cart.subtotal || 0
              }
            ],
            calculatedAt: new Date(),
            version: 'default-fallback-1.0'
          };

          return defaultTotals;
        } catch (defaultError) {
          console.error('Default value recovery failed:', defaultError);
          return null;
        }
      }
    };
  }

  /**
   * Create retry recovery strategy
   */
  private static createRetryStrategy(): RecoveryStrategy {
    return {
      name: 'Retry',
      description: 'Retry the failed operation',
      canRecover: (error: PriceError) => {
        return [
          this.ERROR_CODES.API_TIMEOUT,
          this.ERROR_CODES.NETWORK_ERROR
        ].includes(error.code) && error.recoverable;
      },
      execute: async (context: PriceCalculationContext, error: PriceError) => {
        try {
          // In a real implementation, this would retry the original calculation
          // For now, return null to indicate retry not implemented
          return null;
        } catch (retryError) {
          console.error('Retry recovery failed:', retryError);
          return null;
        }
      }
    };
  }

  /**
   * Add custom recovery strategy
   */
  public static addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
  }

  /**
   * Remove recovery strategy by name
   */
  public static removeRecoveryStrategy(name: string): boolean {
    const index = this.recoveryStrategies.findIndex(s => s.name === name);
    if (index >= 0) {
      this.recoveryStrategies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all recovery strategies
   */
  public static getRecoveryStrategies(): RecoveryStrategy[] {
    return [...this.recoveryStrategies];
  }
}

// Initialize error handler
PriceErrorHandler.initialize();