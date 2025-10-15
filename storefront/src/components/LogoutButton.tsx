'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

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
        background: 'none', 
        border: 'none', 
        color: '#141414', 
        cursor: 'pointer',
        fontSize: '14px',
        padding: '8px 12px',
        borderRadius: '4px',
        transition: 'background-color 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      Logout
    </button>
  )
}

export default LogoutButton