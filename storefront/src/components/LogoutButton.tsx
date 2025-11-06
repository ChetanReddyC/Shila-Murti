'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { clearCustomerId } from '../utils/hybridCustomerStorage'
import LogoutConfirmModal from './LogoutConfirmModal'
import LoadingScreen from './LoadingScreen'

const LogoutButton = () => {
  const router = useRouter()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    

    try {
      // Clear storage immediately for instant UX
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('customerId')
        sessionStorage.clear()
        localStorage.removeItem('medusa_cart_id')
        localStorage.removeItem('checkout_form')
        localStorage.removeItem('checkout_identity')
        localStorage.removeItem('magic_verification_success')
      }
      
      // Fire off cleanup in background (non-blocking)
      // Use sendBeacon for reliable delivery during page unload
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/auth/logout', JSON.stringify({}))
      } else {
        fetch('/api/auth/logout', { method: 'POST', keepalive: true }).catch(() => {})
      }
      clearCustomerId().catch(() => {})
      
      // Sign out without waiting for redirect
      await signOut({ redirect: false })
      
      // Redirect immediately - loading screen will show during actual logout process
      window.location.href = '/login'
    } catch (error) {
      console.error('[LOGOUT] Error during logout:', error)
      setIsLoggingOut(false)
      window.location.href = '/login'
    }
  }, [router])
  
  return (
    <>
      <LoadingScreen 
        show={isLoggingOut}
        duration={1200}
        imagesFolder="/loading-animations"
        shaderEffect="smoke"
      />
      <LogoutConfirmModal 
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleLogout}
      />
      <button 
        onClick={() => setShowConfirmModal(true)}
      style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none', 
        color: '#ffffff', 
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: '600',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
        letterSpacing: '0.02em'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(102, 126, 234, 0.3)'
      }}
    >
      Logout
    </button>
    </>
  )
}

export default LogoutButton