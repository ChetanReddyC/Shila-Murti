'use client'

import { useCallback } from 'react'

type ArrayBufferLike = ArrayBuffer | Uint8Array | ArrayLike<number>

function toBase64Url(input: ArrayBufferLike): string {
  let buffer: ArrayBuffer | SharedArrayBuffer
  if (input instanceof ArrayBuffer) {
    buffer = input
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer as ArrayBuffer
  } else if (Array.isArray(input)) {
    buffer = new Uint8Array(input).buffer as ArrayBuffer
  } else {
    // Fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyInput = input as any
    if (anyInput?.buffer) {
      buffer = anyInput.buffer as ArrayBuffer
    } else {
      throw new Error('Unsupported buffer type')
    }
  }
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  // As a client hook, prefer browser btoa for base64
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export interface PublicKeyRequestOptionsJSON {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: Array<{
    id: string
    type: PublicKeyCredentialType
    transports?: AuthenticatorTransport[]
  }>
  userVerification?: UserVerificationRequirement
}

export interface AuthenticationResultJSON {
  id: string
  rawId: string
  type: PublicKeyCredentialType
  response: {
    authenticatorData: string
    clientDataJSON: string
    signature: string
    userHandle: string | null
  }
}

export const usePasskey = () => {
  // Check if conditional mediation is available
  const isConditionalMediationAvailable = useCallback(async (): Promise<boolean> => {
    try {
      if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
        return false
      }
      
      // Check if the method exists and call it
      if (PublicKeyCredential.isConditionalMediationAvailable) {
        return await PublicKeyCredential.isConditionalMediationAvailable()
      }
      
      return false
    } catch (err) {
      console.warn('[usePasskey] Conditional mediation check failed:', err)
      return false
    }
  }, [])

  const authenticate = useCallback(async (
    options: PublicKeyRequestOptionsJSON,
  ): Promise<{ data?: AuthenticationResultJSON; error?: unknown }> => {
    try {
      if (typeof window === 'undefined' || !('credentials' in navigator)) {
        throw new Error('WebAuthn not available in this environment')
      }

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
        timeout: options.timeout,
        rpId: options.rpId,
        allowCredentials: options.allowCredentials?.map((cred) => ({
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
          type: cred.type,
          transports: cred.transports,
        })),
        userVerification: options.userVerification,
      }

      const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential
      const authData = assertion.response as AuthenticatorAssertionResponse
      const result: AuthenticationResultJSON = {
        id: assertion.id,
        rawId: toBase64Url(assertion.rawId),
        type: assertion.type as PublicKeyCredentialType,
        response: {
          authenticatorData: toBase64Url(authData.authenticatorData),
          clientDataJSON: toBase64Url(authData.clientDataJSON),
          signature: toBase64Url(authData.signature),
          userHandle: authData.userHandle ? toBase64Url(authData.userHandle) : null,
        },
      }
      return { data: result }
    } catch (err) {
      return { error: err }
    }
  }, [])

  // Conditional UI authentication - silently shows passkeys in autofill if available
  const authenticateConditional = useCallback(async (
    options: PublicKeyRequestOptionsJSON,
  ): Promise<{ data?: AuthenticationResultJSON; error?: unknown }> => {
    try {
      if (typeof window === 'undefined' || !('credentials' in navigator)) {
        throw new Error('WebAuthn not available in this environment')
      }

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
        timeout: options.timeout,
        rpId: options.rpId,
        // For conditional UI, don't specify allowCredentials - let browser show all available
        allowCredentials: undefined,
        userVerification: options.userVerification || 'preferred',
      }

      // KEY: Use mediation: 'conditional' for non-intrusive autofill behavior
      const assertion = (await navigator.credentials.get({ 
        publicKey,
        mediation: 'conditional' 
      })) as PublicKeyCredential
      
      const authData = assertion.response as AuthenticatorAssertionResponse
      const result: AuthenticationResultJSON = {
        id: assertion.id,
        rawId: toBase64Url(assertion.rawId),
        type: assertion.type as PublicKeyCredentialType,
        response: {
          authenticatorData: toBase64Url(authData.authenticatorData),
          clientDataJSON: toBase64Url(authData.clientDataJSON),
          signature: toBase64Url(authData.signature),
          userHandle: authData.userHandle ? toBase64Url(authData.userHandle) : null,
        },
      }
      return { data: result }
    } catch (err) {
      return { error: err }
    }
  }, [])

  return { authenticate, authenticateConditional, isConditionalMediationAvailable }
}


