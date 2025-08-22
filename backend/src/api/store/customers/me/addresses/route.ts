import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth?.customer_id;
    if (!customerId) {
      return res.status(401).json({ message: "Customer authentication required" });
    }

    const customerModuleService = req.scope.resolve(Modules.CUSTOMER);
    
    // List customer addresses
    const addresses = await customerModuleService.listCustomerAddresses(
      { customer_id: customerId },
      { take: 50 }
    );

    return res.status(200).json({ addresses });
  } catch (error: any) {
    console.error("[CUSTOMER_ADDRESSES_LIST][ERROR]", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const customerId = (req as any).auth?.customer_id;
    if (!customerId) {
      return res.status(401).json({ message: "Customer authentication required" });
    }

    const {
      first_name,
      last_name,
      address_1,
      address_2,
      city,
      postal_code,
      province,
      country_code,
      phone,
      metadata
    } = (req.body as any) || {};

    // Validate required fields
    if (!first_name || !address_1 || !city || !postal_code) {
      return res.status(400).json({ 
        message: "Missing required fields: first_name, address_1, city, postal_code" 
      });
    }

    const customerModuleService = req.scope.resolve(Modules.CUSTOMER);

    // Create address data
    const addressData = {
      customer_id: customerId,
      first_name: first_name.trim(),
      last_name: (last_name || '').trim(),
      address_1: address_1.trim(),
      address_2: address_2?.trim() || null,
      city: city.trim(),
      postal_code: postal_code.trim(),
      province: province?.trim() || null,
      country_code: (country_code || 'IN').toUpperCase(),
      phone: phone?.trim() || null,
      metadata: {
        source: 'api',
        created_at: new Date().toISOString(),
        ...(metadata || {})
      }
    };

    console.log('[CUSTOMER_ADDRESS_CREATE] Creating address:', {
      customerId,
      addressData
    });

    // Create the address using the customer module service
    const createdAddress = await customerModuleService.createCustomerAddresses([addressData]);
    
    console.log('[CUSTOMER_ADDRESS_CREATE] Address created successfully:', {
      customerId,
      addressId: createdAddress[0]?.id
    });

    return res.status(201).json({ 
      address: createdAddress[0] 
    });
  } catch (error: any) {
    console.error("[CUSTOMER_ADDRESS_CREATE][ERROR]", error);
    return res.status(500).json({ 
      message: "Failed to create address",
      error: error.message 
    });
  }
}