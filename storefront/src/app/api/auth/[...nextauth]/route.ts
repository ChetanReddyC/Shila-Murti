import NextAuth, { NextAuthOptions } from 'next-auth'
import type { NextRequest } from 'next/server'
import { isJWTBlacklisted } from '@/lib/auth/jwtBlacklist'

// NOTE: Using placeholder provider implementations. In later tasks we'll wire real Passkey, OTP, and Magic providers.

// Minimal credentials-like providers to flip session flags according to the spec
import Credentials from 'next-auth/providers/credentials'

// Session lifetime: env-driven with a default of 1 hour
const parsedMaxAge = Number(process.env.SESSION_MAX_AGE_SEC)
const sessionMaxAge = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0
  ? Math.floor(parsedMaxAge)
  : 3600 // 1 hour

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: sessionMaxAge },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
      },
    },
  },
  providers: [
    // Passkey provider placeholder: verifies passkey externally and just marks comboRequired=false
    Credentials({
      id: 'passkey',
      name: 'Passkey',
      credentials: {
        assertion: { label: 'assertion', type: 'text' },
      },
      async authorize(credentials) {
        // In real impl, this handler is not used for passkeys; we keep it for API parity.
        if (credentials?.assertion) {
          return { id: 'user', comboRequired: false }
        }
        return null
      },
    }),

    // Session-binding provider: accepts an identifier and establishes a session (optionally with customerId)
    Credentials({
      id: 'session',
      name: 'Session',
      credentials: {
        identifier: { label: 'identifier', type: 'text' },
        customerId: { label: 'customerId', type: 'text' },
        hasPasskey: { label: 'hasPasskey', type: 'text' },
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier || '').toString()
        if (!identifier) {
          return null
        }
        const isEmail = identifier.includes('@')
        const user: any = { id: identifier }
        if (isEmail) user.email = identifier
        else user.phone = identifier
        // comboRequired resolved when we call this after MFA
        user.comboRequired = false
        if (credentials?.customerId) user.customerId = String(credentials.customerId)
        // Set hasPasskey flag if provided (explicitly handle both true and false)
        if (credentials?.hasPasskey !== undefined) {
          user.hasPasskey = String(credentials.hasPasskey) === 'true'
        }
        return user
      },
    }),

    // OTP provider placeholder: marks otpOK=true
    Credentials({
      id: 'otp',
      name: 'OTP',
      credentials: {
        phone: { label: 'phone', type: 'text' },
        code: { label: 'code', type: 'text' },
      },
      async authorize(credentials) {
        if (credentials?.phone && credentials?.code) {
          return { id: 'user', comboRequired: true }
        }
        return null
      },
    }),

    // Magic link provider placeholder: marks magicOK=true
    Credentials({
      id: 'magic',
      name: 'Magic',
      credentials: {
        email: { label: 'email', type: 'text' },
        token: { label: 'token', type: 'text' },
      },
      async authorize(credentials) {
        if (credentials?.email && credentials?.token) {
          return { id: 'user', comboRequired: true }
        }
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      
      // CRITICAL: Check if JWT is blacklisted (revoked during logout)
      const jti = (token as any)?.jti
      if (jti) {
        const isBlacklisted = await isJWTBlacklisted(jti)
        if (isBlacklisted) {
          console.log('[AUTH] JWT is blacklisted, terminating session:', jti)
          return {} as any // Return empty token to force logout
        }
      }
      
      // Rotate jti on sign-in
      if (user) {
        const newJti = (globalThis as any)?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
        ;(token as any).jti = newJti
      }

      // Factor flags
      if (account?.provider === 'otp') (token as any).otpOK = true
      if (account?.provider === 'magic') (token as any).magicOK = true
      // Add passkey flag when using passkey provider
      if (account?.provider === 'passkey') (token as any).hasPasskey = true

      // Session composition
      if (user && (user as any).comboRequired !== undefined) (token as any).comboRequired = (user as any).comboRequired
      if (user && (user as any)?.customerId) {
        (token as any).customerId = (user as any).customerId
        console.log('[AUTH][JWT] Setting customerId in token:', (user as any).customerId)
      }
      
      // CRITICAL: Set hasPasskey flag - explicitly handle both true and false values
      if (user && (user as any).hasPasskey !== undefined) {
        // User object has explicit hasPasskey value - use it (true OR false)
        (token as any).hasPasskey = (user as any).hasPasskey
        console.log('[AUTH] Setting hasPasskey from user object:', (user as any).hasPasskey)
      } else if (user && (user as any).comboRequired === false) {
        // Legacy: if comboRequired is false (passkey auth), set hasPasskey to true
        (token as any).hasPasskey = true
        console.log('[AUTH] Setting hasPasskey to true (legacy comboRequired=false)')
      } else if (user) {
        // User object present but no hasPasskey field - default to false
        (token as any).hasPasskey = false
        console.log('[AUTH] User present but no hasPasskey field, defaulting to false')
      }

      // Compute MFA completion
      // If comboRequired is false (passkey auth), then MFA is complete
      // If comboRequired is true, then MFA is complete only when both OTP and Magic are OK
      const currentComboRequired = (token as any).comboRequired ?? false
      ;(token as any).mfaComplete = currentComboRequired ? Boolean((token as any).otpOK && (token as any).magicOK) : true
      

      // PII minimization: mask identifier for display but keep original for passkey registration
      try {
        if ((user as any)?.email) {
          const email = String((user as any).email)
          const [local, domain] = email.split('@')
          const prefix = local.slice(0, Math.min(local.length, 2))
          const masked = `${prefix}${'*'.repeat(Math.max(0, local.length - prefix.length))}@${domain}`
          ;(token as any).maskedEmail = masked
          // Keep original email for passkey registration (stored securely in JWT)
          ;(token as any).originalEmail = email
        } else if ((user as any)?.phone) {
          const phone = String((user as any).phone)
          const last4 = phone.slice(-4)
          const masked = `${'*'.repeat(Math.max(0, phone.length - 4))}${last4}`
          ;(token as any).maskedPhone = masked
          // Keep original phone for passkey registration (stored securely in JWT)
          ;(token as any).originalPhone = phone
        }
        // Explicitly avoid keeping raw values in user object
        delete (token as any).email
        delete (token as any).phone
      } catch {}

      return token
    },
    async session({ session, token }) {
      console.log('[AUTH][SESSION] Building session from token:', {
        hasCustomerId: !!(token as any).customerId,
        customerId: (token as any).customerId,
        hasJti: !!(token as any).jti
      })
      
      Object.assign(session, {
        comboRequired: (token as any).comboRequired ?? false,
        otpOK: (token as any).otpOK ?? false,
        magicOK: (token as any).magicOK ?? false,
        mfaComplete: (token as any).mfaComplete,
        customerId: (token as any).customerId,
        hasPasskey: (token as any).hasPasskey ?? false,
      })
      // Overwrite user object with masked minimal PII for UX where needed
      const maskedEmail = (token as any).maskedEmail
      const maskedPhone = (token as any).maskedPhone
      const originalEmail = (token as any).originalEmail
      const originalPhone = (token as any).originalPhone
      ;(session as any).user = (session as any).user || {}
      if (maskedEmail) (session as any).user.email = maskedEmail
      if (maskedPhone) (session as any).user.phone = maskedPhone
      // Provide original identifiers for passkey registration (secure context only)
      if (originalEmail) (session as any).user.originalEmail = originalEmail
      if (originalPhone) (session as any).user.originalPhone = originalPhone
      // Ensure no raw email/phone leaked in main fields
      if (!maskedEmail) delete (session as any).user?.email
      if (!maskedPhone) delete (session as any).user?.phone
      
      
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }


