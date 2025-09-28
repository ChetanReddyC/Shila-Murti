/**
 * PasskeyNudge Error Handler Utilities
 * 
 * Provides comprehensive error handling, recovery mechanisms, and fallback behaviors
 * for the PasskeyNudge component and related utilities.
 */

import { emergencyCleanup, validateAndCleanupStorage } from './authEventStorage'
import { performErrorRecovery } from './sessionStateTracking'

export interface ErrorHandlerConfig {
  enableLogging: boolean
  enableRecovery: boolean
  maxRetryAttempts: number
  retryDelay: number
  emergencyCleanupThreshold: number
}

export interface ErrorContext {
  component: string
  operation: string
  timestamp: number
  sessionId?: string
  userId?: string
}

export interface ErrorReport {
  error: Error
  context: ErrorContext
  recoveryAttempted: boolean
  recoverySuccessful: boolean
  fallbackUsed: boolean
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  enableLogging: true,
  enableRecovery: true,
  maxRetryAttempts: 3,
  retryDelay: 1000,
  emergencyCleanupThreshold: 5
}

class PasskeyNudgeErrorHandler {
  private config: ErrorHandlerConfig
  private errorCount: number = 0
  private lastErrorTime: number = 0
  private errorReports: ErrorReport[] = []

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Handles errors with automatic recovery and fallback mechanisms
   */
  async handleError(
    error: Error,
    context: ErrorContext,
    fallbackFn?: () => any
  ): Promise<{ success: boolean; result?: any; usedFallback: boolean }> {
    try {
      this.errorCount++
      this.lastErrorTime = Date.now()

      if (this.config.enableLogging) {
      }

      // Create error report
      const report: ErrorReport = {
        error,
        context,
        recoveryAttempted: false,
        recoverySuccessful: false,
        fallbackUsed: false
      }

      // Attempt recovery if enabled
      if (this.config.enableRecovery) {
        const recoveryResult = await this.attemptRecovery(error, context)
        report.recoveryAttempted = true
        report.recoverySuccessful = recoveryResult.success

        if (recoveryResult.success) {
          this.errorReports.push(report)
          return { success: true, result: recoveryResult.result, usedFallback: false }
        }
      }

      // Use fallback if available
      if (fallbackFn) {
        try {
          const fallbackResult = fallbackFn()
          report.fallbackUsed = true
          this.errorReports.push(report)

          if (this.config.enableLogging) {
          }

          return { success: true, result: fallbackResult, usedFallback: true }
        } catch (fallbackError) {
          if (this.config.enableLogging) {
          }
        }
      }

      // Check if emergency cleanup is needed
      if (this.errorCount >= this.config.emergencyCleanupThreshold) {
        await this.performEmergencyCleanup()
      }

      this.errorReports.push(report)
      return { success: false, usedFallback: false }
    } catch (handlerError) {
      return { success: false, usedFallback: false }
    }
  }

  /**
   * Attempts to recover from specific error types
   */
  private async attemptRecovery(
    error: Error,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any }> {
    try {
      // Storage-related error recovery
      if (this.isStorageError(error)) {
        return await this.recoverFromStorageError(error, context)
      }

      // Session-related error recovery
      if (this.isSessionError(error)) {
        return await this.recoverFromSessionError(error, context)
      }

      // Timer-related error recovery
      if (this.isTimerError(error)) {
        return await this.recoverFromTimerError(error, context)
      }

      // Generic recovery attempt
      return await this.performGenericRecovery(error, context)
    } catch (recoveryError) {
      if (this.config.enableLogging) {
      }
      return { success: false }
    }
  }

  /**
   * Recovers from storage-related errors
   */
  private async recoverFromStorageError(
    error: Error,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any }> {
    try {
      if (this.config.enableLogging) {
      }

      // Check if it's a quota exceeded error
      if (error.name === 'QuotaExceededError' || (error as any).code === 22) {
        // Perform cleanup and retry
        emergencyCleanup()
        
        // Wait a bit for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Validate storage health
        const isHealthy = validateAndCleanupStorage()
        
        return { success: isHealthy, result: isHealthy }
      }

      // Check if it's an access denied error
      if (error.name === 'SecurityError' || error.message.includes('access denied')) {
        if (this.config.enableLogging) {
        }
        
        // Return success with memory-only mode
        return { success: true, result: 'memory-only' }
      }

      return { success: false }
    } catch (storageRecoveryError) {
      if (this.config.enableLogging) {
      }
      return { success: false }
    }
  }

  /**
   * Recovers from session-related errors
   */
  private async recoverFromSessionError(
    error: Error,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any }> {
    try {
      if (this.config.enableLogging) {
      }

      // Perform session state recovery
      const recoveryResult = performErrorRecovery()
      
      if (recoveryResult.success) {
        return { success: true, result: 'session-recovered' }
      }

      // If recovery failed, provide minimal fallback
      return { success: true, result: 'minimal-mode' }
    } catch (sessionRecoveryError) {
      if (this.config.enableLogging) {
      }
      return { success: false }
    }
  }

  /**
   * Recovers from timer-related errors
   */
  private async recoverFromTimerError(
    error: Error,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any }> {
    try {
      if (this.config.enableLogging) {
      }

      // Clear any existing timers
      if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
        (window as any).passkeyNudgeCleanupTimers.forEach((timer: NodeJS.Timeout) => {
          try {
            clearTimeout(timer)
          } catch (clearError) {
            // Ignore individual timer clear errors
          }
        })
        ;(window as any).passkeyNudgeCleanupTimers = []
      }

      return { success: true, result: 'timers-cleared' }
    } catch (timerRecoveryError) {
      if (this.config.enableLogging) {
      }
      return { success: false }
    }
  }

  /**
   * Performs generic recovery for unknown error types
   */
  private async performGenericRecovery(
    error: Error,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any }> {
    try {
      if (this.config.enableLogging) {
      }

      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))

      // Perform basic health checks
      const storageHealthy = validateAndCleanupStorage()
      const sessionRecovery = performErrorRecovery()

      const success = storageHealthy && sessionRecovery.success
      
      return { 
        success, 
        result: success ? 'generic-recovery' : 'partial-recovery' 
      }
    } catch (genericRecoveryError) {
      if (this.config.enableLogging) {
      }
      return { success: false }
    }
  }

  /**
   * Performs emergency cleanup when error threshold is reached
   */
  private async performEmergencyCleanup(): Promise<void> {
    try {
      if (this.config.enableLogging) {
      }

      // Perform comprehensive cleanup
      emergencyCleanup()

      // Reset error count after cleanup
      this.errorCount = 0
      this.errorReports = []

      if (this.config.enableLogging) {
      }
    } catch (cleanupError) {
    }
  }

  /**
   * Error type detection methods
   */
  private isStorageError(error: Error): boolean {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'SecurityError' ||
      (error as any).code === 22 ||
      error.message.includes('storage') ||
      error.message.includes('quota') ||
      error.message.includes('access denied')
    )
  }

  private isSessionError(error: Error): boolean {
    return (
      error.message.includes('session') ||
      error.message.includes('authentication') ||
      error.message.includes('user') ||
      error.message.includes('identifier')
    )
  }

  private isTimerError(error: Error): boolean {
    return (
      error.message.includes('timer') ||
      error.message.includes('timeout') ||
      error.message.includes('clearTimeout') ||
      error.message.includes('setTimeout')
    )
  }

  /**
   * Utility methods
   */
  getErrorStats(): {
    totalErrors: number
    lastErrorTime: number
    errorsByType: Record<string, number>
    recoverySuccessRate: number
  } {
    const errorsByType: Record<string, number> = {}
    let successfulRecoveries = 0

    this.errorReports.forEach(report => {
      const errorType = report.error.name || 'Unknown'
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1
      
      if (report.recoverySuccessful || report.fallbackUsed) {
        successfulRecoveries++
      }
    })

    const recoverySuccessRate = this.errorReports.length > 0 
      ? successfulRecoveries / this.errorReports.length 
      : 0

    return {
      totalErrors: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      errorsByType,
      recoverySuccessRate
    }
  }

  clearErrorHistory(): void {
    this.errorReports = []
    this.errorCount = 0
    this.lastErrorTime = 0
  }

  isHealthy(): boolean {
    const now = Date.now()
    const recentErrorThreshold = 5 * 60 * 1000 // 5 minutes
    
    // Check if there have been recent errors
    const recentErrors = this.errorReports.filter(
      report => now - report.context.timestamp < recentErrorThreshold
    ).length

    return recentErrors < this.config.emergencyCleanupThreshold
  }
}

// Export singleton instance
export const passkeyNudgeErrorHandler = new PasskeyNudgeErrorHandler()

// Export utility functions
export function withErrorHandling<T>(
  operation: () => T,
  context: ErrorContext,
  fallback?: () => T
): Promise<T | null> {
  return new Promise(async (resolve) => {
    try {
      const result = operation()
      resolve(result)
    } catch (error) {
      const handlerResult = await passkeyNudgeErrorHandler.handleError(
        error as Error,
        context,
        fallback
      )
      
      resolve(handlerResult.success ? handlerResult.result : null)
    }
  })
}

export function createErrorContext(
  component: string,
  operation: string,
  sessionId?: string,
  userId?: string
): ErrorContext {
  return {
    component,
    operation,
    timestamp: Date.now(),
    sessionId,
    userId
  }
}