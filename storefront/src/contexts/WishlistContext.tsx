'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'

interface WishlistContextType {
  wishlistIds: Set<string>
  pendingIds: Set<string>
  loading: boolean
  isAuthenticated: boolean
  toggleWishlist: (productId: string) => Promise<boolean>
  isInWishlist: (productId: string) => boolean
  removeFromWishlist: (productId: string) => Promise<void>
  wishlistCount: number
}

const WishlistContext = createContext<WishlistContextType>({
  wishlistIds: new Set(),
  pendingIds: new Set(),
  loading: false,
  isAuthenticated: false,
  toggleWishlist: async () => false,
  isInWishlist: () => false,
  removeFromWishlist: async () => {},
  wishlistCount: 0,
})

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)
  const wishlistRef = useRef<Set<string>>(wishlistIds)
  const pendingRef = useRef<Set<string>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const isAuthenticated = status === 'authenticated'

  // Keep ref in sync to avoid stale closures
  wishlistRef.current = wishlistIds

  useEffect(() => {
    if (!isAuthenticated) {
      setWishlistIds(new Set())
      fetchedRef.current = false
      return
    }
    if (fetchedRef.current) return
    fetchedRef.current = true

    const controller = new AbortController()
    let active = true
    setLoading(true)
    fetch('/api/account/wishlist', { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (active && data?.items) {
          setWishlistIds(new Set(data.items.map((i: { product_id: string }) => i.product_id)))
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [isAuthenticated])

  const toggleWishlist = useCallback(async (productId: string): Promise<boolean> => {
    if (!isAuthenticated) return false
    if (pendingRef.current.has(productId)) return false

    const wasIn = wishlistRef.current.has(productId)
    pendingRef.current.add(productId)
    setPendingIds(new Set(pendingRef.current))

    setWishlistIds(prev => {
      const next = new Set(prev)
      wasIn ? next.delete(productId) : next.add(productId)
      return next
    })

    try {
      const res = await fetch('/api/account/wishlist', {
        method: wasIn ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      })
      if (!res.ok) {
        if (res.status === 401) { window.location.href = '/login'; return false }
        console.error('[Wishlist] API error:', res.status, await res.text().catch(() => ''))
        throw new Error(`${res.status}`)
      }
      return true
    } catch (err) {
      console.error('[Wishlist] toggle failed:', err)
      setWishlistIds(prev => {
        const next = new Set(prev)
        wasIn ? next.add(productId) : next.delete(productId)
        return next
      })
      return false
    } finally {
      pendingRef.current.delete(productId)
      setPendingIds(new Set(pendingRef.current))
    }
  }, [isAuthenticated])

  const isInWishlist = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds])

  const removeFromWishlist = useCallback(async (productId: string) => {
    if (wishlistRef.current.has(productId)) await toggleWishlist(productId)
  }, [toggleWishlist])

  return (
    <WishlistContext.Provider value={{
      wishlistIds,
      pendingIds,
      loading,
      isAuthenticated,
      toggleWishlist,
      isInWishlist,
      removeFromWishlist,
      wishlistCount: wishlistIds.size,
    }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  return useContext(WishlistContext)
}
