import NextAuth, { NextAuthOptions } from 'next-auth'
import type { NextRequest } from 'next/server'

// NOTE: Using placeholder provider implementations. In later tasks we'll wire real Passkey, OTP, and Magic providers.

// Minimal credentials-like providers to flip session flags according to the spec
import Credentials from 'next-auth/providers/credentials'

// Session lifetime: env-driven with a sane default of 10 minutes in development
const parsedMaxAge = Number(process.env.SESSION_MAX_AGE_SEC)
const sessionMaxAge = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0
  ? Math.floor(parsedMaxAge)
  : (process.env.NODE_ENV === 'development' ? 10 * 60 : 15 * 60)

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
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier || '').toString()
        if (!identifier) return null
        const isEmail = identifier.includes('@')
        const user: any = { id: identifier }
        if (isEmail) user.email = identifier
        else user.phone = identifier
        // comboRequired resolved when we call this after MFA
        user.comboRequired = false
        if (credentials?.customerId) user.customerId = String(credentials.customerId)
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
      // Rotate jti on sign-in
      if (user) {
        const jti = (globalThis as any)?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
        ;(token as any).jti = jti
      }

      // Factor flags
      if (account?.provider === 'otp') (token as any).otpOK = true
      if (account?.provider === 'magic') (token as any).magicOK = true

      // Session composition
      if (user && (user as any).comboRequired !== undefined) (token as any).comboRequired = (user as any).comboRequired
      if (user && (user as any)?.customerId) (token as any).customerId = (user as any).customerId

      // Compute MFA completion
      ;(token as any).mfaComplete = (token as any).comboRequired ? Boolean((token as any).otpOK && (token as any).magicOK) : true

      // PII minimization: mask identifier and avoid persisting raw phone/email
      try {
        if ((user as any)?.email) {
          const email = String((user as any).email)
          const [local, domain] = email.split('@')
          const prefix = local.slice(0, Math.min(local.length, 2))
          const masked = `${prefix}${'*'.repeat(Math.max(0, local.length - prefix.length))}@${domain}`
          ;(token as any).maskedEmail = masked
        } else if ((user as any)?.phone) {
          const phone = String((user as any).phone)
          const last4 = phone.slice(-4)
          const masked = `${'*'.repeat(Math.max(0, phone.length - 4))}${last4}`
          ;(token as any).maskedPhone = masked
        }
        // Explicitly avoid keeping raw values
        delete (token as any).email
        delete (token as any).phone
      } catch {}

      return token
    },
    async session({ session, token }) {
      Object.assign(session, {
        comboRequired: (token as any).comboRequired ?? false,
        otpOK: (token as any).otpOK ?? false,
        magicOK: (token as any).magicOK ?? false,
        mfaComplete: (token as any).mfaComplete,
        customerId: (token as any).customerId,
      })
      // Overwrite user object with masked minimal PII for UX where needed
      const maskedEmail = (token as any).maskedEmail
      const maskedPhone = (token as any).maskedPhone
      ;(session as any).user = (session as any).user || {}
      if (maskedEmail) (session as any).user.email = maskedEmail
      if (maskedPhone) (session as any).user.phone = maskedPhone
      // Ensure no raw email/phone leaked
      if (!maskedEmail) delete (session as any).user?.email
      if (!maskedPhone) delete (session as any).user?.phone
      
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }


