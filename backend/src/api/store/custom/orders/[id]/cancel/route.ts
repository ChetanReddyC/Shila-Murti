import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../../utils/jwt"
import { cancelCustomerOrderWorkflow } from "../../../../../../workflows/cancel-order"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    const orders = await orderModuleService.listOrders({
      id: orderId,
      customer_id: customerId,
    }, {
      take: 1,
    })
    
    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: "Order not found" })
    }
    
    const order = orders[0]

    if (order.status === 'canceled') {
      return res.status(400).json({ 
        message: "Order is already cancelled"
      })
    }

    try {
      const { result } = await cancelCustomerOrderWorkflow(req.scope).run({
        input: {
          order_id: orderId,
        },
      })

      const updatedOrders = await orderModuleService.listOrders({
        id: orderId,
      }, {
        take: 1,
      })

      return res.status(200).json({ 
        order: updatedOrders[0],
        message: "Order cancelled successfully"
      })
    } catch (workflowError: any) {
      console.error("[ORDER_CANCEL_WORKFLOW_ERROR]", workflowError)
      
      const errorMessage = workflowError?.message || String(workflowError)
      
      if (errorMessage.includes('fulfilled') || 
          errorMessage.includes('shipped') || 
          errorMessage.includes('delivered')) {
        return res.status(400).json({ 
          message: "Order cannot be cancelled",
          reason: "Order has been fulfilled or shipped"
        })
      }
      
      if (errorMessage.includes('paid') || errorMessage.includes('captured')) {
        return res.status(400).json({ 
          message: "Order cannot be cancelled",
          reason: "Payment has been processed. Please contact support for refund."
        })
      }

      return res.status(400).json({ 
        message: "Order cannot be cancelled",
        reason: errorMessage
      })
    }
  } catch (error: any) {
    console.error("[ORDER_CANCEL_ERROR]", error)
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: error?.message
    })
  }
}
