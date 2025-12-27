import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { normalizePhoneNumber } from "../../../../../utils/phoneNormalization"
import { phoneConsistencyMiddleware } from "../../../../middlewares/phoneConsistency"
import { findOrCreateCustomerAccount } from "../../../../../utils/customerAccountManager"
import { extractBearerToken, verifyAccessToken } from "../../../../../utils/jwt"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await phoneConsistencyMiddleware(req, res, async () => {
    // Only accept verified customer JWT tokens
    let authSubject: string | null = null

    try {
      const bearer = extractBearerToken(req.headers.authorization as string | undefined)
      console.log('[FIND_OR_CREATE] Authorization header present:', Boolean(bearer))

      if (bearer) {
        const claims = await verifyAccessToken(bearer, req.scope)
        authSubject = claims.sub || null
        console.log('[FIND_OR_CREATE] JWT verified successfully, subject:', authSubject)
      } else {
        console.warn('[FIND_OR_CREATE] No bearer token in Authorization header')
      }
    } catch (error: any) {
      console.error('[FIND_OR_CREATE] JWT verification failed:', error?.message || error)
    }

    // Customer authentication is required - no bypass allowed
    if (!authSubject) {
      console.warn('[FIND_OR_CREATE] Rejecting request - no valid auth subject')
      return res.status(401).json({ message: "Customer authentication required" })
    }

    const {
      phone,
      first_name,
      last_name,
      name,
      email,
      password,
      addresses = [],
      whatsapp_authenticated = false,
      email_authenticated = false,
      identity_method = "phone",
      cart_id,
      order_id,
    } = (req.body as any) ?? {}

    // Validate identifier based on identity method
    // Either phone or email must be provided, but not necessarily both
    const hasPhone = phone && typeof phone === "string" && phone.trim()
    const hasEmail = email && typeof email === "string" && email.includes("@")

    // At least one identifier is required
    if (!hasPhone && !hasEmail) {
      return res.status(400).json({ message: "Either phone number or email is required" })
    }

    // Validate phone format if provided
    let normalizedPhone: string | undefined
    if (hasPhone) {
      normalizedPhone = normalizePhoneNumber(phone)
      if (!normalizedPhone || normalizedPhone.length < 12) {
        return res.status(400).json({ message: "Phone number must be a valid Indian mobile number" })
      }
    }

    if (!whatsapp_authenticated && !email_authenticated) {
      return res.status(400).json({
        message: "Customer must be authenticated via WhatsApp or email",
        requires_authentication: true,
      })
    }

    // Validate email if using email authentication
    if (email_authenticated && identity_method === "email") {
      if (!hasEmail) {
        return res.status(400).json({ message: "Valid email is required for email authentication" })
      }
    }

    // Validate phone if using phone/WhatsApp authentication
    if (whatsapp_authenticated && identity_method === "phone") {
      if (!hasPhone) {
        return res.status(400).json({ message: "Valid phone number is required for WhatsApp authentication" })
      }
    }

    let parsedFirstName: string | undefined = first_name
    let parsedLastName: string | undefined = last_name

    if (!parsedFirstName && !parsedLastName && name) {
      const parts = String(name).trim().split(/\s+/)
      parsedFirstName = parts.shift() || "Customer"
      parsedLastName = parts.join(" ")
    }

    if (!parsedFirstName || !parsedFirstName.trim()) {
      parsedFirstName = "Customer"
    }

    try {
      const result = await findOrCreateCustomerAccount({
        scope: req.scope,
        phone,
        first_name: parsedFirstName,
        last_name: parsedLastName,
        email,
        password,
        addresses,
        whatsapp_authenticated,
        email_authenticated,
        identity_method,
        cart_id,
        order_id,
        auth_subject: authSubject,
        requireAuthSubjectMatch: false, // Allow updating auth subject if token is valid
      })

      if (!result.ok) {
        return res.status(result.statusCode).json({
          message: "Customer ownership conflict",
          reason: result.reason,
        })
      }

      const responsePayload: Record<string, any> = {
        customer_id: result.customer?.id,
        created: result.wasCreated,
        lookup_strategy: result.lookupStrategy,
        consolidation_info: result.consolidationInfo,
        metadata: {
          phone_normalized: result.customer?.metadata?.phone_normalized,
          whatsapp_authenticated: result.customer?.metadata?.whatsapp_authenticated,
          email_authenticated: result.customer?.metadata?.email_authenticated,
        },
      }

      if (result.cartAssociation) {
        responsePayload.cart_association = result.cartAssociation
      }

      if (result.orderAssociation) {
        responsePayload.order_association = result.orderAssociation
      }

      return res.status(result.statusCode).json(responsePayload)
    } catch (error: any) {
      console.error("[CUSTOMER_FIND_OR_CREATE][ERROR]", error)
      return res.status(500).json({ message: "Internal Server Error" })
    }
  })
}
