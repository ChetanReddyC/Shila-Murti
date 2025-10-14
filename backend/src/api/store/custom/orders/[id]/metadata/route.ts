import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../../utils/jwt"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // SECURITY: Check if this is an internal system call (from webhook or admin)
    // Internal calls will have a special header or use admin auth
    const isInternalCall = req.headers['x-internal-call'] === process.env.INTERNAL_API_SECRET
    
    // If not internal, require customer JWT authentication
    let authenticatedCustomerId: string | undefined
    
    if (!isInternalCall) {
      const bearer = extractBearerToken(req.headers.authorization as string | undefined)
      if (!bearer) {
        return res.status(401).json({ message: "Authorization token required" })
      }

      try {
        const claims = await verifyAccessToken(bearer, req.scope)
        authenticatedCustomerId = claims.sub

        if (!authenticatedCustomerId) {
          return res.status(401).json({ message: "Invalid token: missing customer ID" })
        }
      } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" })
      }
    }

    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    const body = req.body as Record<string, any>
    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ message: "Metadata fields required in request body" })
    }

    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    // Retrieve current order with customer_id for ownership verification
    let order: any
    try {
      order = await orderModuleService.retrieveOrder(orderId, {
        select: ["id", "metadata", "customer_id"],
      })
    } catch (error) {
      console.error('[METADATA_UPDATE][retrieve_error]', {
        orderId,
        error: String(error)
      })
      return res.status(404).json({ message: "Order not found" })
    }
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    // SECURITY: Verify customer owns this order (unless internal call)
    if (!isInternalCall && authenticatedCustomerId !== order.customer_id) {
      console.warn('[METADATA_UPDATE][unauthorized_access]', {
        orderId,
        authenticatedCustomerId,
        orderCustomerId: order.customer_id
      })
      return res.status(403).json({ message: "Unauthorized access to order" })
    }

    // Merge new metadata with existing metadata
    const updatedMetadata = {
      ...order.metadata,
      ...body
    }

    // Update order metadata
    try {
      await orderModuleService.updateOrders(orderId, {
        metadata: updatedMetadata
      })

      console.log('[METADATA_UPDATE][success]', {
        orderId,
        updatedFields: Object.keys(body)
      })

      return res.status(200).json({ 
        message: "Metadata updated successfully",
        orderId,
        updatedFields: Object.keys(body)
      })
    } catch (updateError) {
      console.error('[METADATA_UPDATE][update_error]', {
        orderId,
        error: String(updateError)
      })
      return res.status(500).json({ 
        message: "Failed to update metadata",
        error: String(updateError)
      })
    }
  } catch (error: any) {
    console.error("[METADATA_UPDATE_ERROR]", error)
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: error?.message
    })
  }
}
