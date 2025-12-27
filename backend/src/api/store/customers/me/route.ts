import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// GET /store/customers/me - return current customer using our JWT authGuard
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth?.customer_id || (req as any).customer_id
    console.info('[store/customers/me][GET]', {
      authCustomer: (req as any).auth?.customer_id,
      directCustomer: (req as any).customer_id,
      hasAuthHeader: Boolean(req.headers?.authorization),
      authHeaderPrefix: typeof req.headers?.authorization === 'string' ? req.headers.authorization.slice(0, 20) : null,
      requestPath: req.path,
      method: req.method,
    })
    if (!customerId) {
      return res.status(401).json({ message: "Customer authentication required" })
    }
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
    const [customer] = await customerModuleService.listCustomers({ id: customerId }, { take: 1, relations: ["addresses"] })
    if (!customer) return res.status(404).json({ message: "Customer not found" })
    return res.status(200).json({ customer })
  } catch (e: any) {
    return res.status(500).json({ message: "Internal Server Error" })
  }
}

// PATCH /store/customers/me - update allowlisted fields for current customer
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth?.customer_id || (req as any).customer_id
    if (!customerId) {
      return res.status(401).json({ message: "Customer authentication required" })
    }
    const allowed = ["first_name", "last_name", "email", "phone", "metadata", "addresses"]
    const payload: Record<string, any> = {}
    const requestBody = (req.body || {}) as Record<string, any>
    for (const k of allowed) {
      if (requestBody && typeof requestBody === 'object' && k in requestBody) payload[k] = requestBody[k]
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: "No valid fields supplied" })
    }
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
    const [updated] = await customerModuleService.updateCustomers(customerId, payload)
    return res.status(200).json({ customer: updated })
  } catch (e: any) {
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
