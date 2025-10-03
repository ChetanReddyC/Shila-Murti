import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../utils/jwt"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Extract and verify JWT token
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    // Fetch customer's addresses from database
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
    
    const [customer] = await customerModuleService.listCustomers(
      { id: customerId },
      { take: 1, relations: ["addresses"] }
    )

    const addresses = customer?.addresses || []

    return res.status(200).json({ addresses })
  } catch (error: any) {
    console.error("[CUSTOM_ADDRESSES_ROUTE][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
