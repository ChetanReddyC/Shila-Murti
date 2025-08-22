import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { extractBearerToken, verifyAccessToken } from "../../../../utils/jwt";

// Whitelisted fields that can be updated through this endpoint
const CUSTOMER_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "metadata",
  "addresses",
] as const;

type UpdatableCustomerInput = Partial<Record<typeof CUSTOMER_FIELDS[number], any>>;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Verify access token
    const token = extractBearerToken(req.headers.authorization as string | undefined);
    if (!token) {
      return res.status(401).json({ message: "Missing bearer token" });
    }

    const claims = await verifyAccessToken(token);
    const customerId = claims.sub;
    if (!customerId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Extract and sanitize body
    const input: UpdatableCustomerInput = {};
    for (const field of CUSTOMER_FIELDS) {
      if (field in (req.body || {})) {
        (input as any)[field] = (req.body as any)[field];
      }
    }

    if (Object.keys(input).length === 0) {
      return res.status(400).json({ message: "No valid fields supplied" });
    }

    // Prevent overwriting sensitive fields
    delete (input as any).id;
    delete (input as any).has_account;

    // Resolve customer module service and update customer
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
    const [updated] = await customerModuleService.updateCustomers(customerId, input);

    return res.status(200).json({ customer: updated });
  } catch (e: any) {
    console.error("[CUSTOMER_UPDATE][ERROR]", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}