import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
// Re-use the existing upsert logic located at /store/custom
import { POST as basePost } from "../../route";

// This file simply proxies the POST handler so that requests sent to
// /store/custom/customer/update are handled in the same way as /store/custom.
// Keeping the behaviour consistent ensures that customer creation or update
// from the storefront succeeds regardless of which endpoint is invoked.

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  return basePost(req, res);
}