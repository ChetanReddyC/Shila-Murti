import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { extractBearerToken, verifyAccessToken } from "../utils/jwt"
import { validateCartOwnership } from "./middlewares/cartOwnership"

// Explicit CORS + diagnostics for Store routes. This guarantees that
// custom headers like `x-publishable-api-key` are allowed and that
// all OPTIONS preflights are answered consistently, which helps avoid
// browser "No 'Access-Control-Allow-Origin' header" errors when a
// guard rejects the request early.

const allowedOrigins = (process.env.STORE_CORS || "http://localhost:3000,http://127.0.0.1:3000").split(",")

const allowedHeaders = (
  process.env.STORE_ALLOWED_HEADERS ||
  "Content-Type, Accept, Authorization, X-Requested-With, x-publishable-api-key, x-internal-call"
)

async function corsAndDiagnostics(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const origin = req.headers.origin as string | undefined
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
  }
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  )
  res.setHeader("Access-Control-Allow-Headers", allowedHeaders + ",Cookie")

  // Basic diagnostics for tricky requests (visible in backend logs)
  if (req.path?.includes("/store/carts/") && req.path?.includes("/payment-sessions")) {
    // Log enough to trace, but avoid dumping PII
    console.log("[CORS][Store]", {
      method: req.method,
      path: req.path,
      origin,
      requestHeaders: req.headers["access-control-request-headers"],
      hasPublishableKey: Boolean(req.headers["x-publishable-api-key"]),
    })
  }

  // Short-circuit preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  next()
}

async function authGuard(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    // Allow internal server-to-server calls (e.g. payment capture from storefront server)
    const internalSecret = req.headers['x-internal-call'] as string | undefined
    if (internalSecret && process.env.INTERNAL_API_SECRET && internalSecret === process.env.INTERNAL_API_SECRET) {
      return next()
    }

    const token = extractBearerToken(req.headers.authorization as string | undefined)
    if (!token) {
      return res.status(401).json({ message: "Missing bearer token" })
    }

    const claims = await verifyAccessToken(token, req.scope)

      // Attach identity to request context for downstream usage
      ; (req as any).customer_id = claims.sub
      ; (req as any).auth = { customer_id: claims.sub, claims }
    try {
      console.log('[authGuard] token valid', { sub: claims.sub, mfaComplete: claims.mfaComplete, purpose: claims.purpose })
    } catch { }

    if (claims.mfaComplete === false) {
      return res.status(403).json({ message: "MFA required" })
    }

    return next()
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}



// M9: Simple in-memory rate limiter for payment-critical endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 10 // max requests per window per IP

function rateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown"
  const key = `${ip}:${req.path}`
  const now = Date.now()

  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return next()
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)))
    return res.status(429).json({ message: "Too many requests" })
  }

  return next()
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of rateLimitStore) {
    if (now > val.resetAt) rateLimitStore.delete(key)
  }
}, 300_000)

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/*",
      middlewares: [corsAndDiagnostics],
    },
    {
      // Enforce elevated session (mfaComplete=true) on customer profile endpoints
      matcher: "/store/customers*",
      middlewares: [authGuard],
    },
    {
      // Enforce elevated session (mfaComplete=true) on custom customer UPDATE endpoint only
      // Find-or-create route will handle auth internally to allow Postman testing via admin token
      matcher: "/store/custom/customer/update*",
      middlewares: [authGuard],
    },
    {
      // Enforce elevated session (mfaComplete=true) on address book endpoints
      matcher: "/store/addresses*",
      middlewares: [authGuard],
    },
    {
      // Only authenticated customers can submit or edit reviews; GET is public
      matcher: "/store/custom/reviews*",
      method: ["POST", "PUT"],
      middlewares: [authGuard],
    },
    {
      // SECURITY FIX C4: Payment capture must require authentication
      // SECURITY FIX M9: Rate limit payment capture
      matcher: "/store/payments/*",
      method: ["POST"],
      middlewares: [rateLimit, authGuard],
    },
    {
      // SECURITY FIX H7: Custom order routes must require authentication at middleware level
      // SECURITY FIX M9: Rate limit order cancel/refund
      matcher: "/store/custom/orders*",
      middlewares: [rateLimit, authGuard],
    },
    {
      // Validate cart ownership for adding items to cart
      matcher: "/store/carts/:id/line-items",
      method: ["POST"],
      middlewares: [validateCartOwnership],
    },
    {
      // Validate cart ownership for updating/removing line items
      matcher: "/store/carts/:id/line-items/:lineItemId",
      method: ["POST", "DELETE"],
      middlewares: [validateCartOwnership],
    },
    {
      // Validate cart ownership for updating cart (addresses, shipping, etc.)
      matcher: "/store/carts/:id",
      method: ["POST"],
      middlewares: [validateCartOwnership],
    },
  ],
})


