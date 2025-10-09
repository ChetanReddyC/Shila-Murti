import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../../utils/jwt"
import { generateInvoicePdfWorkflow } from "../../../../../../workflows/generate-invoice-pdf"

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

    // Get order ID from URL params
    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    // Verify customer owns the order
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

    // Generate invoice PDF using workflow
    const { result } = await generateInvoicePdfWorkflow(req.scope).run({
      input: {
        order_id: orderId,
      },
    })

    // Extract pdf_buffer - handle Medusa workflow serialization
    const pdf_buffer = result?.pdf_buffer
    
    if (!pdf_buffer) {
      throw new Error("PDF buffer is null")
    }

    // Convert to Buffer - handle serialized Uint8Array (plain object with numeric keys)
    let buffer: Buffer
    if (pdf_buffer instanceof Uint8Array) {
      buffer = Buffer.from(pdf_buffer)
    } else if (typeof pdf_buffer === 'object' && pdf_buffer !== null) {
      // Workflow serialized the Uint8Array to plain object - convert back
      const byteArray = Object.values(pdf_buffer) as number[]
      buffer = Buffer.from(byteArray)
    } else {
      throw new Error("Cannot convert pdf_buffer to Buffer")
    }

    // Set response headers for PDF download
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${orderId}.pdf"`,
      "Content-Length": buffer.length.toString(),
    })

    // Send the PDF buffer
    res.send(buffer)
  } catch (error: any) {
    console.error("[INVOICE_GENERATION_ERROR]", error.message)
    return res.status(500).json({ 
      message: "Failed to generate invoice",
      error: error.message
    })
  }
}
