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

    // Fetch customer's orders from database
    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    const orders = await orderModuleService.listOrders({
      customer_id: customerId,
    }, {
      relations: ["items"],
      take: 100,
    })

    return res.status(200).json({ orders: orders || [] })
  } catch (error: any) {
    console.error("[CUSTOM_ORDERS_ROUTE][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
