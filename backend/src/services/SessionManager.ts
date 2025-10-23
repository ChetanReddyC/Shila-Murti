/**
 * Enhanced Session Manager Service
 * 
 * Addresses Security Audit Issue #9: Session Management Weaknesses
 * 
 * Features:
 * - Cryptographically secure session tokens (crypto.randomBytes)
 * - Session expiration with configurable TTL
 * - Idle timeout detection (auto-expire inactive sessions)
 * - Automatic session rotation for long-lived sessions
 * - Device fingerprinting with validation
 * - IP address tracking and suspicious location detection
 * - Security logging for audit trails
 */

import crypto from 'crypto'
import type { MedusaRequest } from '@medusajs/framework/http'
import { kvGet, kvSet, kvDel } from '../utils/kv'

// Configuration constants
const SESSION_TTL = 86400 * 7 // 7 days in seconds
const IDLE_TIMEOUT = 60 * 60 * 1000 // 1 hour in milliseconds
const ROTATION_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
const SESSION_KEY_PREFIX = 'cart:session:'
const ROTATION_FLAG_PREFIX = 'session:needs_rotation:'

export interface CartSession {
  sessionId: string
  cartId: string
  userId?: string
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
  ipAddress: string
  userAgent: string
  fingerprint: string
  rotationCount: number
}

export interface SessionValidationResult {
  valid: boolean
  session?: CartSession
  reason?: 'not_found' | 'expired' | 'idle_timeout' | 'fingerprint_mismatch' | 'rotation_required'
  requiresRotation?: boolean
}

export class SessionManager {
  /**
   * Generate a cryptographically secure session token
   */
  private static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Generate device fingerprint from request headers
   * Uses SHA-256 hash of multiple browser signals
   */
  private static generateFingerprint(req: MedusaRequest): string {
    const userAgent = req.headers['user-agent'] || ''
    const acceptLanguage = req.headers['accept-language'] || ''
    const acceptEncoding = req.headers['accept-encoding'] || ''
    const dnt = req.headers['dnt'] || ''
    
    // Combine multiple signals for better uniqueness
    const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${dnt}`
    
    return crypto
      .createHash('sha256')
      .update(fingerprintData)
      .digest('hex')
      .substring(0, 24)
  }

  /**
   * Extract client IP address from request
   * Handles proxies and load balancers
   */
  private static getClientIp(req: MedusaRequest): string {
    // Check for forwarded IP from proxies
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim()
    }
    
    const realIp = req.headers['x-real-ip']
    if (typeof realIp === 'string') {
      return realIp
    }
    
    // Fallback to direct connection IP
    return req.socket?.remoteAddress || 'unknown'
  }

  /**
   * Create a new session
   */
  static async createSession(
    req: MedusaRequest,
    cartId: string,
    userId?: string
  ): Promise<{ session: CartSession; token: string }> {
    const sessionToken = this.generateSessionToken()
    const now = Date.now()
    
    const session: CartSession = {
      sessionId: sessionToken,
      cartId,
      userId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + (SESSION_TTL * 1000),
      ipAddress: this.getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      fingerprint: this.generateFingerprint(req),
      rotationCount: 0
    }
    
    // Store in KV with TTL
    await kvSet(
      `${SESSION_KEY_PREFIX}${sessionToken}`,
      session,
      SESSION_TTL
    )
    
    console.log('[SESSION_MANAGER] Session created', {
      sessionId: sessionToken.substring(0, 12) + '...',
      cartId,
      userId: userId ? userId.substring(0, 8) + '...' : 'guest',
      ipAddress: session.ipAddress,
      expiresAt: new Date(session.expiresAt).toISOString()
    })
    
    return { session, token: sessionToken }
  }

  /**
   * Validate an existing session
   * Checks expiration, idle timeout, and fingerprint
   */
  static async validateSession(
    req: MedusaRequest,
    sessionToken: string
  ): Promise<SessionValidationResult> {
    // Retrieve session from KV
    const session = await kvGet<CartSession>(`${SESSION_KEY_PREFIX}${sessionToken}`)
    
    if (!session) {
      return { 
        valid: false, 
        reason: 'not_found'
      }
    }
    
    const now = Date.now()
    
    // Check if session has expired
    if (now > session.expiresAt) {
      await this.deleteSession(sessionToken)
      return { 
        valid: false, 
        reason: 'expired'
      }
    }
    
    // Check idle timeout (1 hour of inactivity)
    if (now - session.lastAccessedAt > IDLE_TIMEOUT) {
      await this.deleteSession(sessionToken)
      
      console.warn('[SESSION_MANAGER] Session expired due to inactivity', {
        sessionId: sessionToken.substring(0, 12) + '...',
        lastAccessed: new Date(session.lastAccessedAt).toISOString(),
        idleMinutes: Math.round((now - session.lastAccessedAt) / 60000)
      })
      
      return { 
        valid: false, 
        reason: 'idle_timeout'
      }
    }
    
    // Validate device fingerprint (detect session hijacking)
    const currentFingerprint = this.generateFingerprint(req)
    if (currentFingerprint !== session.fingerprint) {
      // Log suspicious activity but don't immediately invalidate
      // (fingerprint can change legitimately, e.g., browser updates)
      console.warn('[SESSION_MANAGER] Fingerprint mismatch detected', {
        sessionId: sessionToken.substring(0, 12) + '...',
        expectedFingerprint: session.fingerprint,
        actualFingerprint: currentFingerprint,
        ipAddress: this.getClientIp(req),
        sessionIpAddress: session.ipAddress
      })
      
      // Strict mode: invalidate session on fingerprint mismatch
      // Uncomment if you want stricter security:
      // return { valid: false, reason: 'fingerprint_mismatch' }
    }
    
    // Check if session needs rotation (6 hours old)
    const sessionAge = now - session.createdAt
    if (sessionAge > ROTATION_INTERVAL) {
      return {
        valid: true,
        session,
        requiresRotation: true,
        reason: 'rotation_required'
      }
    }
    
    // Update last accessed time
    session.lastAccessedAt = now
    await kvSet(
      `${SESSION_KEY_PREFIX}${sessionToken}`,
      session,
      SESSION_TTL
    )
    
    return { 
      valid: true, 
      session 
    }
  }

  /**
   * Rotate session (create new token, preserve data)
   * Used for long-lived sessions to minimize hijacking window
   */
  static async rotateSession(
    req: MedusaRequest,
    oldSessionToken: string
  ): Promise<{ session: CartSession; token: string } | null> {
    const validation = await this.validateSession(req, oldSessionToken)
    
    if (!validation.valid || !validation.session) {
      return null
    }
    
    // Create new session with same data
    const newSessionToken = this.generateSessionToken()
    const now = Date.now()
    
    const newSession: CartSession = {
      ...validation.session,
      sessionId: newSessionToken,
      lastAccessedAt: now,
      expiresAt: now + (SESSION_TTL * 1000),
      fingerprint: this.generateFingerprint(req),
      rotationCount: validation.session.rotationCount + 1
    }
    
    // Store new session
    await kvSet(
      `${SESSION_KEY_PREFIX}${newSessionToken}`,
      newSession,
      SESSION_TTL
    )
    
    // Delete old session
    await this.deleteSession(oldSessionToken)
    
    console.log('[SESSION_MANAGER] Session rotated', {
      oldSessionId: oldSessionToken.substring(0, 12) + '...',
      newSessionId: newSessionToken.substring(0, 12) + '...',
      rotationCount: newSession.rotationCount,
      cartId: newSession.cartId
    })
    
    return { session: newSession, token: newSessionToken }
  }

  /**
   * Update session with new cart ID or user ID
   */
  static async updateSession(
    sessionToken: string,
    updates: Partial<Pick<CartSession, 'cartId' | 'userId'>>
  ): Promise<boolean> {
    const session = await kvGet<CartSession>(`${SESSION_KEY_PREFIX}${sessionToken}`)
    
    if (!session) {
      return false
    }
    
    const updatedSession = {
      ...session,
      ...updates,
      lastAccessedAt: Date.now()
    }
    
    await kvSet(
      `${SESSION_KEY_PREFIX}${sessionToken}`,
      updatedSession,
      SESSION_TTL
    )
    
    return true
  }

  /**
   * Delete a session
   */
  static async deleteSession(sessionToken: string): Promise<void> {
    await kvDel(`${SESSION_KEY_PREFIX}${sessionToken}`)
    await kvDel(`${ROTATION_FLAG_PREFIX}${sessionToken}`)
  }

  /**
   * Detect suspicious location changes
   * Simplified version - in production, use a geolocation service
   */
  static async detectSuspiciousLocation(
    session: CartSession,
    currentIp: string
  ): Promise<{ suspicious: boolean; reason?: string }> {
    // If same IP, no issue
    if (session.ipAddress === currentIp) {
      return { suspicious: false }
    }
    
    // If IP changed within a short time (< 5 minutes), potentially suspicious
    const timeSinceCreation = Date.now() - session.createdAt
    if (timeSinceCreation < 5 * 60 * 1000) {
      console.warn('[SESSION_MANAGER] Rapid IP change detected', {
        sessionId: session.sessionId.substring(0, 12) + '...',
        originalIp: session.ipAddress,
        currentIp,
        minutesElapsed: Math.round(timeSinceCreation / 60000)
      })
      
      return {
        suspicious: true,
        reason: 'rapid_ip_change'
      }
    }
    
    // In production, you would:
    // 1. Get geolocation for both IPs
    // 2. Calculate distance
    // 3. Check if impossible travel (e.g., 1000km in 10 minutes)
    // 4. Flag different countries
    
    return { suspicious: false }
  }

  /**
   * Cleanup expired sessions (cron job)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    // Note: This is a placeholder
    // In production, implement a proper cleanup mechanism
    // KV store with TTL handles this automatically
    console.log('[SESSION_MANAGER] Cleanup executed (TTL-based auto-expiry active)')
    return 0
  }
}
