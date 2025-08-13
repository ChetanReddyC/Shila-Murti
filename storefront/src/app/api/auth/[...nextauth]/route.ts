import NextAuth, { NextAuthOptions } from 'next-auth'
import type { NextRequest } from 'next/server'

// NOTE: Using placeholder provider implementations. In later tasks we'll wire real Passkey, OTP, and Magic providers.

// Minimal credentials-like providers to flip session flags according to the spec
import Credentials from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 15 * 60 },
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
      if (account?.provider === 'otp') token.otpOK = true
      if (account?.provider === 'magic') token.magicOK = true
      if (user?.comboRequired !== undefined) token.comboRequired = (user as any).comboRequired
      if ((user as any)?.customerId) token.customerId = (user as any).customerId
      token.mfaComplete = token.comboRequired ? Boolean(token.otpOK && token.magicOK) : true
      return token
    },
    async session({ session, token }) {
      Object.assign(session, {
        comboRequired: token.comboRequired ?? false,
        otpOK: token.otpOK ?? false,
        magicOK: token.magicOK ?? false,
        mfaComplete: token.mfaComplete,
        customerId: (token as any).customerId,
      })
      return session
    },
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }


