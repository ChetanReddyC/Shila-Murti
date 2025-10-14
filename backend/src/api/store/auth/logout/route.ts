import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { extractBearerToken, verifyAccessToken } from "../../../../utils/jwt"
import { revokeToken, revokeCustomerTokens } from "../../../../utils/jwtRevocation"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer, req.scope)
    const customerId = claims.sub
    const jti = (claims as any)?.jti
    const revokeAll = (req.body as any)?.revokeAll === true

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    // Revoke all tokens for the customer if requested
    if (revokeAll) {
      await revokeCustomerTokens(req.scope, customerId)
      console.log('[AUTH_LOGOUT] All tokens revoked for customer:', customerId)
      return res.status(200).json({ 
        message: "All sessions logged out successfully",
        revoked: "all"
      })
    }

    // Revoke only the current token
    if (jti) {
      await revokeToken(req.scope, jti)
      console.log('[AUTH_LOGOUT] Token revoked:', { customerId, jti })
    }

    return res.status(200).json({ 
      message: "Logged out successfully",
      revoked: "current"
    })
  } catch (error: any) {
    console.error('[AUTH_LOGOUT][ERROR]', error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
