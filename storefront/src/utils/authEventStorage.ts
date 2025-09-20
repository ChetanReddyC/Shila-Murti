/**
 * Authentication Event Storage Utilities
 * 
 * Manages storage and retrieval of authentication events in sessionStorage
 * for tracking recent authentication completions and preventing duplicate dialogs.
 */

import { AuthenticationEvent, StoredAuthEvent } from './sessionStateTracking'

// Storage keys
const AUTH_EVENTS_KEY = 'passkeyNudge_authEvents'
const EVENT_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Storage Management Functions
 */

/**
 * Stores an authentication event in sessionStorage with enhanced error handling
 */
export function storeAuthenticationEvent(event: AuthenticationEvent): void {
  try {
    if (typeof window === 'undefined') return
    
    // Validate event data before storing
    if (!event || !event.type || !event.identifier || !event.timestamp) {
      console.warn('[AuthEventStorage] Invalid event data, skipping storage:', event)
      return
    }
    
    const storedEvent: StoredAuthEvent = {
      type: event.type,
      timestamp: event.timestamp,
      customerId: event.customerId,
      identifier: event.identifier,
      consumed: false
    }
    
    const existingEvents = getStoredAuthEvents()
    const updatedEvents = [...existingEvents, storedEvent]
    
    // Check if sessionStorage is available and has space
    try {
      sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(updatedEvents))
      console.log('[AuthEventStorage] Stored authentication event:', event.type, event.identifier)
    } catch (storageError) {
      // Handle storage quota exceeded or access denied
      if (storageError instanceof DOMException) {
        if (storageError.code === 22 || storageError.name === 'QuotaExceededError') {
          console.warn('[AuthEventStorage] Storage quota exceeded, cleaning up old events')
          // Try to clean up old events and retry
          cleanupExpiredEvents()
          try {
            sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(updatedEvents))
            console.log('[AuthEventStorage] Stored authentication event after cleanup:', event.type, event.identifier)
          } catch (retryError) {
            console.error('[AuthEventStorage] Failed to store event even after cleanup:', retryError)
          }
        } else {
          console.error('[AuthEventStorage] SessionStorage access denied:', storageError)
        }
      } else {
        throw storageError
      }
    }
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to store authentication event:', error)
    // Fallback: Continue without storing the event
    // The system should still function, just without cross-session event tracking
  }
}

/**
 * Retrieves all stored authentication events with enhanced error handling
 */
export function getStoredAuthEvents(): StoredAuthEvent[] {
  try {
    if (typeof window === 'undefined') return []
    
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem(AUTH_EVENTS_KEY)
    } catch (storageError) {
      console.warn('[AuthEventStorage] SessionStorage access failed:', storageError)
      return []
    }
    
    if (!stored) return []
    
    let events: StoredAuthEvent[]
    try {
      events = JSON.parse(stored)
    } catch (parseError) {
      console.warn('[AuthEventStorage] Failed to parse stored events, clearing corrupted data:', parseError)
      // Clear corrupted data
      try {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
      } catch (clearError) {
        console.warn('[AuthEventStorage] Failed to clear corrupted data:', clearError)
      }
      return []
    }
    
    // Validate events array structure
    if (!Array.isArray(events)) {
      console.warn('[AuthEventStorage] Stored events is not an array, clearing corrupted data')
      try {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
      } catch (clearError) {
        console.warn('[AuthEventStorage] Failed to clear corrupted data:', clearError)
      }
      return []
    }
    
    // Filter out expired and malformed events
    const now = Date.now()
    const validEvents = events.filter(event => {
      // Validate event structure
      if (!event || typeof event !== 'object') return false
      if (!event.type || !event.identifier || !event.timestamp) return false
      if (typeof event.timestamp !== 'number') return false
      
      // Check if event is expired
      return now - event.timestamp < EVENT_EXPIRY_MS
    })
    
    // Update storage if we filtered out expired/invalid events
    if (validEvents.length !== events.length) {
      try {
        sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(validEvents))
      } catch (storageError) {
        console.warn('[AuthEventStorage] Failed to update storage after filtering:', storageError)
      }
    }
    
    return validEvents
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to retrieve authentication events:', error)
    return []
  }
}

/**
 * Finds the most recent unconsumed authentication event for a user
 */
export function getRecentAuthEvent(identifier: string): StoredAuthEvent | null {
  const events = getStoredAuthEvents()
  
  // Find the most recent unconsumed event for this identifier
  const userEvents = events
    .filter(event => event.identifier === identifier && !event.consumed)
    .sort((a, b) => b.timestamp - a.timestamp)
  
  return userEvents[0] || null
}

/**
 * Marks an authentication event as consumed with enhanced error handling
 */
export function consumeAuthEvent(identifier: string, eventType?: string): void {
  try {
    if (typeof window === 'undefined') return
    
    // Validate input parameters
    if (!identifier || typeof identifier !== 'string') {
      console.warn('[AuthEventStorage] Invalid identifier for consuming event:', identifier)
      return
    }
    
    const events = getStoredAuthEvents()
    let updated = false
    
    const updatedEvents = events.map(event => {
      if (event.identifier === identifier && !event.consumed) {
        // If eventType is specified, only consume matching events
        if (!eventType || event.type === eventType) {
          updated = true
          return { ...event, consumed: true }
        }
      }
      return event
    })
    
    if (updated) {
      try {
        sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(updatedEvents))
        console.log('[AuthEventStorage] Consumed authentication event for:', identifier, eventType || 'any')
      } catch (storageError) {
        console.warn('[AuthEventStorage] Failed to update storage when consuming event:', storageError)
        // Continue without updating storage - the event will remain unconsumed
        // This is acceptable as it's better to show the dialog again than to miss it
      }
    }
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to consume authentication event:', error)
  }
}

/**
 * Checks if there are any recent unconsumed authentication events for a user
 */
export function hasRecentAuthEvent(identifier: string, eventType?: string): boolean {
  const events = getStoredAuthEvents()
  
  return events.some(event => 
    event.identifier === identifier && 
    !event.consumed &&
    (!eventType || event.type === eventType)
  )
}

/**
 * Cleans up expired authentication events with enhanced error handling
 */
export function cleanupExpiredEvents(): void {
  try {
    if (typeof window === 'undefined') return
    
    const events = getStoredAuthEvents()
    const now = Date.now()
    
    const validEvents = events.filter(event => {
      // Additional validation during cleanup
      if (!event || typeof event !== 'object') return false
      if (!event.timestamp || typeof event.timestamp !== 'number') return false
      
      return now - event.timestamp < EVENT_EXPIRY_MS
    })
    
    if (validEvents.length !== events.length) {
      try {
        sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(validEvents))
        console.log('[AuthEventStorage] Cleaned up expired authentication events:', events.length - validEvents.length, 'removed')
      } catch (storageError) {
        console.warn('[AuthEventStorage] Failed to update storage during cleanup:', storageError)
        
        // If we can't update storage, try to clear it entirely as a fallback
        if (storageError instanceof DOMException && storageError.code === 22) {
          try {
            sessionStorage.removeItem(AUTH_EVENTS_KEY)
            console.log('[AuthEventStorage] Cleared all events due to storage quota issues')
          } catch (clearError) {
            console.error('[AuthEventStorage] Failed to clear storage entirely:', clearError)
          }
        }
      }
    }
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to cleanup expired events:', error)
  }
}

/**
 * Clears all stored authentication events
 */
export function clearAllAuthEvents(): void {
  try {
    if (typeof window === 'undefined') return
    
    sessionStorage.removeItem(AUTH_EVENTS_KEY)
    console.log('[AuthEventStorage] Cleared all authentication events')
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to clear authentication events:', error)
  }
}

/**
 * Cross-tab Communication Functions
 */

/**
 * Broadcasts an authentication event to other tabs with enhanced error handling
 */
export function broadcastAuthEvent(event: AuthenticationEvent): void {
  try {
    if (typeof window === 'undefined') return
    
    // Validate event data before broadcasting
    if (!event || !event.type || !event.identifier || !event.timestamp) {
      console.warn('[AuthEventStorage] Invalid event data for broadcast:', event)
      return
    }
    
    // Use localStorage for cross-tab communication
    const broadcastKey = `passkeyNudge_broadcast_${event.identifier}`
    const broadcastData = {
      ...event,
      broadcastTimestamp: Date.now()
    }
    
    try {
      localStorage.setItem(broadcastKey, JSON.stringify(broadcastData))
      console.log('[AuthEventStorage] Broadcasted authentication event:', event.type, event.identifier)
    } catch (storageError) {
      console.warn('[AuthEventStorage] Failed to broadcast to localStorage:', storageError)
      // Continue without broadcasting - this is not critical for core functionality
      return
    }
    
    // Clean up broadcast data after a short delay
    const cleanupTimer = setTimeout(() => {
      try {
        localStorage.removeItem(broadcastKey)
      } catch (cleanupError) {
        // Ignore cleanup errors - the data will eventually be overwritten
        console.debug('[AuthEventStorage] Failed to cleanup broadcast data:', cleanupError)
      }
    }, 1000)
    
    // Store cleanup timer reference for potential cancellation
    if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
      (window as any).passkeyNudgeCleanupTimers.push(cleanupTimer)
    } else if (typeof window !== 'undefined') {
      (window as any).passkeyNudgeCleanupTimers = [cleanupTimer]
    }
    
  } catch (error) {
    console.warn('[AuthEventStorage] Failed to broadcast authentication event:', error)
  }
}

/**
 * Sets up a listener for authentication events from other tabs
 */
export function setupCrossTabListener(
  callback: (event: AuthenticationEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  
  const handleStorageEvent = (e: StorageEvent) => {
    try {
      if (!e.key || !e.newValue) return
      
      // Listen for broadcast events
      if (e.key.startsWith('passkeyNudge_broadcast_')) {
        const broadcastData = JSON.parse(e.newValue)
        
        // Convert back to AuthenticationEvent
        const authEvent: AuthenticationEvent = {
          type: broadcastData.type,
          timestamp: broadcastData.timestamp,
          customerId: broadcastData.customerId,
          identifier: broadcastData.identifier
        }
        
        callback(authEvent)
      }
    } catch (error) {
      console.warn('[AuthEventStorage] Error handling cross-tab storage event:', error)
    }
  }
  
  window.addEventListener('storage', handleStorageEvent)
  
  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageEvent)
  }
}

/**
 * Utility Functions
 */

/**
 * Gets debug information about stored authentication events
 */
export function getAuthEventDebugInfo(): {
  totalEvents: number
  eventsByType: Record<string, number>
  eventsByUser: Record<string, number>
  oldestEvent: number | null
  newestEvent: number | null
} {
  const events = getStoredAuthEvents()
  
  const eventsByType: Record<string, number> = {}
  const eventsByUser: Record<string, number> = {}
  let oldestEvent: number | null = null
  let newestEvent: number | null = null
  
  events.forEach(event => {
    // Count by type
    eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
    
    // Count by user
    eventsByUser[event.identifier] = (eventsByUser[event.identifier] || 0) + 1
    
    // Track oldest and newest
    if (oldestEvent === null || event.timestamp < oldestEvent) {
      oldestEvent = event.timestamp
    }
    if (newestEvent === null || event.timestamp > newestEvent) {
      newestEvent = event.timestamp
    }
  })
  
  return {
    totalEvents: events.length,
    eventsByType,
    eventsByUser,
    oldestEvent,
    newestEvent
  }
}

/**
 * Emergency cleanup function for abandoned timers and corrupted storage
 */
export function emergencyCleanup(): void {
  try {
    console.log('[AuthEventStorage] Performing emergency cleanup')
    
    // Clear all authentication events
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
        console.log('[AuthEventStorage] Cleared authentication events storage')
      }
    } catch (sessionError) {
      console.warn('[AuthEventStorage] Failed to clear session storage:', sessionError)
    }
    
    // Clear broadcast events from localStorage
    try {
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('passkeyNudge_broadcast_')) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => {
          try {
            localStorage.removeItem(key)
          } catch (removeError) {
            console.debug('[AuthEventStorage] Failed to remove broadcast key:', key, removeError)
          }
        })
        console.log('[AuthEventStorage] Cleared broadcast events:', keysToRemove.length)
      }
    } catch (localStorageError) {
      console.warn('[AuthEventStorage] Failed to clear localStorage broadcasts:', localStorageError)
    }
    
    // Clear global cleanup timers
    try {
      if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
        (window as any).passkeyNudgeCleanupTimers.forEach((timer: NodeJS.Timeout) => {
          try {
            clearTimeout(timer)
          } catch (timerError) {
            console.debug('[AuthEventStorage] Failed to clear cleanup timer:', timerError)
          }
        })
        ;(window as any).passkeyNudgeCleanupTimers = []
        console.log('[AuthEventStorage] Cleared global cleanup timers')
      }
    } catch (timerCleanupError) {
      console.warn('[AuthEventStorage] Failed to clear global timers:', timerCleanupError)
    }
    
    // Clear any abandoned passkey nudge related data
    try {
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = []
        
        // Clear sessionStorage keys
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i)
            if (key && (key.startsWith('passkeyNudgeDismissed_') || key.startsWith('passkeyNudgeLastShown_'))) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(key => {
            try {
              sessionStorage.removeItem(key)
            } catch (removeError) {
              console.debug('[AuthEventStorage] Failed to remove session key:', key, removeError)
            }
          })
        } catch (sessionCleanupError) {
          console.warn('[AuthEventStorage] Failed to cleanup session storage keys:', sessionCleanupError)
        }
        
        // Clear localStorage keys
        try {
          const localKeysToRemove: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && (key.startsWith('passkeyRegistered_') || key.startsWith('passkeyPolicy_'))) {
              localKeysToRemove.push(key)
            }
          }
          localKeysToRemove.forEach(key => {
            try {
              localStorage.removeItem(key)
            } catch (removeError) {
              console.debug('[AuthEventStorage] Failed to remove local key:', key, removeError)
            }
          })
          console.log('[AuthEventStorage] Cleared passkey-related storage keys:', keysToRemove.length + localKeysToRemove.length)
        } catch (localCleanupError) {
          console.warn('[AuthEventStorage] Failed to cleanup localStorage keys:', localCleanupError)
        }
      }
    } catch (storageCleanupError) {
      console.warn('[AuthEventStorage] Failed to cleanup storage keys:', storageCleanupError)
    }
    
    console.log('[AuthEventStorage] Emergency cleanup completed')
  } catch (error) {
    console.error('[AuthEventStorage] Error during emergency cleanup:', error)
  }
}

/**
 * Validates storage health and performs cleanup if needed
 */
export function validateAndCleanupStorage(): boolean {
  try {
    // Test sessionStorage access
    try {
      if (typeof window !== 'undefined') {
        const testKey = 'passkeyNudge_test'
        sessionStorage.setItem(testKey, 'test')
        sessionStorage.removeItem(testKey)
      }
    } catch (sessionTestError) {
      console.warn('[AuthEventStorage] SessionStorage access test failed:', sessionTestError)
      return false
    }
    
    // Test localStorage access
    try {
      if (typeof window !== 'undefined') {
        const testKey = 'passkeyNudge_test'
        localStorage.setItem(testKey, 'test')
        localStorage.removeItem(testKey)
      }
    } catch (localTestError) {
      console.warn('[AuthEventStorage] LocalStorage access test failed:', localTestError)
      return false
    }
    
    // Validate stored events structure
    const events = getStoredAuthEvents()
    let hasCorruptedEvents = false
    
    events.forEach(event => {
      if (!event || typeof event !== 'object' || 
          !event.type || !event.identifier || !event.timestamp ||
          typeof event.timestamp !== 'number') {
        hasCorruptedEvents = true
      }
    })
    
    if (hasCorruptedEvents) {
      console.warn('[AuthEventStorage] Corrupted events detected, performing cleanup')
      cleanupExpiredEvents()
    }
    
    return true
  } catch (error) {
    console.error('[AuthEventStorage] Storage validation failed:', error)
    return false
  }
}