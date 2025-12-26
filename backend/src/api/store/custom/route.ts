import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
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

    // SECURITY FIX: If caller provides a real customer ID (authenticated user), validate and conditionally update
    // This prevents duplicate accounts when logged-in users enter different recipient details at checkout
    const providedCustomerId = (req.body as any)?.customer_id;
    const isProvidedRealCustomer = providedCustomerId &&
      typeof providedCustomerId === 'string' &&
      providedCustomerId.startsWith('cus_') &&
      !providedCustomerId.includes('@guest.local');

    if (isProvidedRealCustomer) {
      // Fetch the existing customer to check if it has placeholder names
      const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
      const [existingCustomer] = await customerModuleService.listCustomers(
        { id: providedCustomerId },
        { take: 1, relations: ["addresses"] }
      );

      if (!existingCustomer) {
        return res.status(404).json({
          message: "Provided customer ID not found"
        });
      }

      // Check if customer has placeholder names that need to be updated
      const hasPlaceholderName =
        existingCustomer.first_name === 'Customer' ||
        existingCustomer.last_name === 'User' ||
        !existingCustomer.first_name ||
        existingCustomer.first_name.trim() === '';

      const hasRealNameInRequest =
        parsedFirstName &&
        parsedFirstName !== 'Customer' &&
        parsedFirstName.trim() !== '';

      // Logic for updating email if transitioning from placeholder
      const hasPlaceholderEmail = existingCustomer.email?.includes('@guest.local');
      const hasRealEmailInRequest = email && !email.includes('@guest.local') && email_authenticated;
      const shouldUpdateEmail = hasPlaceholderEmail && hasRealEmailInRequest;

      // Always update if we have better data
      if ((hasPlaceholderName && hasRealNameInRequest) || shouldUpdateEmail) {
        console.log('[CUSTOMER_REQUEST] Updating authenticated customer profile', {
          customerId: providedCustomerId,
          nameUpdate: hasPlaceholderName && hasRealNameInRequest,
          emailUpdate: shouldUpdateEmail,
          newName: `${parsedFirstName} ${parsedLastName}`.trim()
        });

        const updatePayload: Record<string, any> = {
          first_name: (hasPlaceholderName && hasRealNameInRequest) ? parsedFirstName : existingCustomer.first_name,
          last_name: (hasPlaceholderName && hasRealNameInRequest) ? parsedLastName : existingCustomer.last_name,
          phone: phone || existingCustomer.phone, // Default to existing phone if not provided, but we usually have it
          email: shouldUpdateEmail ? email : existingCustomer.email,
        };

        // Update metadata
        updatePayload.metadata = {
          ...(existingCustomer.metadata || {}),
          last_updated: new Date().toISOString(),
          update_source: 'checkout_sync_direct',
          // Preserve existing auth flags if not explicitly set in request
          whatsapp_authenticated: whatsapp_authenticated || existingCustomer.metadata?.whatsapp_authenticated || false,
          email_authenticated: email_authenticated || existingCustomer.metadata?.email_authenticated || false,
        };

        // Add addresses if provided
        if (addresses && addresses.length > 0) {
          // We need to transform addresses just like findOrCreate does
          // We can import transformAddresses or just copy the logic since it's simple mapping
          // Since I can't easily import the helper from outside, I'll implement a simple one here
          updatePayload.addresses = addresses.map((addr: any) => ({
            first_name: addr.first_name || parsedFirstName || "Customer",
            last_name: addr.last_name || parsedLastName || "",
            address_1: addr.address_1,
            address_2: addr.address_2,
            city: addr.city,
            postal_code: addr.postal_code,
            province: addr.province,
            country_code: addr.country_code || 'IN',
            phone: addr.phone || phone,
            metadata: { source: 'checkout', created_from_sync: true }
          }));
        }

        await customerModuleService.updateCustomers(providedCustomerId, updatePayload);

        // Fetch updated customer
        const [updatedCustomer] = await customerModuleService.listCustomers(
          { id: providedCustomerId },
          { take: 1, relations: ["addresses"] }
        );

        return res.status(200).json({
          customer: updatedCustomer,
          update_verified: true,
          consolidation_info: {
            strategy_used: 'authenticated_customer_direct_update',
            existing_customer_found: true,
            phone_conflicts_resolved: 0
          }
        });

      } else {
        // No update needed - just return existing
        console.log('[CUSTOMER_REQUEST] Authenticated customer up-to-date', {
          customerId: providedCustomerId
        });

        return res.status(200).json({
          customer: existingCustomer,
          update_verified: true,
          skipped_duplicate_creation: true,
          consolidation_info: {
            strategy_used: 'authenticated_customer_passthrough',
            existing_customer_found: true,
            phone_conflicts_resolved: 0
          }
        });
      }
    }

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
