/**
 * Validate if the current session is still valid
 * This prevents authenticated state from persisting after logout
 */
export async function validateSessionActive(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/session/validate', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data?.valid === true;
  } catch (error) {
    console.error('[SESSION] Validation failed:', error);
    return false;
  }
}
