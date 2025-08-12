import { defineMiddlewares } from "@medusajs/framework/http"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { extractBearerToken, verifyAccessToken } from "../utils/jwt"

// Explicit CORS + diagnostics for Store routes. This guarantees that
// custom headers like `x-publishable-api-key` are allowed and that
// all OPTIONS preflights are answered consistently, which helps avoid
// browser "No 'Access-Control-Allow-Origin' header" errors when a
// guard rejects the request early.

const allowedOrigins = (process.env.STORE_CORS || "http://localhost:3000,http://127.0.0.1:3000").split(",")

const allowedHeaders = (
  process.env.STORE_ALLOWED_HEADERS ||
  "Content-Type, Accept, Authorization, X-Requested-With, x-publishable-api-key"
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
  res.setHeader("Access-Control-Allow-Credentials", "false")
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  )
  res.setHeader("Access-Control-Allow-Headers", allowedHeaders)

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
    const token = extractBearerToken(req.headers.authorization as string | undefined)
    if (!token) {
      return res.status(401).json({ message: "Missing bearer token" })
    }

    const claims = await verifyAccessToken(token)

    // Attach identity to request context for downstream usage
    ;(req as any).customer_id = claims.sub
    ;(req as any).auth = { customer_id: claims.sub, claims }

    if (claims.mfaComplete === false) {
      return res.status(403).json({ message: "MFA required" })
    }

    return next()
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

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
      // Enforce elevated session (mfaComplete=true) on address book endpoints
      matcher: "/store/addresses*",
      middlewares: [authGuard],
    },
  ],
})


