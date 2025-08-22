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
  const { first_name, last_name, name, email, password, phone, addresses = [], whatsapp_authenticated = false } = (req.body as any) ?? {};

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

  // Enhanced validation for WhatsApp authenticated customers
  if (!whatsapp_authenticated) {
    return res.status(400).json({ 
      message: "Customer must be WhatsApp authenticated",
      requires_whatsapp_auth: true 
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

  // When email is missing but phone is provided, synthesize a unique placeholder to satisfy Medusa's schema
  let effectiveEmail: string | undefined = email;
  if (!effectiveEmail && phone) {
    effectiveEmail = generatePlaceholderEmail(phone);
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
      whatsapp_authenticated: true,
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
        phone: phone || resultCustomer.phone
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
        whatsapp_authenticated: true,
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
          addresses_count: finalCustomer.addresses?.length || 0
        });

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
    
    return res.status(201).json({ 
      customer: finalCustomer,
      consolidation_info: consolidationInfo
    });
  } catch (e: any) {
    console.error("[CUSTOMER_REGISTER_UPSERT][ERROR]", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
