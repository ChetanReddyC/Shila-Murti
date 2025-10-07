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
    
    // Try to fetch orders with relations, fall back if it fails
    let orders: any[] = []
    
    try {
      // Attempt with relations
      orders = await orderModuleService.listOrders({
        customer_id: customerId,
      }, {
        relations: [
          "items",
          "items.variant",
          "items.variant.product",
          "shipping_address",
          "billing_address",
          "shipping_methods",
          "payment_collections",
          "payment_collections.payments",
          "fulfillments",
          "fulfillments.labels"
        ],
        take: 100,
      })
      console.log("[CUSTOM_ORDERS_ROUTE][WITH_RELATIONS]", `Fetched ${orders?.length || 0} orders`)
    } catch (relationError: any) {
      console.warn("[CUSTOM_ORDERS_ROUTE][RELATION_ERROR]", relationError?.message)
      
      // Fallback: just get basic orders and let Medusa auto-populate what it can
      orders = await orderModuleService.listOrders({
        customer_id: customerId,
      }, {
        take: 100,
      })
      console.log("[CUSTOM_ORDERS_ROUTE][WITHOUT_RELATIONS]", `Fetched ${orders?.length || 0} orders`)
    }
    
    if (orders && orders.length > 0) {
      console.log("[CUSTOM_ORDERS_ROUTE][SAMPLE]", JSON.stringify({
        id: orders[0].id,
        hasItems: !!orders[0].items,
        itemsCount: orders[0].items?.length || 0,
        hasShippingAddress: !!orders[0].shipping_address,
        hasFulfillments: !!orders[0].fulfillments,
        keys: Object.keys(orders[0])
      }, null, 2))
    }
    
    return res.status(200).json({ orders: orders || [] })
  } catch (error: any) {
    console.error("[CUSTOM_ORDERS_ROUTE][ERROR]", error)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
