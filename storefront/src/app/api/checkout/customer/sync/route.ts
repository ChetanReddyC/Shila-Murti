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
    const { customerId, cartId, formData, orderCreated, whatsapp_authenticated = false } = body
    
    // Enhanced input validation
    if (!customerId || typeof customerId !== 'string') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'invalid_customer_id',
        message: 'Valid customer ID is required'
      }), { status: 400 })
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
    
    // CRITICAL FIX: Extract WhatsApp phone from customerId to ensure we update the correct customer
    // customerId format: "919014711878@guest.local" 
    const whatsappPhone = customerId.replace('@guest.local', '');
    const whatsappPhoneNormalized = normalizePhoneNumber(whatsappPhone);
    
    console.log('[CustomerSync] WhatsApp customer identification:', {
      customerId,
      whatsappPhone,
      whatsappPhoneNormalized,
      shippingPhone: formData.phone,
      phoneConflictDetected: !arePhoneNumbersEquivalent(whatsappPhone, formData.phone)
    });
    
    // Enhanced phone conflict detection using WhatsApp phone as primary
    const phoneConflictInfo: PhoneConflictInfo = {
      whatsappPhone: whatsappPhoneNormalized,
      shippingPhone: normalizePhoneNumber(formData.phone),
      conflictDetected: !arePhoneNumbersEquivalent(whatsappPhone, formData.phone),
      resolutionStrategy: 'use_whatsapp' // Always use WhatsApp phone for customer identification
    };
    
    if (phoneConflictInfo.conflictDetected) {
      console.warn('[CustomerSync] Phone number conflict detected - will update WhatsApp customer with shipping address:', {
        whatsappPhone: phoneConflictInfo.whatsappPhone,
        shippingPhone: phoneConflictInfo.shippingPhone,
        resolutionStrategy: phoneConflictInfo.resolutionStrategy
      });
      
      // Log conflict metrics
      console.info('[Metrics] customer_sync_phone_conflict_detected++');
    }
    
    // CRITICAL: Use WhatsApp phone for customer identification, NOT shipping phone
    const primaryPhone = phoneConflictInfo.whatsappPhone;
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
    }
    
    // Ensure customer is WhatsApp authenticated
    if (!whatsapp_authenticated) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'customer_not_whatsapp_authenticated',
        message: 'Customer must be WhatsApp authenticated',
        requires_whatsapp_auth: true 
      }), { status: 400 })
    }
    
    console.log('[CustomerSync] Starting sync for customer:', customerId, {
      formData: {
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        hasAddress: !!formData.address,
        addressDetails: formData.address ? {
          address_1: formData.address.address_1,
          city: formData.address.city,
          postal_code: formData.address.postal_code,
          province: formData.address.province
        } : null
      },
      whatsapp_authenticated
    })
    
    // Initialize retry variables
    let lastError: Error | null = null
    let attempt = 0
    const maxRetries = 2
    
    // Enhanced backend configuration with fallbacks
    const BACKEND_URL = process.env.MEDUSA_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000'
    const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
    
    if (!PUBLISHABLE_KEY) {
      console.error('[CustomerSync] Missing publishable API key')
      return new Response(JSON.stringify({
        ok: false,
        error: 'missing_api_key',
        message: 'API configuration error'
      }), { status: 500 })
    }
    
    // Prepare update payload for backend /store/custom route with conflict resolution
    const updatePayload: any = {
      first_name: formData.first_name,
      last_name: formData.last_name || '',
      phone: primaryPhone, // Use WhatsApp phone for customer identification
      whatsapp_authenticated: true, // Mark this as a WhatsApp authenticated customer
    }
    
    // CRITICAL: Use WhatsApp phone for email generation to find existing customer
    updatePayload.email = generatePlaceholderEmail(primaryPhone); // This will be 919014711878@guest.local
    updatePayload.metadata = {
      checkout_sync_timestamp: Date.now(),
      last_order_form_sync: cartId,
      profile_source: 'checkout',
      phone: primaryPhone, // Store WhatsApp phone as primary
      phone_normalized: normalizedPhone,
      whatsapp_authenticated: true,
      auth_timestamp: Date.now(),
      auth_source: 'customer_sync',
      sync_profile_source: 'checkout',
      sync_origin: 'order_completion',
      sync_attempts: 1,
      // Store shipping phone separately if different
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
        city: formData.address.city,
        postal_code: formData.address.postal_code,
        province: formData.address.province,
        country_code: formData.address.country_code,
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
    
    console.log('[CustomerSync] Calling backend with complete payload:', {
      endpoint: `${BACKEND_URL}/store/custom`,
      payload: updatePayload,
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': PUBLISHABLE_KEY ? 'present' : 'missing'
      }
    })
    
    // Begin retry loop
    
    while (attempt <= maxRetries) {
      try {
        attempt++
        console.log(`[CustomerSync] Backend call attempt ${attempt}/${maxRetries + 1}`)
        
        const res = await fetch(`${BACKEND_URL}/store/custom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-publishable-api-key': PUBLISHABLE_KEY
          },
          body: JSON.stringify(updatePayload),
          signal: AbortSignal.timeout(15000) // 15 second timeout
        })
        
        const responseText = await res.text().catch(() => '')
        
        console.log('[CustomerSync] Backend response:', {
          attempt,
          ok: res.ok,
          status: res.status,
          response: responseText
        })
        
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
          
          console.log('[CustomerSync] Sync completed successfully:', result)
          
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
            console.log(`[CustomerSync] Retrying after server error (attempt ${attempt}/${maxRetries + 1})`)
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
          console.log(`[CustomerSync] Retrying after error: ${error.message} (attempt ${attempt}/${maxRetries + 1})`)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }
    
    // All attempts failed
    throw lastError || new Error('Unknown error during backend communication')
    
  } catch (error: any) {
    console.error('[CustomerSync] Sync failed:', error)
    
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
    
    return new Response(JSON.stringify({
      ok: false,
      error: errorType,
      message: error.message || 'Customer sync failed',
      timestamp: Date.now(),
      duration: Date.now() - startedAt
    }), { status: statusCode })
  }
}