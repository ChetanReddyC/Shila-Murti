/**
 * Session Tracking Integration Utility
 * 
 * Provides a unified interface for session state tracking, authentication event detection,
 * and timing control for the PasskeyNudge component.
 */

import { Session } from 'next-auth'
import {
  SessionState,
  AuthenticationEvent,
  SessionTrackingState,
  TimingConfig,
  DEFAULT_TIMING,
  hasSessionStatusChanged,
  hasSessionDataChanged,
  hasSessionBecomeAuthenticated,
  detectMfaCompletion,
  detectCheckoutAuthentication,
  detectLoginCompletion,
  getUserIdentifierFromSession,
  getOriginalIdentifierFromSession,
  createStabilizationTimer,
  clearStabilizationTimer,
  getDelayForAuthEvent,
  hasEventStabilized
} from './sessionStateTracking'

import {
  storeAuthenticationEvent,
  getRecentAuthEvent,
  consumeAuthEvent,
  hasRecentAuthEvent,
  cleanupExpiredEvents,
  broadcastAuthEvent,
  setupCrossTabListener
} from './authEventStorage'

/**
 * Main Session Tracking Manager Class
 */
export class SessionTrackingManager {
  private trackingState: SessionTrackingState
  private timingConfig: TimingConfig
  private crossTabCleanup: (() => void) | null = null
  private onAuthEventCallback: ((event: AuthenticationEvent) => void) | null = null

  constructor(config: Partial<TimingConfig> = {}) {
    this.timingConfig = { ...DEFAULT_TIMING, ...config }
    this.trackingState = {
      previousStatus: null,
      previousSessionData: null,
      lastAuthEvent: null,
      evaluationTimestamp: Date.now(),
      stabilizationTimer: null
    }
  }

  /**
   * Processes a session update and detects authentication events
   */
  processSessionUpdate(
    status: 'loading' | 'authenticated' | 'unauthenticated',
    data: Session | null
  ): {
    hasStatusChanged: boolean
    hasDataChanged: boolean
    authenticationEvent: AuthenticationEvent | null
    shouldEvaluateDialog: boolean
  } {
    const hasStatusChanged = hasSessionStatusChanged(this.trackingState.previousStatus, status)
    const hasDataChanged = hasSessionDataChanged(this.trackingState.previousSessionData, data)
    
    // Detect authentication events (prioritize in order of specificity)
    let authenticationEvent: AuthenticationEvent | null = null
    
    // Check for MFA completion first (highest priority)
    const mfaEvent = detectMfaCompletion(this.trackingState.previousSessionData, data)
    if (mfaEvent) {
      authenticationEvent = mfaEvent
    }
    
    // Check for checkout authentication only if no MFA event detected
    if (!authenticationEvent) {
      const checkoutEvent = detectCheckoutAuthentication(this.trackingState.previousSessionData, data)
      if (checkoutEvent) {
        authenticationEvent = checkoutEvent
      }
    }
    
    // Check for login completion only if no other specific event detected
    if (!authenticationEvent) {
      const loginEvent = detectLoginCompletion(this.trackingState.previousStatus, status, data)
      if (loginEvent) {
        authenticationEvent = loginEvent
      }
    }
    
    // Store authentication event if detected
    if (authenticationEvent) {
      this.trackingState.lastAuthEvent = authenticationEvent
      storeAuthenticationEvent(authenticationEvent)
      broadcastAuthEvent(authenticationEvent)
      
      // Notify callback if set
      if (this.onAuthEventCallback) {
        this.onAuthEventCallback(authenticationEvent)
      }
      
    }
    
    // Update tracking state
    this.trackingState.previousStatus = status
    this.trackingState.previousSessionData = data
    this.trackingState.evaluationTimestamp = Date.now()
    
    // Determine if we should evaluate dialog display
    const shouldEvaluateDialog = this.shouldEvaluateDialogDisplay(
      hasStatusChanged,
      hasDataChanged,
      authenticationEvent,
      status,
      data
    )
    
    return {
      hasStatusChanged,
      hasDataChanged,
      authenticationEvent,
      shouldEvaluateDialog
    }
  }

  /**
   * Determines if the dialog should be evaluated for display
   */
  private shouldEvaluateDialogDisplay(
    hasStatusChanged: boolean,
    hasDataChanged: boolean,
    authenticationEvent: AuthenticationEvent | null,
    status: string,
    data: Session | null
  ): boolean {
    // Only evaluate for authenticated sessions
    if (status !== 'authenticated' || !data) {
      return false
    }
    
    // Evaluate if session became authenticated
    if (hasSessionBecomeAuthenticated(this.trackingState.previousStatus, status)) {
      return true
    }
    
    // Evaluate if we detected an authentication event
    if (authenticationEvent) {
      return true
    }
    
    // Evaluate if session data changed significantly
    if (hasDataChanged) {
      const identifier = getUserIdentifierFromSession(data)
      if (identifier) {
        // Check if there are recent unconsumed auth events
        return hasRecentAuthEvent(identifier)
      }
    }
    
    return false
  }

  /**
   * Schedules dialog evaluation with appropriate timing delay
   */
  scheduleDialogEvaluation(
    callback: () => void,
    authEvent?: AuthenticationEvent | null
  ): void {
    // Clear any existing timer
    this.clearScheduledEvaluation()
    
    // Determine delay based on authentication event
    const delay = getDelayForAuthEvent(authEvent || this.trackingState.lastAuthEvent, this.timingConfig)
    
    
    // Schedule evaluation
    this.trackingState.stabilizationTimer = createStabilizationTimer(callback, delay)
  }

  /**
   * Clears any scheduled dialog evaluation
   */
  clearScheduledEvaluation(): void {
    if (this.trackingState.stabilizationTimer) {
      clearStabilizationTimer(this.trackingState.stabilizationTimer)
      this.trackingState.stabilizationTimer = null
    }
  }

  /**
   * Checks if the current session state is stable for dialog display
   */
  isSessionStableForDialog(identifier: string): boolean {
    // Check if there are recent unconsumed auth events
    const recentEvent = getRecentAuthEvent(identifier)
    if (recentEvent) {
      // Convert stored event to AuthenticationEvent format
      const authEvent: AuthenticationEvent = {
        type: recentEvent.type as any,
        timestamp: recentEvent.timestamp,
        customerId: recentEvent.customerId,
        identifier: recentEvent.identifier
      }
      
      return hasEventStabilized(authEvent, this.timingConfig)
    }
    
    // Check if last tracked event has stabilized
    return hasEventStabilized(this.trackingState.lastAuthEvent, this.timingConfig)
  }

  /**
   * Marks authentication events as consumed for a user
   */
  consumeAuthenticationEvents(identifier: string, eventType?: string): void {
    consumeAuthEvent(identifier, eventType)
  }

  /**
   * Sets up cross-tab communication for authentication events
   */
  setupCrossTabCommunication(callback: (event: AuthenticationEvent) => void): void {
    this.onAuthEventCallback = callback
    this.crossTabCleanup = setupCrossTabListener(callback)
  }

  /**
   * Gets the current session tracking state for debugging
   */
  getTrackingState(): SessionTrackingState {
    return { ...this.trackingState }
  }

  /**
   * Gets timing configuration
   */
  getTimingConfig(): TimingConfig {
    return { ...this.timingConfig }
  }

  /**
   * Updates timing configuration
   */
  updateTimingConfig(config: Partial<TimingConfig>): void {
    this.timingConfig = { ...this.timingConfig, ...config }
  }

  /**
   * Performs cleanup when component unmounts
   */
  cleanup(): void {
    this.clearScheduledEvaluation()
    
    if (this.crossTabCleanup) {
      this.crossTabCleanup()
      this.crossTabCleanup = null
    }
    
    // Clean up expired events
    cleanupExpiredEvents()
    
  }

  /**
   * Gets debug information about the current state
   */
  getDebugInfo(): {
    trackingState: SessionTrackingState
    timingConfig: TimingConfig
    hasScheduledEvaluation: boolean
    hasCrossTabListener: boolean
  } {
    return {
      trackingState: this.getTrackingState(),
      timingConfig: this.getTimingConfig(),
      hasScheduledEvaluation: this.trackingState.stabilizationTimer !== null,
      hasCrossTabListener: this.crossTabCleanup !== null
    }
  }
}

/**
 * Utility function to create a session tracking manager with default configuration
 */
export function createSessionTrackingManager(config?: Partial<TimingConfig>): SessionTrackingManager {
  return new SessionTrackingManager(config)
}

/**
 * Utility function to extract session state information
 */
export function extractSessionState(
  status: 'loading' | 'authenticated' | 'unauthenticated',
  data: Session | null
): SessionState {
  return {
    status,
    data,
    isStable: status !== 'loading',
    authenticationEvent: null // This would be populated by the manager
  }
}

/**
 * Export all utilities for direct use
 */
export {
  // Core tracking functions
  hasSessionStatusChanged,
  hasSessionDataChanged,
  hasSessionBecomeAuthenticated,
  detectMfaCompletion,
  detectCheckoutAuthentication,
  detectLoginCompletion,
  getUserIdentifierFromSession,
  getOriginalIdentifierFromSession,
  
  // Timing utilities
  getDelayForAuthEvent,
  hasEventStabilized,
  createStabilizationTimer,
  clearStabilizationTimer,
  
  // Storage utilities
  storeAuthenticationEvent,
  getRecentAuthEvent,
  consumeAuthEvent,
  hasRecentAuthEvent,
  cleanupExpiredEvents,
  broadcastAuthEvent,
  setupCrossTabListener,
  
  // Types
  type SessionState,
  type AuthenticationEvent,
  type SessionTrackingState,
  type TimingConfig,
  DEFAULT_TIMING
}