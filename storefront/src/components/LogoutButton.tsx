'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { clearCustomerId } from '../utils/hybridCustomerStorage'

const LogoutButton = () => {
  const router = useRouter()
  
  const handleLogout = useCallback(async () => {
    try {
      // CRITICAL: Blacklist JWT FIRST before signOut
      // This ensures the JWT is revoked even if signOut fails
      const logoutRes = await fetch('/api/auth/logout', { method: 'POST' })
      
      if (!logoutRes.ok) {
        console.error('[LOGOUT] Failed to blacklist JWT, but proceeding with signOut')
      }
      
      // Clear sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('customerId')
        sessionStorage.clear() // Clear all session data
      }
      
      // Clear hybrid customer storage first
      await clearCustomerId()
      
      // Clear localStorage cart and checkout data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('medusa_cart_id')
        localStorage.removeItem('checkout_form')
        localStorage.removeItem('checkout_identity')
        localStorage.removeItem('magic_verification_success')
      }
      
      // Terminate session and redirect to login
      // This clears the session cookie
      await signOut({ callbackUrl: '/login', redirect: true })
    } catch (error) {
      console.error('[LOGOUT] Error during logout:', error)
      // Force redirect even if logout fails
      router.push('/login')
    }
  }, [router])
  
  return (
    <button 
      onClick={handleLogout}
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
  )
}

export default LogoutButton