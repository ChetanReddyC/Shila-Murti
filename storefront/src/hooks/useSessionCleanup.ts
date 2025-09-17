'use client'

import { useCallback } from 'react'

const useSessionCleanup = () => {
  const cleanupSession = useCallback(() => {
    // Clear all session-related data
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('customerId')
    }
    // Any other cleanup logic can be added here
  }, [])
  
  return { cleanupSession }
}

export default useSessionCleanup