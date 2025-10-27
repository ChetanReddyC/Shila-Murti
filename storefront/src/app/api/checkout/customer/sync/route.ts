import type { NextRequest } from 'next/server'
import { getCounter } from '@/lib/metrics'
import { signBridgeToken } from '@/lib/auth/signing'
import { storeFetch } from '@/lib/medusaServer'
import { normalizePhoneNumber, generatePlaceholderEmail, arePhoneNumbersEquivalent } from '@/utils/phoneNormalization'

export interface PhoneConflictInfo {
  whatsappPhone: string;
  shippingPhone: string;
  conflictDetected: boolean;
  resolutionStrategy: 'use_whatsapp' | 'use_shipping' | 'no_conflict';
}

export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({ 
    ok: true, 
    message: 'Customer sync endpoint is accessible',
    timestamp: Date.now()
  }), { status: 200 })
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const body = await req.json().catch(() => ({}))
    const { customerId, cartId, orderId, formData, orderCreated, whatsapp_authenticated = false, email_authenticated = false, identityMethod = 'phone' } = body
    try { console.log('[SYNC_API][start]', { customerId, cartId, orderId, identityMethod, whatsapp_authenticated, email_authenticated }) } catch {}
    
    // Enhanced input validation
    if (!customerId || typeof customerId !== 'string') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'invalid_customer_id',
        message: 'Valid customer ID is required'
      }), { status: 400 })
    }
    
    // SECURITY FIX: Detect authenticated real customers (not guest accounts)
    // Real customer IDs start with "cus_" and don't have "@guest.local"
    const isRealCustomer = customerId.startsWith('cus_') && !customerId.includes('@guest.local')
    
    if (isRealCustomer) {
      // For authenticated real customers, skip full sync to prevent duplicate account creation
      // The order/cart is already associated with their account during checkout
      try { 
        console.log('[SYNC_API][skip_authenticated_customer]', { 
          customerId, 
          reason: 'Real authenticated customer - no sync needed' 
        }) 
      } catch {}
      
      return new Response(JSON.stringify({
        ok: true,
        customerUpdated: false,
        skipped: true,
        reason: 'authenticated_customer',
        message: 'Sync skipped for authenticated customer - order linked to existing account',
        customerId,
        timestamp: Date.now(),
        duration: Date.now() - startedAt
      }), { status: 200 })
    }
    
    if (!formData || typeof formData !== 'object') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'invalid_form_data',
        message: 'Valid form data is required'
      }), { status: 400 })
    }
    
    // Validate required form fields
    if (!formData.first_name || typeof formData.first_name !== 'string' || formData.first_name.trim().length === 0) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'missing_required_fields',
        message: 'First name is required and must be a non-empty string'
      }), { status: 400 })
    }
    
    if (!formData.phone || typeof formData.phone !== 'string' || formData.phone.trim().length === 0) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'missing_required_fields',
        message: 'Phone number is required and must be a non-empty string'
      }), { status: 400 })
    }
    
    // Extract identifier from customerId based on authentication method
    let primaryIdentifier: string;
    let primaryPhone: string;
    
    if (identityMethod === 'email' || email_authenticated) {
      // For email authentication, customerId is the email address
      primaryIdentifier = customerId;
      primaryPhone = normalizePhoneNumber(formData.phone); // Use form phone as primary
      
    } else {
      // For WhatsApp/phone authentication, extract phone from customerId
      // customerId format: "919014711878@guest.local" 
      const whatsappPhone = customerId.replace('@guest.local', '');
      primaryIdentifier = whatsappPhone;
      primaryPhone = normalizePhoneNumber(whatsappPhone);
      
    }
    
    // Enhanced phone conflict detection based on authentication method
    const phoneConflictInfo: PhoneConflictInfo = {
      whatsappPhone: identityMethod === 'phone' ? primaryPhone : '',
      shippingPhone: normalizePhoneNumber(formData.phone),
      conflictDetected: identityMethod === 'phone' ? !arePhoneNumbersEquivalent(primaryIdentifier, formData.phone) : false,
      resolutionStrategy: identityMethod === 'phone' ? 'use_whatsapp' : 'use_shipping' // For email auth, use shipping phone
    };
    
    if (phoneConflictInfo.conflictDetected) {
      // VALID SCENARIO: User authenticated with one number but wants delivery to another
      // Example: Login with personal WhatsApp (917780104586) but deliver to office (917452675836)
      console.log('[SYNC_API][phone_difference_allowed]', {
        authPhone: phoneConflictInfo.whatsappPhone,
        shippingPhone: phoneConflictInfo.shippingPhone,
        reason: 'Different auth vs shipping phone is a valid use case'
      });
      // Do NOT treat this as an error - just log it for analytics
    }
    
    // Use appropriate phone based on authentication method
    const normalizedPhone = primaryPhone;
    
    // Validate the resolved primary phone
    if (!normalizedPhone || normalizedPhone.length < 12) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'invalid_phone_format',
        message: 'Phone number must be a valid Indian mobile number'
      }), { status: 400 })
    }
    
    // Validate address if provided
    if (formData.address) {
      const requiredAddressFields = ['address_1', 'city', 'postal_code'];
      for (const field of requiredAddressFields) {
        if (!formData.address[field] || typeof formData.address[field] !== 'string' || formData.address[field].trim().length === 0) {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'invalid_address_data',
            message: `Address field '${field}' is required and must be a non-empty string`
          }), { status: 400 })
        }
      }
      
      // Validate country code format if provided
      if (formData.address.country_code && formData.address.country_code.length !== 2) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'invalid_country_code',
          message: 'Country code must be a 2-character ISO code (e.g., "IN")'
        }), { status: 400 })
      }
      
      // Validate postal code format for India
      if (formData.address.postal_code && !/^\d{6}$/.test(formData.address.postal_code.trim())) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'invalid_postal_code',
          message: 'Postal code must be 6 digits for Indian addresses'
        }), { status: 400 })
      }
    }
    
    // Ensure customer is properly authenticated (either WhatsApp or email)
    if (!whatsapp_authenticated && !email_authenticated) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'customer_not_authenticated',
        message: 'Customer must be authenticated via WhatsApp or email',
        requires_authentication: true 
      }), { status: 400 })
    }
    
    
    // Initialize retry variables
    let lastError: Error | null = null
    let attempt = 0
    const maxRetries = 2
    
    // Enhanced backend configuration with fallbacks
    const BACKEND_URL = process.env.MEDUSA_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
    
    if (!PUBLISHABLE_KEY) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'missing_api_key',
        message: 'API configuration error'
      }), { status: 500 })
    }
    
    // Prepare update payload for backend /store/custom route with conflict resolution
    const updatePayload: any = {
      customer_id: customerId, // Pass customer ID so backend can detect authenticated users
      first_name: formData.first_name,
      last_name: formData.last_name || '',
      phone: normalizedPhone,
      whatsapp_authenticated: whatsapp_authenticated,
      email_authenticated: email_authenticated,
    }
    
    // Set email based on authentication method
    if (identityMethod === 'email' || email_authenticated) {
      // For email authentication, use the actual email from customerId
      updatePayload.email = customerId; // customerId is the email address for email auth
    } else {
      // For WhatsApp authentication, use placeholder email based on phone
      updatePayload.email = generatePlaceholderEmail(primaryPhone);
    }
    updatePayload.metadata = {
      checkout_sync_timestamp: Date.now(),
      last_order_form_sync: cartId,
      last_order_id: orderId,
      profile_source: 'checkout',
      phone: normalizedPhone,
      phone_normalized: normalizedPhone,
      whatsapp_authenticated: whatsapp_authenticated,
      email_authenticated: email_authenticated,
      identity_method: identityMethod,
      auth_timestamp: Date.now(),
      auth_source: 'customer_sync',
      sync_profile_source: 'checkout',
      sync_origin: 'order_completion',
      sync_attempts: 1,
      // Store shipping phone separately if different (for WhatsApp auth only)
      shipping_phone: phoneConflictInfo.conflictDetected ? formData.phone : undefined,
      shipping_phone_normalized: phoneConflictInfo.conflictDetected ? phoneConflictInfo.shippingPhone : undefined,
      // Enhanced conflict resolution metadata
      phone_conflict_info: phoneConflictInfo,
      duplicate_prevention: true,
      enhanced_sync: true
    };
    
    // Add address if provided, using shipping phone for the address itself
    if (formData.address) {
      updatePayload.addresses = [{
        first_name: formData.first_name,
        last_name: formData.last_name || '',
        address_1: formData.address.address_1,
        address_2: formData.address.address_2 || null, // Include address_2 field
        city: formData.address.city,
        postal_code: formData.address.postal_code,
        province: formData.address.province,
        country_code: formData.address.country_code || 'IN', // Default to India
        phone: formData.phone, // Use shipping phone for the address record
        metadata: {
          source: 'checkout',
          created_from_order: orderCreated,
          phone_conflict_resolved: phoneConflictInfo.conflictDetected,
          original_shipping_phone: formData.phone,
          customer_whatsapp_phone: primaryPhone,
          address_type: 'shipping'
        },
      }]
    }
    
    
    // Begin retry loop
    
    while (attempt <= maxRetries) {
      try {
        attempt++
        
        const res = await fetch(`${BACKEND_URL}/store/custom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-publishable-api-key': PUBLISHABLE_KEY
          },
          body: JSON.stringify({ ...updatePayload, cart_id: cartId, order_id: orderId }),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        })
        try { console.log('[SYNC_API][call_backend]', { status: res.status }) } catch {}
        
        const responseText = await res.text().catch(() => '')
        
        
        if (res.ok) {
          // Success! Parse the response
          let result
          try {
            result = JSON.parse(responseText)
          } catch {
            result = { customer: null }
          }
          
          try { 
            const counter = await getCounter({ 
              name: 'checkout_customer_sync_success_total', 
              help: 'Successful customer profile syncs from checkout' 
            })
            counter.inc()
          } catch {}
          
          
          return new Response(JSON.stringify({
            ok: true,
            customerUpdated: true,
            customer: result.customer,
            attempts: attempt,
            phoneConflictInfo,
            consolidationInfo: result.consolidation_info || null
          }), { status: 200 })
        }
        
        // Handle specific error cases
        if (res.status === 404) {
          // Customer not found - this is a permanent error, don't retry
          throw new Error(`Customer not found: ${customerId}`)
        }
        
        if (res.status === 400) {
          // Parse error response to check for WhatsApp authentication requirement
          let errorData = null;
          try {
            errorData = JSON.parse(responseText);
          } catch {}
          
          if (errorData?.requires_whatsapp_auth) {
            // This is a specific WhatsApp authentication error
            throw new Error('Customer must be WhatsApp authenticated to create account');
          }
          
          // Other bad request errors - likely permanent, don't retry
          throw new Error(`Invalid request: ${responseText}`);
        }
        
        if (res.status >= 500) {
          // Server error - might be temporary, can retry
          lastError = new Error(`Backend server error (${res.status}): ${responseText}`)
          if (attempt <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
            continue
          }
        }
        
        // Other errors
        throw new Error(`Backend update failed (${res.status}): ${responseText}`)
        
      } catch (error: any) {
        lastError = error
        
        // Don't retry on certain errors
        if (error.name === 'AbortError' || error.message.includes('Customer not found') || error.message.includes('Invalid request')) {
          break
        }
        
        if (attempt <= maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }
    
    // All attempts failed
    throw lastError || new Error('Unknown error during backend communication')
    
  } catch (error: any) {
    
    try { 
      const counter = await getCounter({ 
        name: 'checkout_customer_sync_failure_total', 
        help: 'Failed customer profile syncs from checkout' 
      })
      counter.inc()
    } catch {}
    
    // Categorize errors for better handling
    let errorType = 'sync_failed'
    let statusCode = 500
    
    if (error.message?.includes('Customer not found')) {
      errorType = 'customer_not_found'
      statusCode = 404
    } else if (error.message?.includes('WhatsApp authenticated')) {
      errorType = 'whatsapp_auth_required'
      statusCode = 400
    } else if (error.message?.includes('Invalid request') || error.message?.includes('missing_required_fields')) {
      errorType = 'invalid_request'
      statusCode = 400
    } else if (error.message?.includes('timeout') || error.name === 'AbortError') {
      errorType = 'timeout'
      statusCode = 408
    } else if (error.message?.includes('API configuration')) {
      errorType = 'configuration_error'
      statusCode = 500
    }
    
    try { console.log('[SYNC_API][error]', { error: error?.message }) } catch {}
    return new Response(JSON.stringify({
      ok: false,
      error: errorType,
      message: error.message || 'Customer sync failed',
      timestamp: Date.now(),
      duration: Date.now() - startedAt
    }), { status: statusCode })
  }
}