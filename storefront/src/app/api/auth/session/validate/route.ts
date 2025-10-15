import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getToken } from 'next-auth/jwt';
import { isJWTBlacklisted } from '@/lib/auth/jwtBlacklist';

/**
 * Validate if the current session is still valid
 * Returns false if:
 * - No session exists
 * - JWT is blacklisted (revoked during logout)
 * - Session is expired
 */
export async function GET(req: NextRequest) {
  try {
    // Get the JWT token
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    
    if (!token) {
      return NextResponse.json({ valid: false, reason: 'no_token' }, { status: 200 });
    }
    
    // Check if JWT is blacklisted
    const jti = (token as any)?.jti;
    if (jti) {
      const isBlacklisted = await isJWTBlacklisted(jti);
      if (isBlacklisted) {
        return NextResponse.json({ valid: false, reason: 'blacklisted' }, { status: 200 });
      }
    }
    
    // Get the session
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ valid: false, reason: 'no_session' }, { status: 200 });
    }
    
    // Session is valid
    return NextResponse.json({ valid: true, session }, { status: 200 });
  } catch (error) {
    console.error('[SESSION_VALIDATE] Error:', error);
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 200 });
  }
}
