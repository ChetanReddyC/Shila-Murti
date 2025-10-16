'use client'

import React, { useEffect, useState, useRef } from 'react'
import SetupPasskeyButton from './SetupPasskeyButton'
import { useSession } from 'next-auth/react'
import {
  detectMfaCompletion,
  detectCheckoutAuthentication,
  detectLoginCompletion,
  hasSessionDataChanged as utilHasSessionDataChanged,
  hasSessionBecomeAuthenticated,
  getUserIdentifierFromSession,
  getOriginalIdentifierFromSession,
  getCustomerIdFromSession as utilGetCustomerIdFromSession,
  hasExistingPasskeyPolicy,
  type AuthenticationEvent
} from '../utils/sessionStateTracking'
import {
  storeAuthenticationEvent,
  getRecentAuthEvent,
  consumeAuthEvent,
  hasRecentAuthEvent,
  broadcastAuthEvent,
  getStoredAuthEvents
} from '../utils/authEventStorage'

// Interface for tracking session state changes
interface SessionTrackingState {
  previousStatus: string | null
  previousSessionData: any | null
  lastEvaluationTimestamp: number
  stabilizationTimer: NodeJS.Timeout | null
  lastAuthEvent: AuthenticationEvent | null
  componentMountId: string
  lastMountTimestamp: number
}

// Enhanced timing configuration for different authentication scenarios
interface TimingConfig {
  stabilizationDelay: number    // Wait for session to stabilize after data changes
  authEventDelay: number        // Wait after authentication events are detected
  remountDelay: number          // Wait after component remount to prevent duplicates
  mfaCompletionDelay: number    // Wait after MFA completion specifically
  checkoutAuthDelay: number     // Wait after checkout authentication
  crossTabEventDelay: number    // Wait after receiving cross-tab events
  minTimeBetweenEvaluations: number // Minimum time between nudge evaluations
}

// Debug logging configuration and utilities
interface DebugConfig {
  enabled: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  logPerformance: boolean
  logSessionChanges: boolean
  logAuthEvents: boolean
  logTimingDelays: boolean
}

const DEBUG_CONFIG: DebugConfig = {
  enabled: typeof window !== 'undefined' && (
    localStorage.getItem('passkeyNudgeDebug') === 'true' ||
    window.location.search.includes('passkeyDebug=true') ||
    process.env.NODE_ENV === 'development'
  ),
  logLevel: 'debug',
  logPerformance: true,
  logSessionChanges: true,
  logAuthEvents: true,
  logTimingDelays: true
}

// Enhanced debug logger with structured logging
class PasskeyNudgeLogger {
  private static instance: PasskeyNudgeLogger
  private componentId: string
  private performanceMarks: Map<string, number> = new Map()

  constructor(componentId: string) {
    this.componentId = componentId
  }

  static getInstance(componentId: string): PasskeyNudgeLogger {
    if (!PasskeyNudgeLogger.instance) {
      PasskeyNudgeLogger.instance = new PasskeyNudgeLogger(componentId)
    }
    return PasskeyNudgeLogger.instance
  }

  private formatMessage(level: string, category: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const prefix = `[PasskeyNudge:${this.componentId}:${category}]`
    let formattedMessage = `${timestamp} ${prefix} ${message}`
    
    if (data) {
      formattedMessage += ` | Data: ${JSON.stringify(data, null, 2)}`
    }
    
    return formattedMessage
  }

  debug(category: string, message: string, data?: any) {
    if (!DEBUG_CONFIG.enabled) return
  }

  info(category: string, message: string, data?: any) {
    if (!DEBUG_CONFIG.enabled) return
  }

  warn(category: string, message: string, data?: any) {
    if (!DEBUG_CONFIG.enabled) return
  }

  error(category: string, message: string, data?: any) {
    if (!DEBUG_CONFIG.enabled) return
  }

  // Performance monitoring methods
  startPerformanceTimer(operation: string) {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.logPerformance) return
    const startTime = performance.now()
    this.performanceMarks.set(operation, startTime)
    this.debug('PERFORMANCE', `Started timing operation: ${operation}`)
  }

  endPerformanceTimer(operation: string) {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.logPerformance) return
    const startTime = this.performanceMarks.get(operation)
    if (startTime) {
      const duration = performance.now() - startTime
      this.performanceMarks.delete(operation)
      this.info('PERFORMANCE', `Operation completed: ${operation}`, { 
        duration: `${duration.toFixed(2)}ms`,
        startTime,
        endTime: performance.now()
      })
      
      // Log performance warnings for slow operations
      if (duration > 1000) {
        this.warn('PERFORMANCE', `Slow operation detected: ${operation}`, { duration: `${duration.toFixed(2)}ms` })
      }
    }
  }

  // Session state change logging
  logSessionChange(previousStatus: string | null, currentStatus: string, sessionData: any, changes: any) {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.logSessionChanges) return
    
    this.info('SESSION_CHANGE', 'Session state transition detected', {
      previousStatus,
      currentStatus,
      changes,
      sessionDataKeys: sessionData ? Object.keys(sessionData) : [],
      timestamp: Date.now()
    })
  }

  // Authentication event logging
  logAuthEvent(eventType: string, event: any, action: 'detected' | 'stored' | 'consumed' | 'broadcast') {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.logAuthEvents) return
    
    this.info('AUTH_EVENT', `Authentication event ${action}: ${eventType}`, {
      event,
      action,
      timestamp: Date.now()
    })
  }

  // Timing delay logging
  logTimingDelay(scenario: string, delay: number, reason: string, context?: any) {
    if (!DEBUG_CONFIG.enabled || !DEBUG_CONFIG.logTimingDelays) return
    
    this.info('TIMING', `Applying delay for scenario: ${scenario}`, {
      delay: `${delay}ms`,
      reason,
      context,
      timestamp: Date.now()
    })
  }

  // Nudge evaluation logging
  logNudgeEvaluation(result: 'show' | 'skip', reason: string, context?: any) {
    if (!DEBUG_CONFIG.enabled) return
    
    const level = result === 'show' ? 'info' : 'debug'
    const message = `Nudge evaluation result: ${result.toUpperCase()}`
    
    if (level === 'info') {
      this.info('EVALUATION', message, { reason, context, timestamp: Date.now() })
    } else {
      this.debug('EVALUATION', message, { reason, context, timestamp: Date.now() })
    }
  }

  // Error context logging
  logErrorContext(operation: string, error: any, context?: any) {
    if (!DEBUG_CONFIG.enabled) return
    
    this.error('ERROR_CONTEXT', `Error in operation: ${operation}`, {
      error: {
        message: error?.message,
        name: error?.name,
        stack: error?.stack
      },
      context,
      timestamp: Date.now()
    })
  }
}

const TIMING_CONFIG: TimingConfig = {
  stabilizationDelay: 500,      // Reduced from 1000ms for faster response
  authEventDelay: 1500,         // Reduced from 2000ms
  remountDelay: 250,            // Reduced from 500ms
  mfaCompletionDelay: 2000,     // Keep the same for MFA completion
  checkoutAuthDelay: 1000,      // Reduced from 1500ms
  crossTabEventDelay: 500,      // Reduced from 800ms
  minTimeBetweenEvaluations: 2000 // Reduced from 3000ms
}

export default function PasskeyNudge() {
  const { data: session, status } = useSession()
  const [show, setShow] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Generate unique component mount ID for remount detection
  const componentMountId = useRef(Math.random().toString(36).substring(2, 15))
  const mountTimestamp = useRef(Date.now())

  // Initialize debug logger with component ID
  const logger = useRef(PasskeyNudgeLogger.getInstance(componentMountId.current))

  // Timer management refs for proper cleanup
  const timersRef = useRef<{
    stabilizationTimer: NodeJS.Timeout | null
    evaluationTimer: NodeJS.Timeout | null
    remountTimer: NodeJS.Timeout | null
  }>({
    stabilizationTimer: null,
    evaluationTimer: null,
    remountTimer: null
  })

  // Session tracking state with enhanced remount detection
  const [sessionTracking, setSessionTracking] = useState<SessionTrackingState>({
    previousStatus: null,
    previousSessionData: null,
    lastEvaluationTimestamp: 0,
    stabilizationTimer: null,
    lastAuthEvent: null,
    componentMountId: componentMountId.current,
    lastMountTimestamp: mountTimestamp.current
  })

  // Helper to clear all active timers with enhanced cleanup
  const clearAllTimers = () => {
    logger.current.startPerformanceTimer('clearAllTimers')
    
    try {
      let timersCleared = 0
      
      Object.entries(timersRef.current).forEach(([timerName, timer]) => {
        if (timer) {
          try {
            clearTimeout(timer)
            timersCleared++
            logger.current.debug('TIMER_CLEANUP', `Cleared timer: ${timerName}`)
          } catch (timerError) {
            logger.current.error('TIMER_CLEANUP', `Error clearing timer: ${timerName}`, timerError)
          }
        }
      })
      
      timersRef.current = {
        stabilizationTimer: null,
        evaluationTimer: null,
        remountTimer: null
      }
      
      // Also clear any timer in session tracking state
      if (sessionTracking.stabilizationTimer) {
        try {
          clearTimeout(sessionTracking.stabilizationTimer)
          timersCleared++
          logger.current.debug('TIMER_CLEANUP', 'Cleared session tracking timer')
        } catch (trackingTimerError) {
          logger.current.error('TIMER_CLEANUP', 'Error clearing tracking timer', trackingTimerError)
        }
      }
      
      // Clear any global cleanup timers for broadcast events
      try {
        if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
          const globalTimers = (window as any).passkeyNudgeCleanupTimers
          globalTimers.forEach((timer: NodeJS.Timeout, index: number) => {
            try {
              clearTimeout(timer)
              timersCleared++
            } catch (cleanupTimerError) {
              logger.current.debug('TIMER_CLEANUP', `Error clearing global cleanup timer ${index}`, cleanupTimerError)
            }
          })
          ;(window as any).passkeyNudgeCleanupTimers = []
          logger.current.debug('TIMER_CLEANUP', `Cleared ${globalTimers.length} global cleanup timers`)
        }
      } catch (globalCleanupError) {
        logger.current.error('TIMER_CLEANUP', 'Error clearing global cleanup timers', globalCleanupError)
      }
      
      logger.current.info('TIMER_CLEANUP', `Successfully cleared all active timers`, { timersCleared })
    } catch (error) {
      logger.current.error('TIMER_CLEANUP', 'Error in clearAllTimers', error)
    } finally {
      logger.current.endPerformanceTimer('clearAllTimers')
    }
  }

  // Helper to detect component remount and prevent duplicate dialogs
  const isRecentRemount = (): boolean => {
    const timeSinceMount = Date.now() - mountTimestamp.current
    const isRecent = timeSinceMount < TIMING_CONFIG.minTimeBetweenEvaluations
    
    logger.current.debug('REMOUNT_CHECK', 'Checking for recent component remount', {
      timeSinceMount: `${timeSinceMount}ms`,
      threshold: `${TIMING_CONFIG.minTimeBetweenEvaluations}ms`,
      isRecent,
      componentMountId: componentMountId.current
    })
    
    if (isRecent) {
      logger.current.info('REMOUNT_CHECK', 'Recent component remount detected - preventing duplicate dialog', {
        timeSinceMount: `${timeSinceMount}ms`
      })
    }
    
    return isRecent
  }

  // Helper to check if enough time has passed since last evaluation
  const canEvaluateNudge = (): boolean => {
    const timeSinceLastEvaluation = Date.now() - sessionTracking.lastEvaluationTimestamp
    const canEvaluate = timeSinceLastEvaluation >= TIMING_CONFIG.minTimeBetweenEvaluations
    
    logger.current.debug('EVALUATION_TIMING', 'Checking if nudge evaluation is allowed', {
      timeSinceLastEvaluation: `${timeSinceLastEvaluation}ms`,
      threshold: `${TIMING_CONFIG.minTimeBetweenEvaluations}ms`,
      canEvaluate,
      lastEvaluationTimestamp: sessionTracking.lastEvaluationTimestamp
    })
    
    if (!canEvaluate) {
      logger.current.info('EVALUATION_TIMING', 'Evaluation blocked - too soon since last evaluation', {
        timeSinceLastEvaluation: `${timeSinceLastEvaluation}ms`,
        requiredWait: `${TIMING_CONFIG.minTimeBetweenEvaluations}ms`
      })
    }
    
    return canEvaluate
  }

  // Helper to determine appropriate delay based on authentication scenario
  const getDelayForScenario = (authEvents: AuthenticationEvent[], becameAuthenticated: boolean, sessionDataChanged: boolean): number => {
    logger.current.startPerformanceTimer('getDelayForScenario')
    
    let selectedDelay = TIMING_CONFIG.stabilizationDelay
    let reason = 'default-stabilization'
    
    // Check for specific authentication event types and use appropriate delays
    for (const event of authEvents) {
      switch (event.type) {
        case 'mfa-complete':
          selectedDelay = TIMING_CONFIG.mfaCompletionDelay
          reason = 'mfa-completion'
          logger.current.logTimingDelay('MFA_COMPLETION', selectedDelay, reason, { event })
          logger.current.endPerformanceTimer('getDelayForScenario')
          return selectedDelay
        case 'checkout-auth':
          selectedDelay = TIMING_CONFIG.checkoutAuthDelay
          reason = 'checkout-authentication'
          logger.current.logTimingDelay('CHECKOUT_AUTH', selectedDelay, reason, { event })
          logger.current.endPerformanceTimer('getDelayForScenario')
          return selectedDelay
        case 'login-complete':
          selectedDelay = TIMING_CONFIG.authEventDelay
          reason = 'login-completion'
          logger.current.logTimingDelay('LOGIN_COMPLETE', selectedDelay, reason, { event })
          logger.current.endPerformanceTimer('getDelayForScenario')
          return selectedDelay
      }
    }

    // Fallback to general timing rules
    if (authEvents.length > 0) {
      selectedDelay = TIMING_CONFIG.authEventDelay
      reason = 'general-auth-events'
    } else if (becameAuthenticated) {
      selectedDelay = TIMING_CONFIG.authEventDelay
      reason = 'became-authenticated'
    } else if (sessionDataChanged && status === 'authenticated') {
      selectedDelay = TIMING_CONFIG.stabilizationDelay
      reason = 'session-data-changed'
    } else if (status === 'authenticated') {
      selectedDelay = TIMING_CONFIG.remountDelay
      reason = 'already-authenticated'
    }

    const context = {
      authEventsCount: authEvents.length,
      authEventTypes: authEvents.map(e => e.type),
      becameAuthenticated,
      sessionDataChanged,
      currentStatus: status
    }

    logger.current.logTimingDelay('GENERAL_SCENARIO', selectedDelay, reason, context)
    logger.current.endPerformanceTimer('getDelayForScenario')
    
    return selectedDelay
  }

  // Helper to get a stable identifier for the user
  const getUserIdentifier = () => {
    try {
      return getUserIdentifierFromSession(session)
    } catch (error) {
      return null
    }
  }

  // Helper to get the original (unmasked) identifier for passkey registration
  const getOriginalIdentifier = () => {
    try {
      return getOriginalIdentifierFromSession(session)
    } catch (error) {
      return null
    }
  }

  // Helper to get customerId from session with error handling
  const getCustomerIdFromSession = (sessionData: any): string | null => {
    try {
      return utilGetCustomerIdFromSession(sessionData)
    } catch (error) {
      return null
    }
  }

  // Helper to check if session is stable and ready for nudge evaluation with enhanced error handling
  const isSessionStable = (sessionData: any): { stable: boolean; reason: string } => {
    try {
      if (!sessionData || status !== 'authenticated') {
        return { stable: false, reason: 'session-not-authenticated' }
      }

      // For first-time users, we can be more lenient with session data completeness
      const identifier = getUserIdentifierFromSession(sessionData)
      if (identifier) {
        // Check if this is likely a first-time authentication
        const isFirstTime = !hasExistingPasskeyPolicy(identifier)
        
        if (isFirstTime) {
          // For first-time users, just ensure we have basic identifier information
          if (identifier) {
            return { stable: true, reason: 'first-time-user-session-stable' }
          }
        }
      }

      // Validate session data structure
      if (typeof sessionData !== 'object') {
        return { stable: false, reason: 'invalid-session-data' }
      }

      // Check if session has complete user data with error handling
      let hasUserData = false
      try {
        hasUserData = sessionData.user && (
          sessionData.user.originalEmail || 
          sessionData.user.originalPhone || 
          sessionData.user.email || 
          sessionData.user.phone
        )
      } catch (userDataError) {
        return { stable: false, reason: 'user-data-error' }
      }

      if (!hasUserData) {
        return { stable: false, reason: 'incomplete-user-data' }
      }

      // Check if enough time has passed since session status change for stabilization
      const timeSinceMount = Date.now() - mountTimestamp.current
      if (timeSinceMount < TIMING_CONFIG.stabilizationDelay) {
        return { stable: false, reason: 'insufficient-stabilization-time' }
      }

      // Check if session data has been stable (not changing rapidly)
      const timeSinceLastEvaluation = Date.now() - sessionTracking.lastEvaluationTimestamp
      if (sessionTracking.lastEvaluationTimestamp > 0 && timeSinceLastEvaluation < TIMING_CONFIG.minTimeBetweenEvaluations) {
        return { stable: false, reason: 'recent-evaluation' }
      }

      // Additional stability checks for specific authentication scenarios with error handling
      try {
        if (sessionData.user && sessionData.user.mfaComplete === true) {
          // For MFA completion, ensure additional time for UI stability
          if (timeSinceMount < TIMING_CONFIG.mfaCompletionDelay) {
            return { stable: false, reason: 'mfa-completion-stabilizing' }
          }
        }

        // Check for customerId changes with error handling
        let hasNewCustomerId = false
        try {
          const currentCustomerId = getCustomerIdFromSession(sessionData)
          const previousCustomerId = sessionTracking.previousSessionData ? 
            getCustomerIdFromSession(sessionTracking.previousSessionData) : null
        
          hasNewCustomerId = Boolean(currentCustomerId && !previousCustomerId)
        } catch (customerIdError) {
          // Continue without this check
        }

        if (hasNewCustomerId) {
          // For new customerId (checkout auth), ensure checkout flow stability
          if (timeSinceMount < TIMING_CONFIG.checkoutAuthDelay) {
            return { stable: false, reason: 'checkout-auth-stabilizing' }
          }
        }
      } catch (stabilityCheckError) {
        // Continue with basic stability check
      }

      return { stable: true, reason: 'session-stable' }
    } catch (error) {
      return { stable: false, reason: 'stability-check-error' }
    }
  }

  // Enhanced helper to check if nudge should be skipped with comprehensive error handling
  const shouldSkipNudge = (identifier: string, sessionData: any = null): { skip: boolean; reason: string } => {
    try {
      if (typeof window === 'undefined') {
        return { skip: true, reason: 'server-side-rendering' }
      }

      // Validate identifier
      if (!identifier || typeof identifier !== 'string') {
        return { skip: true, reason: 'invalid-identifier' }
      }

      // CRITICAL: Check if user authenticated with passkey in current session
      // This prevents showing the prompt to users who just logged in with a passkey
      try {
        if (sessionData && typeof sessionData === 'object') {
          const sessionHasPasskey = (sessionData as any)?.hasPasskey
          if (sessionHasPasskey === true) {
            logger.current.info('SKIP_CHECK', 'User authenticated with passkey in current session', {
              identifier,
              sessionHasPasskey
            })
            return { skip: true, reason: 'authenticated-with-passkey' }
          }
        }
      } catch (sessionCheckError) {
        logger.current.logErrorContext('shouldSkipNudge-sessionCheck', sessionCheckError, { identifier })
        // Continue with other checks
      }

      // Primary check: Skip if user has already registered a passkey on this device
      // But also check if the passkey actually exists on the device
      if (hasExistingPasskeyPolicy(identifier)) {
        // Additional check: verify the passkey actually exists on the device
        try {
          if (typeof window !== 'undefined') {
            const hasPasskeySession = sessionStorage.getItem('hasPasskey')
            // If session indicates no passkey, then user has removed it from device
            if (hasPasskeySession === 'false' || hasPasskeySession === null) {
              // Don't skip - show the nudge to allow re-registration
            } else {
              return { skip: true, reason: 'user-has-passkey' }
            }
          }
        } catch (sessionError) {
          // Continue with policy check only
          return { skip: true, reason: 'user-has-passkey' }
        }
      }

      // Session stability check: Ensure session data is complete and stable
      let stabilityCheck: { stable: boolean; reason: string }
      try {
        stabilityCheck = isSessionStable(sessionData || session)
      } catch (stabilityError) {
        return { skip: true, reason: 'stability-check-failed' }
      }
      
      if (!stabilityCheck.stable) {
        return { skip: true, reason: stabilityCheck.reason }
      }

      // Authentication event validation: Check if we have a valid reason to show the nudge
      let recentEvent: any = null
      try {
        recentEvent = getRecentAuthEvent(identifier)
      } catch (eventError) {
        // Continue without recent event check
      }

      if (!recentEvent) {
        // No recent authentication event - check if this is a valid scenario to show nudge
        if (status === 'authenticated' && sessionData) {
          // Allow showing nudge for authenticated sessions even without recent events
          // This handles cases where the component mounts after authentication is complete
        } else {
          return { skip: true, reason: 'no-authentication-event' }
        }
      } else {
        try {
          // Validate the authentication event is still relevant
          const eventAge = Date.now() - recentEvent.timestamp
          const maxEventAge = 5 * 60 * 1000 // 5 minutes
          
          if (eventAge > maxEventAge) {
            return { skip: true, reason: 'authentication-event-expired' }
          }

          // Check if event has already been consumed
          if (recentEvent.consumed) {
            return { skip: true, reason: 'authentication-event-consumed' }
          }
        } catch (eventValidationError) {
          // Continue with other checks
        }
      }

      // Check for temporary dismissal (session-only) with enhanced error handling
      try {
        const tempDismissedKey = `passkeyNudgeDismissed_${identifier}`
        let tempDismissed = false
        
        try {
          const dismissalValue = sessionStorage.getItem(tempDismissedKey)
          tempDismissed = dismissalValue === '1'
        } catch (storageAccessError) {
          if (storageAccessError instanceof DOMException) {
          } else {
          }
          // Continue without dismissal check - better to show dialog than miss it
        }
        
        if (tempDismissed) {
          return { skip: true, reason: 'temporarily-dismissed' }
        }
      } catch (dismissalError) {
        // Continue without dismissal check
      }

      // Check if we've shown the nudge too recently to prevent spam with enhanced error handling
      try {
        const lastShownKey = `passkeyNudgeLastShown_${identifier}`
        let lastShown: string | null = null
        
        try {
          lastShown = sessionStorage.getItem(lastShownKey)
        } catch (storageAccessError) {
          if (storageAccessError instanceof DOMException) {
          } else {
          }
          // Continue without last shown check - better to show dialog than miss it
        }
        
        if (lastShown) {
          try {
            const lastShownTime = parseInt(lastShown)
            if (!isNaN(lastShownTime) && lastShownTime > 0) {
              const timeSinceLastShown = Date.now() - lastShownTime
              if (timeSinceLastShown < TIMING_CONFIG.minTimeBetweenEvaluations) {
                return { skip: true, reason: 'shown-too-recently' }
              }
            } else {
              try {
                sessionStorage.removeItem(lastShownKey)
              } catch (clearError) {
              }
            }
          } catch (parseError) {
            // Clear corrupted data
            try {
              sessionStorage.removeItem(lastShownKey)
            } catch (clearError) {
            }
          }
        }
      } catch (lastShownError) {
        // Continue without last shown check
      }

      return { skip: false, reason: 'should-show-nudge' }
    } catch (error) {
      return { skip: true, reason: 'skip-check-error' }
    }
  }

  // Helper to detect authentication events from session changes with enhanced error handling
  const detectAuthenticationEvents = (currentSession: any, previousSessionData: any): AuthenticationEvent[] => {
    logger.current.startPerformanceTimer('detectAuthenticationEvents')
    const events: AuthenticationEvent[] = []

    try {
      logger.current.debug('AUTH_EVENT_DETECTION', 'Starting authentication event detection', {
        hasCurrentSession: !!currentSession,
        hasPreviousSession: !!previousSessionData,
        currentSessionKeys: currentSession ? Object.keys(currentSession) : [],
        previousSessionKeys: previousSessionData ? Object.keys(previousSessionData) : []
      })

      // Detect MFA completion with error handling
      try {
        const mfaEvent = detectMfaCompletion(previousSessionData, currentSession)
        if (mfaEvent) {
          logger.current.logAuthEvent('mfa-complete', mfaEvent, 'detected')
          events.push(mfaEvent)
        }
      } catch (mfaError) {
        logger.current.logErrorContext('detectMfaCompletion', mfaError, {
          previousSessionData: !!previousSessionData,
          currentSession: !!currentSession
        })
        // Continue with other event detection
      }

      // Detect checkout authentication with error handling
      try {
        const checkoutEvent = detectCheckoutAuthentication(previousSessionData, currentSession)
        if (checkoutEvent) {
          logger.current.logAuthEvent('checkout-auth', checkoutEvent, 'detected')
          events.push(checkoutEvent)
        }
      } catch (checkoutError) {
        logger.current.logErrorContext('detectCheckoutAuthentication', checkoutError, {
          previousSessionData: !!previousSessionData,
          currentSession: !!currentSession
        })
        // Continue with other event detection
      }

      logger.current.info('AUTH_EVENT_DETECTION', `Completed authentication event detection`, {
        eventsDetected: events.length,
        eventTypes: events.map(e => e.type)
      })
    } catch (error) {
      logger.current.logErrorContext('detectAuthenticationEvents', error, {
        previousSessionData: !!previousSessionData,
        currentSession: !!currentSession
      })
      // Return empty array to prevent further errors
    } finally {
      logger.current.endPerformanceTimer('detectAuthenticationEvents')
    }

    return events
  }

  // Helper to detect first-time authentication vs returning user with enhanced error handling
  const detectFirstTimeAuthentication = (previousStatus: string | null, currentStatus: string, currentSession: any): AuthenticationEvent | null => {
    try {
      let loginEvent: AuthenticationEvent | null = null
      
      try {
        loginEvent = detectLoginCompletion(previousStatus, currentStatus, currentSession)
      } catch (loginDetectionError) {
        return null
      }
      
      if (loginEvent) {

        // For first-time authentication, we rely on the detectLoginCompletion function which already
        // checks for existing passkey policies and sets the appropriate event type
        // 'first-time-login' or 'returning-login'
        return loginEvent
      }

      return loginEvent
    } catch (error) {
      return null
    }
  }

  // Helper to evaluate whether to show the nudge with enhanced timing control and stabilization
  const evaluateNudgeDisplay = (delayMs: number = 0, reason: string = 'general') => {
    logger.current.startPerformanceTimer('evaluateNudgeDisplay')
    
    logger.current.info('EVALUATION_SCHEDULE', 'Scheduling nudge evaluation', {
      delay: `${delayMs}ms`,
      reason,
      timestamp: Date.now()
    })

    // Check if we can evaluate (prevent too frequent evaluations)
    if (!canEvaluateNudge()) {
      logger.current.logNudgeEvaluation('skip', 'too-soon-since-last-evaluation', {
        reason,
        requestedDelay: delayMs
      })
      logger.current.endPerformanceTimer('evaluateNudgeDisplay')
      return
    }

    // Check for recent component remount
    if (isRecentRemount() && reason !== 'cross-tab-event') {
      logger.current.logNudgeEvaluation('skip', 'recent-component-remount', {
        reason,
        requestedDelay: delayMs
      })
      logger.current.endPerformanceTimer('evaluateNudgeDisplay')
      return
    }

    // Clear any existing evaluation timer
    if (timersRef.current.evaluationTimer) {
      clearTimeout(timersRef.current.evaluationTimer)
      timersRef.current.evaluationTimer = null
      logger.current.debug('TIMER_MANAGEMENT', 'Cleared existing evaluation timer')
    }

    const timer = setTimeout(() => {
      logger.current.startPerformanceTimer('nudgeEvaluationExecution')
      logger.current.info('EVALUATION_EXECUTION', 'Executing nudge evaluation after delay', {
        reason,
        delay: `${delayMs}ms`,
        actualDelay: Date.now() - (Date.now() - delayMs)
      })

      // Clear the timer reference
      timersRef.current.evaluationTimer = null

      // Only evaluate if we have an authenticated session
      if (status !== 'authenticated' || !session?.user) {
        logger.current.logNudgeEvaluation('skip', 'session-not-authenticated', {
          status,
          hasSessionUser: !!session?.user,
          reason
        })
        setShow(false)
        logger.current.endPerformanceTimer('nudgeEvaluationExecution')
        return
      }

      const identifier = getUserIdentifier()
      if (!identifier) {
        logger.current.logNudgeEvaluation('skip', 'no-user-identifier', {
          session: !!session,
          reason
        })
        setShow(false)
        logger.current.endPerformanceTimer('nudgeEvaluationExecution')
        return
      }

      // Enhanced skip check with session stability and authentication event validation
      logger.current.startPerformanceTimer('shouldSkipNudgeCheck')
      const skipResult = shouldSkipNudge(identifier, session)
      logger.current.endPerformanceTimer('shouldSkipNudgeCheck')
      
      if (skipResult.skip) {
        logger.current.logNudgeEvaluation('skip', skipResult.reason, {
          identifier,
          reason,
          skipResult
        })
        setShow(false)
        logger.current.endPerformanceTimer('nudgeEvaluationExecution')
        return
      }

      // At this point, we've determined the nudge should be shown
      logger.current.info('EVALUATION_PASSED', 'Nudge evaluation passed, preparing to show dialog', {
        identifier,
        reason,
        skipResult
      })

      // Check for multiple authentication events and ensure we only show dialog once after all complete with enhanced error handling
      let recentEvent: any = null
      let shouldShowNudge = true
      let consumeEvent = false

      try {
        recentEvent = getRecentAuthEvent(identifier)
      } catch (recentEventError) {
        // Continue without recent event - may still show dialog based on session state
      }

      if (recentEvent && !recentEvent.consumed) {
        
        // Check if this is part of a multi-step authentication flow with error handling
        let allRecentEvents: any[] = []
        try {
          allRecentEvents = getStoredAuthEvents().filter(event => 
            event.identifier === identifier && 
            !event.consumed &&
            (Date.now() - event.timestamp) < (2 * 60 * 1000) // Within last 2 minutes
          )
        } catch (storedEventsError) {
          // Fallback to single event handling
          allRecentEvents = [recentEvent]
        }

        if (allRecentEvents.length > 1) {
          // Multiple recent events - check if we should wait for more
          const hasMultipleTypes = new Set(allRecentEvents.map(e => e.type)).size > 1
          const latestEvent = allRecentEvents.sort((a, b) => b.timestamp - a.timestamp)[0]
          const timeSinceLatest = Date.now() - latestEvent.timestamp
          
          if (hasMultipleTypes && timeSinceLatest < TIMING_CONFIG.authEventDelay) {
            shouldShowNudge = false
          } else {
            consumeEvent = true
          }
        } else {
          // Single authentication event
          consumeEvent = true
        }
      } else if (!recentEvent) {
        // No recent authentication event - this might be a component remount after authentication
        // Check if we should show based on session state
        const sessionAge = Date.now() - mountTimestamp.current
        if (sessionAge > TIMING_CONFIG.minTimeBetweenEvaluations) {
          shouldShowNudge = true
        } else {
          shouldShowNudge = false
        }
      }

      if (shouldShowNudge) {
        // Consume authentication events to prevent duplicate displays with enhanced error handling
        if (consumeEvent && recentEvent) {
          try {
            consumeAuthEvent(identifier, recentEvent.type)
          } catch (consumeError) {
            // Continue with showing dialog - consumption failure shouldn't prevent display
          }
        }

        // Record when we're showing the nudge to prevent spam with enhanced error handling
        const lastShownKey = `passkeyNudgeLastShown_${identifier}`
        try {
          sessionStorage.setItem(lastShownKey, Date.now().toString())
        } catch (storageError) {
          if (storageError instanceof DOMException) {
            if (storageError.code === 22 || storageError.name === 'QuotaExceededError') {
              // Try to clean up old data and retry
              try {
                // Import cleanup function dynamically to avoid circular dependencies
                import('../utils/authEventStorage').then(({ cleanupExpiredEvents }) => {
                  cleanupExpiredEvents()
                  try {
                    sessionStorage.setItem(lastShownKey, Date.now().toString())
                  } catch (retryError) {
                  }
                }).catch(importError => {
                })
              } catch (cleanupError) {
              }
            } else {
            }
          } else {
          }
          // Continue without recording - this is not critical for functionality
        }

        // Show the nudge dialog
        setShow(true)
      } else {
        setShow(false)
      }

      // Update tracking state
      setSessionTracking(prev => ({
        ...prev,
        lastEvaluationTimestamp: Date.now(),
        stabilizationTimer: null
      }))
    }, delayMs)

    // Store timer reference for cleanup
    timersRef.current.evaluationTimer = timer

    // Update tracking state with new timer
    setSessionTracking(prev => ({
      ...prev,
      stabilizationTimer: timer
    }))
  }

  // Monitor session status transitions and data changes with authentication event detection
  useEffect(() => {
    logger.current.startPerformanceTimer('sessionMonitoring')
    
    logger.current.debug('SESSION_MONITOR', 'Session monitoring triggered', {
      currentStatus: status,
      previousStatus: sessionTracking.previousStatus,
      hasSession: !!session,
      sessionKeys: session ? Object.keys(session) : []
    })

    // Detect status transition from loading to authenticated
    const statusChanged = sessionTracking.previousStatus !== status
    const becameAuthenticated = hasSessionBecomeAuthenticated(sessionTracking.previousStatus, status)

    // Detect session data changes using utility function
    const sessionDataChanged = utilHasSessionDataChanged(sessionTracking.previousSessionData, session)

    if (statusChanged || sessionDataChanged) {
      const changeDetails = {
        statusChanged,
        becameAuthenticated,
        sessionDataChanged,
        currentStatus: status,
        previousStatus: sessionTracking.previousStatus
      }
      
      logger.current.logSessionChange(
        sessionTracking.previousStatus,
        status,
        session,
        changeDetails
      )

      // Detect authentication events from session changes
      const authEvents = detectAuthenticationEvents(session, sessionTracking.previousSessionData)

      // Detect first-time authentication if session became authenticated
      let loginEvent: AuthenticationEvent | null = null
      if (becameAuthenticated) {
        loginEvent = detectFirstTimeAuthentication(sessionTracking.previousStatus, status, session)
      }

      // Store and broadcast all detected authentication events with enhanced error handling
      const allEvents = [...authEvents]
      if (loginEvent) allEvents.push(loginEvent)

      logger.current.info('AUTH_EVENT_PROCESSING', `Processing ${allEvents.length} authentication events`, {
        eventTypes: allEvents.map(e => e.type),
        eventIdentifiers: allEvents.map(e => e.identifier)
      })

      allEvents.forEach((event, index) => {
        logger.current.startPerformanceTimer(`processAuthEvent_${index}`)
        
        try {
          // Store authentication event with error handling
          try {
            storeAuthenticationEvent(event)
            logger.current.logAuthEvent(event.type, event, 'stored')
          } catch (storeError) {
            logger.current.logErrorContext('storeAuthenticationEvent', storeError, { event })
            // Continue with broadcasting even if storage fails
          }
          
          // Broadcast authentication event with error handling
          try {
            broadcastAuthEvent(event)
            logger.current.logAuthEvent(event.type, event, 'broadcast')
          } catch (broadcastError) {
            logger.current.logErrorContext('broadcastAuthEvent', broadcastError, { event })
            // Continue - broadcasting is not critical for core functionality
          }
          
          logger.current.info('AUTH_EVENT_PROCESSING', `Successfully processed authentication event`, {
            type: event.type,
            identifier: event.identifier,
            timestamp: event.timestamp
          })
        } catch (eventError) {
          logger.current.logErrorContext('processAuthenticationEvent', eventError, { event })
          // Continue with next event
        } finally {
          logger.current.endPerformanceTimer(`processAuthEvent_${index}`)
        }
      })

      // Update tracking state with current session data
      setSessionTracking(prev => ({
        ...prev,
        previousStatus: status,
        previousSessionData: session,
        lastAuthEvent: allEvents.length > 0 ? allEvents[allEvents.length - 1] : prev.lastAuthEvent
      }))

      // Determine appropriate delay and reason based on the type of change and events detected
      logger.current.startPerformanceTimer('determineDelayAndReason')
      const delay = getDelayForScenario(allEvents, becameAuthenticated, sessionDataChanged)
      let reason = 'session-change'

      if (allEvents.length > 0) {
        reason = `auth-events-${allEvents.map(e => e.type).join(',')}`
      } else if (becameAuthenticated) {
        reason = 'became-authenticated'
      } else if (sessionDataChanged && status === 'authenticated') {
        reason = 'session-data-changed'
      } else if (status === 'authenticated') {
        reason = 'already-authenticated'
      }

      logger.current.info('DELAY_DETERMINATION', 'Determined evaluation delay and reason', {
        delay: `${delay}ms`,
        reason,
        allEventsCount: allEvents.length,
        becameAuthenticated,
        sessionDataChanged,
        status
      })
      logger.current.endPerformanceTimer('determineDelayAndReason')

      // Evaluate nudge display with appropriate delay and reason
      evaluateNudgeDisplay(delay, reason)
    } else if (status === 'authenticated' && sessionTracking.lastEvaluationTimestamp === 0) {
      // First time component mounts with authenticated session
      logger.current.info('FIRST_MOUNT', 'First evaluation with authenticated session', {
        status,
        hasSession: !!session,
        lastEvaluationTimestamp: sessionTracking.lastEvaluationTimestamp
      })

      // For first-time users who just completed checkout, we need to check if this is a first-time login
      // even if there are no recent authentication events
      const identifier = getUserIdentifier()
      if (identifier) {
        // Check if this user has an existing passkey policy
        const hasExistingPolicy = hasExistingPasskeyPolicy(identifier)
        
        // If they don't have an existing policy, this might be a first-time login
        if (!hasExistingPolicy) {
          // Evaluate nudge display with a small delay to allow session to stabilize
          evaluateNudgeDisplay(TIMING_CONFIG.remountDelay, 'first-time-user-mount')
        } else {
          // Check for recent authentication events that might have been missed with enhanced error handling
          try {
            const recentEvent = getRecentAuthEvent(identifier)
            if (recentEvent) {
              setSessionTracking(prev => ({
                ...prev,
                lastAuthEvent: {
                  type: recentEvent.type as any,
                  timestamp: recentEvent.timestamp,
                  customerId: recentEvent.customerId,
                  identifier: recentEvent.identifier
                }
              }))
              // Evaluate nudge display with remount delay
              evaluateNudgeDisplay(TIMING_CONFIG.remountDelay, 'recent-auth-event-mount')
            } else {
              // For returning users with existing policies, check if we should still show the nudge
              // This handles cases where the user might want to register additional passkeys
              // We won't show the nudge for returning users in this case
            }
          } catch (recentEventError) {
            // Continue without recent event - component will still function
          }
        }
      }
    }
    
    logger.current.endPerformanceTimer('sessionMonitoring')
  }, [session, status])

  // Enhanced cleanup for all timers on unmount and comprehensive initialization
  useEffect(() => {
    // Perform initial cleanup and validation on component mount
    try {
      
      // Import cleanup functions
      import('../utils/authEventStorage').then(({ cleanupExpiredEvents, validateAndCleanupStorage }) => {
        try {
          // Validate storage health and cleanup if needed
          const storageHealthy = validateAndCleanupStorage()
          if (!storageHealthy) {
          }
          
          // Clean up any expired events from previous sessions
          cleanupExpiredEvents()
        } catch (cleanupError) {
        }
      }).catch(importError => {
      })
    } catch (initError) {
    }

    return () => {
      clearAllTimers()
      
      // Also clear any timer in session tracking state
      if (sessionTracking.stabilizationTimer) {
        try {
          clearTimeout(sessionTracking.stabilizationTimer)
        } catch (trackingTimerError) {
        }
      }
    }
  }, [])

  // Additional cleanup when session tracking changes
  useEffect(() => {
    return () => {
      if (sessionTracking.stabilizationTimer) {
        clearTimeout(sessionTracking.stabilizationTimer)
      }
    }
  }, [sessionTracking.stabilizationTimer])

  // React to passkey registration from another tab (storage event) with enhanced error handling
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      try {
        if (!e.key || !e.newValue) return

        // Listen for passkey registration success from other tabs
        if (e.key.startsWith('passkeyRegistered_')) {
          try {
            const identifier = getUserIdentifier()
            if (identifier && e.key === `passkeyRegistered_${identifier}`) {
              setShow(false)

              // Update our cached policy to reflect the new passkey
              const policyKey = `passkeyPolicy_${identifier}`
              const cacheData = {
                hasPasskey: true,
                expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
              }
              
              try {
                localStorage.setItem(policyKey, JSON.stringify(cacheData))
              } catch (policyUpdateError) {
                // Continue without updating cache
              }
            }
          } catch (registrationError) {
          }
        }

        // Listen for authentication events from other tabs/components
        if (e.key.startsWith('passkeyNudge_broadcast_')) {

          try {
            const broadcastData = JSON.parse(e.newValue)
            
            // Validate broadcast data structure
            if (!broadcastData || typeof broadcastData !== 'object' ||
                !broadcastData.type || !broadcastData.identifier || !broadcastData.timestamp) {
              return
            }
            
            const authEvent: AuthenticationEvent = {
              type: broadcastData.type,
              timestamp: broadcastData.timestamp,
              customerId: broadcastData.customerId,
              identifier: broadcastData.identifier
            }

            // Store the received authentication event
            try {
              storeAuthenticationEvent(authEvent)

              // Re-evaluate nudge display with cross-tab event delay
              evaluateNudgeDisplay(TIMING_CONFIG.crossTabEventDelay, 'cross-tab-event')
            } catch (storeError) {
              // Continue without storing - the event might still trigger evaluation
              evaluateNudgeDisplay(TIMING_CONFIG.crossTabEventDelay, 'cross-tab-event-fallback')
            }
          } catch (broadcastParseError) {
          }
        }

        // NOTE: We don't listen for dismissal events since dismissal is session-only
        // Each tab should show the prompt independently until passkey is registered
      } catch (storageEventError) {
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', handler)
      }
    } catch (listenerError) {
    }

    return () => {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', handler)
        }
      } catch (removeListenerError) {
      }
    }
  }, [session, sessionTracking])

  // Handle escape key to close modal
  useEffect(() => {
    if (!show) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const identifier = getUserIdentifier()
        if (identifier) dismissNudge(identifier)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [show])

  // Focus management for accessibility
  useEffect(() => {
    if (show && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      if (firstElement) {
        firstElement.focus()
      }
    }
  }, [show])

  // Helper to temporarily dismiss the nudge for this session only with error handling
  const dismissNudge = (identifier: string) => {
    try {
      if (!identifier || typeof identifier !== 'string') {
        setShow(false)
        return
      }

      // Use sessionStorage for temporary dismissal (will show again in new session/tab) with enhanced error handling
      const dismissedKey = `passkeyNudgeDismissed_${identifier}`
      try {
        sessionStorage.setItem(dismissedKey, '1')
      } catch (storageError) {
        if (storageError instanceof DOMException) {
          if (storageError.code === 22 || storageError.name === 'QuotaExceededError') {
            // Try to clean up old data and retry
            try {
              import('../utils/authEventStorage').then(({ cleanupExpiredEvents }) => {
                cleanupExpiredEvents()
                try {
                  sessionStorage.setItem(dismissedKey, '1')
                } catch (retryError) {
                }
              }).catch(importError => {
              })
            } catch (cleanupError) {
            }
          } else {
          }
        } else {
        }
        // Continue without storing dismissal - user can still close dialog
      }
      
      setShow(false)
    } catch (error) {
      setShow(false) // Always hide the dialog even if there's an error
    }
  }

  // Helper to mark passkey as registered for this user with error handling
  const markPasskeyRegistered = (identifier: string) => {
    try {
      if (!identifier || typeof identifier !== 'string') {
        setShow(false)
        return
      }

      // Mark as registered for cross-tab communication
      const registeredKey = `passkeyRegistered_${identifier}`
      try {
        localStorage.setItem(registeredKey, JSON.stringify({ timestamp: Date.now() }))
      } catch (registeredStorageError) {
        // Continue with policy update
      }

      // Update policy cache
      const policyKey = `passkeyPolicy_${identifier}`
      const cacheData = {
        hasPasskey: true,
        expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
      }
      
      try {
        localStorage.setItem(policyKey, JSON.stringify(cacheData))
      } catch (policyStorageError) {
        // Continue even if we can't cache the policy
      }

      // Update session storage to indicate passkey registration
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('hasPasskey', 'true')
          // Also update the last passkey credential ID if available
          const lastCredentialId = sessionStorage.getItem('lastPasskeyCredential')
          if (lastCredentialId) {
            sessionStorage.setItem('currentPasskeyCredential', lastCredentialId)
          }
        }
      } catch (sessionError) {
      }

      setShow(false)
    } catch (error) {
      setShow(false) // Always hide the dialog even if there's an error
    }
  }

  // Handle backdrop click to close modal
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      const identifier = getUserIdentifier()
      if (identifier) dismissNudge(identifier)
    }
  }

  if (!show) return null

  const identifier = getUserIdentifier()
  if (!identifier) return null

  const userId = (typeof window !== 'undefined' && sessionStorage.getItem('customerId')) || identifier || 'user'
  const username = getOriginalIdentifier() || identifier || 'user'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-modal-title"
      aria-describedby="passkey-modal-description"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          padding: 32,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => dismissNudge(identifier)}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            fontSize: 24,
            color: '#666',
            cursor: 'pointer',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}
          aria-label="Close passkey setup prompt"
        >
          ×
        </button>

        {/* Modal content */}
        <div style={{ paddingRight: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              fontSize: 48,
              marginBottom: 16,
              filter: 'grayscale(0.2)',
            }}>
              🔐
            </div>
            <h2
              id="passkey-modal-title"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#141414',
                margin: 0,
                marginBottom: 8
              }}
            >
              Set up a passkey on this device
            </h2>
            <p
              id="passkey-modal-description"
              style={{
                fontSize: 16,
                color: '#565656',
                margin: 0,
                lineHeight: 1.5
              }}
            >
              Skip OTP verification next time by registering a passkey with Windows Hello, Touch ID, or your device's built-in security.
            </p>
          </div>

          {/* Benefits section */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#141414',
              margin: 0,
              marginBottom: 12
            }}>
              Benefits of passkeys:
            </h3>
            <ul style={{
              margin: 0,
              paddingLeft: 20,
              color: '#565656',
              fontSize: 14,
              lineHeight: 1.6
            }}>
              <li>No more waiting for OTP codes</li>
              <li>More secure than passwords</li>
              <li>Works with your device's biometrics</li>
              <li>Faster checkout experience</li>
            </ul>
          </div>

          {/* Action button */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <SetupPasskeyButton
              userId={userId}
              username={username}
              onRegistered={() => markPasskeyRegistered(identifier)}
            />
            <button
              onClick={() => dismissNudge(identifier)}
              style={{
                height: 44,
                padding: '0 20px',
                border: '1px solid rgba(20,20,20,0.12)',
                borderRadius: 8,
                background: '#fff',
                color: '#565656',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#fff'
              }}
            >
              Already setuped
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


