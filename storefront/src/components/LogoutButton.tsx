'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

const LogoutButton = () => {
  const router = useRouter()
  
  const handleLogout = useCallback(async () => {
    try {
      // Clear sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('customerId')
      }
      
      // Call custom logout API to clean up server-side data
      await fetch('/api/auth/logout', { method: 'POST' })
      
      // Terminate session and redirect to login
      await signOut({ callbackUrl: '/login', redirect: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Even if server cleanup fails, still redirect to login
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