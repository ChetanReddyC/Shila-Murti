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
    } catch (storageError) {
      // Handle storage quota exceeded or access denied
      if (storageError instanceof DOMException) {
        if (storageError.code === 22 || storageError.name === 'QuotaExceededError') {
          // Try to clean up old events and retry
          cleanupExpiredEvents()
          try {
            sessionStorage.setItem(AUTH_EVENTS_KEY, JSON.stringify(updatedEvents))
          } catch (retryError) {
          }
        } else {
        }
      } else {
        throw storageError
      }
    }
  } catch (error) {
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
      return []
    }
    
    if (!stored) return []
    
    let events: StoredAuthEvent[]
    try {
      events = JSON.parse(stored)
    } catch (parseError) {
      // Clear corrupted data
      try {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
      } catch (clearError) {
      }
      return []
    }
    
    // Validate events array structure
    if (!Array.isArray(events)) {
      try {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
      } catch (clearError) {
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
      }
    }
    
    return validEvents
  } catch (error) {
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
      } catch (storageError) {
        // Continue without updating storage - the event will remain unconsumed
        // This is acceptable as it's better to show the dialog again than to miss it
      }
    }
  } catch (error) {
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
      } catch (storageError) {
        
        // If we can't update storage, try to clear it entirely as a fallback
        if (storageError instanceof DOMException && storageError.code === 22) {
          try {
            sessionStorage.removeItem(AUTH_EVENTS_KEY)
          } catch (clearError) {
          }
        }
      }
    }
  } catch (error) {
  }
}

/**
 * Clears all stored authentication events
 */
export function clearAllAuthEvents(): void {
  try {
    if (typeof window === 'undefined') return
    
    sessionStorage.removeItem(AUTH_EVENTS_KEY)
  } catch (error) {
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
    } catch (storageError) {
      // Continue without broadcasting - this is not critical for core functionality
      return
    }
    
    // Clean up broadcast data after a short delay
    const cleanupTimer = setTimeout(() => {
      try {
        localStorage.removeItem(broadcastKey)
      } catch (cleanupError) {
        // Ignore cleanup errors - the data will eventually be overwritten
      }
    }, 1000)
    
    // Store cleanup timer reference for potential cancellation
    if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
      (window as any).passkeyNudgeCleanupTimers.push(cleanupTimer)
    } else if (typeof window !== 'undefined') {
      (window as any).passkeyNudgeCleanupTimers = [cleanupTimer]
    }
    
  } catch (error) {
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
    
    // Clear all authentication events
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(AUTH_EVENTS_KEY)
      }
    } catch (sessionError) {
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
          }
        })
      }
    } catch (localStorageError) {
    }
    
    // Clear global cleanup timers
    try {
      if (typeof window !== 'undefined' && (window as any).passkeyNudgeCleanupTimers) {
        (window as any).passkeyNudgeCleanupTimers.forEach((timer: NodeJS.Timeout) => {
          try {
            clearTimeout(timer)
          } catch (timerError) {
          }
        })
        ;(window as any).passkeyNudgeCleanupTimers = []
      }
    } catch (timerCleanupError) {
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
            }
          })
        } catch (sessionCleanupError) {
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
            }
          })
        } catch (localCleanupError) {
        }
      }
    } catch (storageCleanupError) {
    }
    
  } catch (error) {
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
      cleanupExpiredEvents()
    }
    
    return true
  } catch (error) {
    return false
  }
}