/**
 * Passkey Debug Helper
 * 
 * Utility functions to help debug passkey authentication issues
 * Use these in browser console to inspect and fix passkey state
 */

/**
 * Check current passkey state in storage
 */
export function checkPasskeyState() {
  if (typeof window === 'undefined') {
    console.log('❌ Not in browser environment')
    return
  }

  console.log('🔍 Checking passkey state...\n')

  // Check sessionStorage
  console.log('📦 SessionStorage:')
  console.log('  hasPasskey:', sessionStorage.getItem('hasPasskey'))
  console.log('  lastPasskeyCredential:', sessionStorage.getItem('lastPasskeyCredential'))
  console.log('  currentPasskeyCredential:', sessionStorage.getItem('currentPasskeyCredential'))
  console.log('  customerId:', sessionStorage.getItem('customerId'))
  console.log('')

  // Check localStorage for passkey-related keys
  console.log('💾 LocalStorage (passkey-related keys):')
  const passkeyKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (
      key.startsWith('passkeyPolicy_') ||
      key.startsWith('passkeyRegistered_') ||
      key.startsWith('passkeyNudgeDismissed_') ||
      key.startsWith('passkeyNudgeLastShown_')
    )) {
      passkeyKeys.push(key)
      const value = localStorage.getItem(key)
      console.log(`  ${key}:`, value)
    }
  }
  
  if (passkeyKeys.length === 0) {
    console.log('  (no passkey keys found)')
  }
  console.log('')

  // Summary
  console.log('📊 Summary:')
  console.log(`  Passkey cache entries: ${passkeyKeys.length}`)
  console.log(`  Session indicates passkey: ${sessionStorage.getItem('hasPasskey') === 'true' ? 'YES' : 'NO'}`)
  console.log('')

  // Recommendations
  const hasPasskey = sessionStorage.getItem('hasPasskey')
  const hasCacheEntries = passkeyKeys.length > 0

  if (hasPasskey === 'false' && hasCacheEntries) {
    console.log('⚠️  WARNING: Session indicates no passkey but cache exists!')
    console.log('   This might prevent the passkey nudge from showing.')
    console.log('   Run clearAllPasskeyCache() to fix this.')
  } else if (hasPasskey === 'true' && !hasCacheEntries) {
    console.log('⚠️  WARNING: Session indicates passkey but no cache!')
    console.log('   This is unusual but might be OK.')
  } else if (!hasPasskey && !hasCacheEntries) {
    console.log('✅ State looks clean - passkey nudge should show up after OTP login')
  } else if (hasPasskey === 'true' && hasCacheEntries) {
    console.log('✅ State looks normal - you have a passkey registered')
  }
}

/**
 * Clear all passkey-related cache
 * This is useful when the passkey nudge isn't showing up
 */
export function clearAllPasskeyCache() {
  if (typeof window === 'undefined') {
    console.log('❌ Not in browser environment')
    return
  }

  console.log('🧹 Clearing all passkey cache...\n')

  // Clear sessionStorage
  console.log('📦 Clearing sessionStorage...')
  sessionStorage.removeItem('hasPasskey')
  sessionStorage.removeItem('lastPasskeyCredential')
  sessionStorage.removeItem('currentPasskeyCredential')
  console.log('  ✅ SessionStorage cleared')
  console.log('')

  // Clear localStorage
  console.log('💾 Clearing localStorage (passkey keys)...')
  const keysToRemove: string[] = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (
      key.startsWith('passkeyPolicy_') ||
      key.startsWith('passkeyRegistered_') ||
      key.startsWith('passkeyNudgeDismissed_') ||
      key.startsWith('passkeyNudgeLastShown_')
    )) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach(key => {
    localStorage.removeItem(key)
    console.log(`  ✅ Removed: ${key}`)
  })

  console.log('')
  console.log(`✅ Cleared ${keysToRemove.length} passkey cache entries`)
  console.log('🎉 Passkey nudge should now show up after your next OTP login!')
}

/**
 * Force passkey nudge to appear (useful for testing)
 * This sets the state as if you just logged in without a passkey
 */
export function forcePasskeyNudgeToShow() {
  if (typeof window === 'undefined') {
    console.log('❌ Not in browser environment')
    return
  }

  console.log('🔧 Forcing passkey nudge to show...\n')

  // Clear all cache first
  clearAllPasskeyCache()

  // Set session to indicate no passkey
  sessionStorage.setItem('hasPasskey', 'false')

  console.log('✅ Done! Refresh the page or navigate to /account to see the nudge.')
}

/**
 * Simulate passkey registration (for testing)
 */
export function simulatePasskeyRegistration(identifier: string = 'test@example.com') {
  if (typeof window === 'undefined') {
    console.log('❌ Not in browser environment')
    return
  }

  console.log('🔧 Simulating passkey registration...\n')

  // Set session to indicate passkey
  sessionStorage.setItem('hasPasskey', 'true')
  sessionStorage.setItem('lastPasskeyCredential', 'test-credential-id')

  // Set cache
  const policyKey = `passkeyPolicy_${identifier}`
  const registeredKey = `passkeyRegistered_${identifier}`

  const policyData = {
    hasPasskey: true,
    expiresAt: Date.now() + (60 * 60 * 1000)
  }

  const registeredData = {
    timestamp: Date.now()
  }

  localStorage.setItem(policyKey, JSON.stringify(policyData))
  localStorage.setItem(registeredKey, JSON.stringify(registeredData))

  console.log(`✅ Simulated passkey registration for: ${identifier}`)
  console.log('📦 Cache entries created')
}

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  (window as any).passkeyDebug = {
    check: checkPasskeyState,
    clear: clearAllPasskeyCache,
    forceShow: forcePasskeyNudgeToShow,
    simulate: simulatePasskeyRegistration,
  }

  console.log('🔐 Passkey Debug Helper loaded!')
  console.log('📝 Available commands:')
  console.log('  window.passkeyDebug.check()      - Check current passkey state')
  console.log('  window.passkeyDebug.clear()      - Clear all passkey cache')
  console.log('  window.passkeyDebug.forceShow()  - Force nudge to appear')
  console.log('  window.passkeyDebug.simulate()   - Simulate passkey registration')
}
