import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { normalizePhoneNumber } from "../../../utils/phoneNormalization";
import { phoneConsistencyMiddleware } from "../../middlewares/phoneConsistency";
import { findOrCreateCustomerAccount } from "../../../utils/customerAccountManager";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200);
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  // Apply phone consistency middleware
  await phoneConsistencyMiddleware(req, res, async () => {
    await handleCustomerRequest(req, res);
  });
}

async function handleCustomerRequest(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const {
    first_name,
    last_name,
    name,
    email,
    password,
    phone,
    addresses = [],
    whatsapp_authenticated = false,
    email_authenticated = false,
    identity_method = "phone",
    cart_id,
    order_id,
  } = (req.body as any) ?? {};

  // Log phone conflict detection results
  if (req.phoneConflictDetected) {
    console.log('[CUSTOMER_REQUEST] Phone conflicts detected:', req.phoneConflictDetails);
  }

  // Derive first and last names when the client submits a single "name" field only
  let parsedFirstName: string | undefined = first_name;
  let parsedLastName: string | undefined = last_name;

  if (!parsedFirstName && !parsedLastName && name) {
    const parts = String(name).trim().split(/\s+/);
    parsedFirstName = parts.shift() || "Customer";
    parsedLastName = parts.join(" "); // may be empty if only one token
  }

  if (!whatsapp_authenticated && !email_authenticated) {
    return res.status(400).json({ 
      message: "Customer must be authenticated via WhatsApp or email",
      requires_authentication: true 
    });
  }
  
  if (!parsedFirstName || typeof parsedFirstName !== 'string' || parsedFirstName.trim().length === 0) {
    return res.status(400).json({ 
      message: "First name is required and must be a non-empty string" 
    });
  }
  
  if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
    return res.status(400).json({ 
      message: "Phone number is required and must be a non-empty string" 
    });
  }
  
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone || normalizedPhone.length < 12) {
    return res.status(400).json({ 
      message: "Phone number must be a valid Indian mobile number" 
    });
  }

  if (email_authenticated && identity_method === 'email') {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: "Valid email is required for email authentication" });
    }
  }

  try {
    const authSubject = (req as any).auth?.customer_id || (req as any).customer_id || null;

    const result = await findOrCreateCustomerAccount({
      scope: req.scope,
      phone,
      first_name: parsedFirstName,
      last_name: parsedLastName,
      email,
      password,
      addresses,
      whatsapp_authenticated,
      email_authenticated,
      identity_method,
      cart_id,
      order_id,
      auth_subject: authSubject,
      requireAuthSubjectMatch: false,
    });

    if (!result.ok) {
      console.warn('[CUSTOMER_ACCOUNT][CONFLICT]', {
        reason: result.reason,
        customerId: result.customerId,
      });
      return res.status(result.statusCode).json({
        message: 'Customer ownership conflict',
        reason: result.reason,
      });
    }

    console.log('[CUSTOMER_ACCOUNT] Completed', {
      customerId: result.customer?.id,
      created: result.wasCreated,
      strategy: result.lookupStrategy,
    });

    if (result.wasCreated) {
      return res.status(result.statusCode).json({
        customer: result.customer,
        consolidation_info: result.consolidationInfo,
      });
    }

    return res.status(result.statusCode).json({
      customer: result.customer,
      update_verified: true,
      consolidation_info: result.consolidationInfo,
    });
  } catch (e: any) {
    console.error('[CUSTOMER_REGISTER_UPSERT][ERROR]', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
