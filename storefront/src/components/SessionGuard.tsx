'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface SessionGuardProps {
  children: React.ReactNode
  redirectTo?: string
}

/**
 * SessionGuard Component
 * Protects pages by checking NextAuth session status
 * Automatically redirects to login if session is invalid or expires
 */
export default function SessionGuard({ 
  children, 
  redirectTo = '/login' 
}: SessionGuardProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    // Don't do anything while loading
    if (status === 'loading') return

    // If unauthenticated, redirect to login
    if (status === 'unauthenticated') {
      console.log('[SessionGuard] No active session, redirecting to login')
      router.push(redirectTo)
      return
    }

    // Additional check: if session exists but has no customerId, redirect
    if (status === 'authenticated' && session && !(session as any)?.customerId) {
      console.log('[SessionGuard] Session missing customerId, redirecting to login')
      router.push(redirectTo)
      return
    }

  }, [status, session, router, redirectTo])

  // Show loading state while checking session
  if (status === 'loading') {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        fontSize: '16px',
        color: '#666'
      }}>
        Loading...
      </div>
    )
  }

  // Don't render children if not authenticated
  if (status === 'unauthenticated') {
    return null
  }

  // Additional check before rendering
  if (!(session as any)?.customerId) {
    return null
  }

  // Render protected content
  return <>{children}</>
}
