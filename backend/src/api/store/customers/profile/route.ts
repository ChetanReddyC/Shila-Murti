import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth?.customer_id || (req as any).customer_id
    console.info('[store/customers/profile][GET]', {
      authCustomer: (req as any).auth?.customer_id,
      directCustomer: (req as any).customer_id,
      hasAuthHeader: Boolean(req.headers?.authorization),
    })
    if (!customerId) {
      return res.status(401).json({ message: "Customer authentication required" })
    }
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER)
    const [customer] = await customerModuleService.listCustomers({ id: customerId }, { take: 1, relations: ["addresses"] })
    if (!customer) return res.status(404).json({ message: "Customer not found" })
    return res.status(200).json({ customer })
  } catch (e: any) {
    console.error('[store/customers/profile][GET][error]', e?.message || e)
    return res.status(500).json({ message: "Internal Server Error" })
  }
}
