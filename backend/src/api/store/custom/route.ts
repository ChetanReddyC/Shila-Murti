import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows";
import { randomUUID } from "crypto";
import { Modules } from "@medusajs/framework/utils";
import { normalizePhoneNumber, generatePlaceholderEmail } from "../../../utils/phoneNormalization";
import { createEnhancedCustomerService, CustomerLookupRequest } from "../../../utils/enhancedCustomerService";
import { phoneConsistencyMiddleware } from "../../middlewares/phoneConsistency";

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
  const { first_name, last_name, name, email, password, phone, addresses = [], whatsapp_authenticated = false, email_authenticated = false, identity_method = 'phone', cart_id, order_id } = (req.body as any) ?? {};

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

  // Enhanced validation for authenticated customers
  if (!whatsapp_authenticated && !email_authenticated) {
    return res.status(400).json({ 
      message: "Customer must be authenticated via WhatsApp or email",
      requires_authentication: true 
    });
  }
  
  // Validate required fields for customer creation
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
  
  // Validate phone number format using shared utility
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone || normalizedPhone.length < 12) {
    return res.status(400).json({ 
      message: "Phone number must be a valid Indian mobile number" 
    });
  }

  // Handle email based on authentication method
  let effectiveEmail: string | undefined = email;
  
  if (email_authenticated && identity_method === 'email') {
    // For email authentication, email should already be provided and valid
    if (!effectiveEmail || typeof effectiveEmail !== 'string' || !effectiveEmail.includes('@')) {
      return res.status(400).json({ message: "Valid email is required for email authentication" });
    }
  } else if (whatsapp_authenticated && identity_method === 'phone') {
    // For WhatsApp authentication, generate placeholder email from phone if needed
    if (!effectiveEmail && phone) {
      effectiveEmail = generatePlaceholderEmail(phone);
    }
  }

  if (!effectiveEmail) {
    return res.status(400).json({ message: "Email or phone is required" });
  }

  try {
    const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
    const enhancedCustomerService = createEnhancedCustomerService(customerModuleService);
    
    // Prepare customer lookup request
    const lookupRequest: CustomerLookupRequest = {
      phone,
      email: effectiveEmail,
      whatsapp_authenticated: whatsapp_authenticated,
      email_authenticated: email_authenticated,
      identity_method: identity_method,
      first_name: parsedFirstName,
      last_name: parsedLastName || ""
    };
    
    console.log('[CUSTOMER_ENHANCED_LOOKUP] Starting enhanced customer lookup:', {
      phone,
      normalizedPhone,
      effectiveEmail,
      first_name: parsedFirstName,
      last_name: parsedLastName
    });
    
    // Use enhanced customer service for lookup and creation/update
    const { customer: resultCustomer, consolidationInfo } = await enhancedCustomerService.findOrCreateCustomer(lookupRequest);
    
    if (consolidationInfo.existing_customer_found) {
      console.log('[CUSTOMER_UPDATE] Enhanced lookup found existing customer:', {
        strategy: consolidationInfo.strategy_used,
        phoneConflictsResolved: consolidationInfo.phone_conflicts_resolved,
        customerEmail: resultCustomer.email
      });
      
      // For existing customers, update using the customer module
      const updatePayload: Record<string, any> = {
        first_name: parsedFirstName || resultCustomer.first_name,
        last_name: parsedLastName || resultCustomer.last_name,
        phone: phone || resultCustomer.phone,
        has_account: true // Ensure authenticated customers are marked as registered accounts
      };
      
      // Include addresses directly in customer update payload
      if (addresses?.length) {
        // Transform addresses to the expected format
        const transformedAddresses = addresses.map((address: any) => ({
          first_name: address.first_name || parsedFirstName,
          last_name: address.last_name || parsedLastName || '',
          address_1: address.address_1?.trim(),
          address_2: address.address_2?.trim() || null,
          city: address.city?.trim(),
          postal_code: address.postal_code?.trim(),
          province: address.province?.trim() || null,
          country_code: (address.country_code || 'IN').toUpperCase(),
          phone: address.phone?.trim() || null,
          metadata: {
            source: 'checkout',
            created_from_sync: true,
            sync_timestamp: new Date().toISOString(),
            ...(address.metadata || {})
          }
        }));
        
        updatePayload.addresses = transformedAddresses;
        
        console.log('[CUSTOMER_UPDATE] Including addresses in update payload:', {
          customerId: resultCustomer.id,
          addressCount: transformedAddresses.length
        });
      }
      
      // Enhanced metadata with consolidation information
      updatePayload.metadata = {
        ...(resultCustomer.metadata || {}),
        phone: phone,
        phone_normalized: normalizedPhone,
        last_updated: new Date().toISOString(),
        update_source: 'enhanced_store_custom',
        whatsapp_authenticated: whatsapp_authenticated,
        email_authenticated: email_authenticated,
        identity_method: identity_method,
        auth_timestamp: (resultCustomer.metadata?.auth_timestamp) || new Date().toISOString(),
        auth_source: 'customer_update',
        unified_phone_lookup: true,
        consolidation_info: {
          strategy_used: consolidationInfo.strategy_used,
          phone_conflicts_resolved: consolidationInfo.phone_conflicts_resolved,
          timestamp: new Date().toISOString()
        },
        duplicate_prevention: true
      };

      console.log('[CUSTOMER_UPDATE] Updating existing customer:', {
        customerId: resultCustomer.id,
        updatePayload: {
          first_name: updatePayload.first_name,
          last_name: updatePayload.last_name,
          phone: updatePayload.phone,
          has_account: updatePayload.has_account, // Log has_account value
          addressCount: updatePayload.addresses?.length || 0
        }
      });

      try {
        const updateResult = await customerModuleService.updateCustomers(resultCustomer.id, updatePayload);
        
        // Fetch updated customer to verify changes and include addresses
        const [finalCustomer] = await customerModuleService.listCustomers(
          { id: resultCustomer.id },
          { 
            take: 1,
            relations: ['addresses'] // Include addresses in the response
          }
        );
        
        console.log('[CUSTOMER_UPDATE] Successfully updated customer:', {
          id: finalCustomer.id,
          email: finalCustomer.email,
          first_name: finalCustomer.first_name,
          last_name: finalCustomer.last_name,
          phone: finalCustomer.phone,
          has_account: finalCustomer.has_account, // Log final has_account status
          addresses_count: finalCustomer.addresses?.length || 0
        });

        // Attempt to associate cart/order even for existing customers
        try {
          if (cart_id && finalCustomer?.id) {
            const adminToken = (process.env as any).MEDUSA_ADMIN_TOKEN || ''
            if (adminToken) {
              const base = (process.env as any).MEDUSA_BASE_URL || (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
              console.log('[ASSOC_BACKEND][cart]', { cart_id, customer_id: finalCustomer.id })
              await fetch(`${base}/admin/carts/${cart_id}` as any, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ customer_id: finalCustomer.id })
              } as any).catch((e: any) => { try { console.log('[ASSOC_BACKEND][cart][fail]', { error: e?.message }) } catch {} })
            }
          }
          if (order_id && finalCustomer?.id) {
            let linked = false
            try {
              const anyScope: any = req.scope
              const orderModuleService = (anyScope && typeof anyScope.resolve === 'function') ? anyScope.resolve((Modules as any).ORDER) : null
              if (orderModuleService && typeof orderModuleService.updateOrders === 'function') {
                await orderModuleService.updateOrders(order_id, { customer_id: finalCustomer.id })
                linked = true
              }
            } catch {}
            if (!linked) {
              const adminToken = (process.env as any).MEDUSA_ADMIN_TOKEN || ''
              if (adminToken) {
                const base = (process.env as any).MEDUSA_BASE_URL || (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
                console.log('[ASSOC_BACKEND][order]', { order_id, customer_id: finalCustomer.id })
                await fetch(`${base}/admin/orders/${order_id}` as any, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
                  body: JSON.stringify({ customer_id: finalCustomer.id })
                } as any).catch((e: any) => { try { console.log('[ASSOC_BACKEND][order][fail]', { error: e?.message }) } catch {} })
              }
            }
            // Persist last order id to aid reconciliation jobs
            try {
              await customerModuleService.updateCustomers(finalCustomer.id, {
                metadata: {
                  ...(finalCustomer.metadata || {}),
                  last_order_id: order_id,
                  last_order_linked_at: new Date().toISOString(),
                }
              })
            } catch {}
          }
        } catch {}

        return res.status(200).json({ 
          customer: finalCustomer,
          update_verified: true,
          consolidation_info: consolidationInfo
        });
        
      } catch (updateError) {
        console.error('[CUSTOMER_UPDATE] Enhanced update failed:', updateError);
        return res.status(500).json({ 
          message: 'Customer update failed',
          error: updateError.message
        });
      }
    }

    // Create new customer using enhanced customer service data
    console.log('[CUSTOMER_CREATE] Creating new customer with enhanced metadata');
    
    const safePassword = password || randomUUID();
    
    // Use the customer data prepared by enhanced customer service
    // Include addresses in customer creation data
    const customerCreateData = {
      ...resultCustomer, // This contains the enhanced metadata
      password: safePassword,
      has_account: true, // Ensure authenticated customers are marked as registered accounts
      addresses: addresses?.length ? addresses.map((address: any) => ({
        first_name: address.first_name || parsedFirstName,
        last_name: address.last_name || parsedLastName || '',
        address_1: address.address_1?.trim(),
        address_2: address.address_2?.trim() || null,
        city: address.city?.trim(),
        postal_code: address.postal_code?.trim(),
        province: address.province?.trim() || null,
        country_code: (address.country_code || 'IN').toUpperCase(),
        phone: address.phone?.trim() || null,
        metadata: {
          source: 'checkout',
          created_from_sync: true,
          sync_timestamp: new Date().toISOString(),
          ...(address.metadata || {})
        }
      })) : []
    };
    
    console.log('[CUSTOMER_CREATE] Customer creation payload:', {
      first_name: customerCreateData.first_name,
      last_name: customerCreateData.last_name,
      email: customerCreateData.email,
      phone: customerCreateData.phone,
      has_account: customerCreateData.has_account, // Log has_account value
      addressCount: addresses?.length || 0,
      metadata: customerCreateData.metadata
    });

    const { result } = await createCustomersWorkflow(req.scope).run({
      input: {
        customersData: [customerCreateData],
      },
    });

    const customer = result?.[0];
    
    console.log('[CUSTOMER_CREATE] Successfully created customer:', {
      id: customer?.id,
      email: customer?.email,
      phone: customer?.phone,
      has_account: customer?.has_account, // Log has_account status
      addresses_count: customer?.addresses?.length || 0
    });
    
    // Fetch the final customer with addresses to return complete data
    let finalCustomer = customer;
    if (customer?.id) {
      try {
        const [customerWithAddresses] = await customerModuleService.listCustomers(
          { id: customer.id },
          { 
            take: 1,
            relations: ['addresses'] // Include addresses in the response
          }
        );
        finalCustomer = customerWithAddresses || customer;
        
        console.log('[CUSTOMER_CREATE] Final customer with addresses:', {
          id: finalCustomer.id,
          addresses_count: finalCustomer.addresses?.length || 0
        });
      } catch (fetchError) {
        console.warn('[CUSTOMER_CREATE] Failed to fetch customer with addresses, using original customer object');
      }
    }
    
    // Best-effort association: if cart_id is present, try to attach the customer to the cart before completion
    // and if order_id is present, set customer metadata for audit. Medusa v2 store/cart APIs from admin are not
    // directly available in this route without admin token; we avoid failing the request if association fails.
    try {
      if (cart_id && finalCustomer?.id) {
        // Attempt via admin cart update only if an admin token is configured in env at the gateway level
        const adminToken = (process.env as any).MEDUSA_ADMIN_TOKEN || ''
        if (adminToken) {
          const base = (process.env as any).MEDUSA_BASE_URL || (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
          console.log('[ASSOC_BACKEND][cart]', { cart_id, customer_id: finalCustomer.id })
          await fetch(`${base}/admin/carts/${cart_id}` as any, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ customer_id: finalCustomer.id })
          } as any).catch((e: any) => { try { console.log('[ASSOC_BACKEND][cart][fail]', { error: e?.message }) } catch {} })
        }
      }
      if (order_id && finalCustomer?.id) {
        // Try to link the order -> customer via module first, then fallback to admin HTTP
        let linked = false
        try {
          const anyScope: any = req.scope
          const orderModuleService = (anyScope && typeof anyScope.resolve === 'function') ? anyScope.resolve((Modules as any).ORDER) : null
          if (orderModuleService && typeof orderModuleService.updateOrders === 'function') {
            await orderModuleService.updateOrders(order_id, { customer_id: finalCustomer.id })
            linked = true
          }
        } catch {}
        if (!linked) {
          const adminToken = (process.env as any).MEDUSA_ADMIN_TOKEN || ''
          if (adminToken) {
            const base = (process.env as any).MEDUSA_BASE_URL || (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
            console.log('[ASSOC_BACKEND][order]', { order_id, customer_id: finalCustomer.id })
            await fetch(`${base}/admin/orders/${order_id}` as any, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-medusa-access-token': adminToken, 'Authorization': `Bearer ${adminToken}` },
              body: JSON.stringify({ customer_id: finalCustomer.id })
            } as any).catch((e: any) => { try { console.log('[ASSOC_BACKEND][order][fail]', { error: e?.message }) } catch {} })
          }
        }
        // Store last seen order id on customer metadata for reconciliation jobs
        try {
          const customerModuleService: any = req.scope.resolve(Modules.CUSTOMER);
          await customerModuleService.updateCustomers(finalCustomer.id, {
            metadata: {
              ...(finalCustomer.metadata || {}),
              last_order_id: order_id,
              last_order_linked_at: new Date().toISOString(),
            }
          })
        } catch {}
      }
    } catch {}

    return res.status(201).json({ 
      customer: finalCustomer,
      consolidation_info: consolidationInfo
    });
  } catch (e: any) {
    console.error("[CUSTOMER_REGISTER_UPSERT][ERROR]", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
