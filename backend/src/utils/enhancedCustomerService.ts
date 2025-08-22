/**
 * Enhanced Customer Service
 * 
 * Provides advanced customer lookup, deduplication, and consolidation functionality
 * to prevent duplicate customer accounts during checkout and profile updates.
 */

import { normalizePhoneNumber, generatePlaceholderEmail, arePhoneNumbersEquivalent, generatePhoneVariations } from './phoneNormalization';

export interface CustomerLookupRequest {
  phone: string;
  email?: string;
  whatsapp_authenticated: boolean;
  first_name: string;
  last_name?: string;
}

export interface CustomerLookupResult {
  customer: any | null;
  lookupStrategy: 'email_match' | 'phone_metadata' | 'phone_field' | 'phone_variation' | 'new_customer';
  conflictDetected: boolean;
  phoneConflicts?: string[];
  consolidationRequired: boolean;
}

export interface CustomerConsolidationInfo {
  strategy_used: string;
  existing_customer_found: boolean;
  phone_conflicts_resolved: number;
  duplicates_merged?: string[];
}

/**
 * Enhanced customer lookup service that implements multiple strategies
 * to find existing customers and prevent duplicates.
 */
export class EnhancedCustomerService {
  private customerModuleService: any;

  constructor(customerModuleService: any) {
    this.customerModuleService = customerModuleService;
  }

  /**
   * Performs multi-level customer lookup using various strategies.
   * Implements the enhanced lookup algorithm from the design document.
   */
  async findCustomerWithEnhancedLookup(request: CustomerLookupRequest): Promise<CustomerLookupResult> {
    const normalizedPhone = normalizePhoneNumber(request.phone);
    const effectiveEmail = request.email || generatePlaceholderEmail(request.phone);
    
    console.log('[EnhancedCustomerService] Starting enhanced lookup:', {
      normalizedPhone,
      effectiveEmail,
      whatsapp_authenticated: request.whatsapp_authenticated
    });

    // Strategy 1: Exact email match
    const emailResult = await this.lookupByEmail(effectiveEmail);
    if (emailResult.customer) {
      console.log('[EnhancedCustomerService] Found customer by email match');
      return {
        customer: emailResult.customer,
        lookupStrategy: 'email_match',
        conflictDetected: this.detectPhoneConflict(emailResult.customer, normalizedPhone),
        phoneConflicts: this.getPhoneConflicts(emailResult.customer, normalizedPhone),
        consolidationRequired: false
      };
    }

    // Strategy 2: Phone metadata lookup
    const phoneMetadataResult = await this.lookupByPhoneMetadata(normalizedPhone);
    if (phoneMetadataResult.customer) {
      console.log('[EnhancedCustomerService] Found customer by phone metadata');
      return {
        customer: phoneMetadataResult.customer,
        lookupStrategy: 'phone_metadata',
        conflictDetected: false,
        consolidationRequired: emailResult.customer ? true : false
      };
    }

    // Strategy 3: Legacy phone field lookup
    const phoneFieldResult = await this.lookupByPhoneField(normalizedPhone);
    if (phoneFieldResult.customer) {
      console.log('[EnhancedCustomerService] Found customer by phone field');
      return {
        customer: phoneFieldResult.customer,
        lookupStrategy: 'phone_field',
        conflictDetected: false,
        consolidationRequired: false
      };
    }

    // Strategy 4: Phone variation lookup for WhatsApp authenticated customers
    if (request.whatsapp_authenticated) {
      const variationResult = await this.lookupByPhoneVariations(normalizedPhone);
      if (variationResult.customer) {
        console.log('[EnhancedCustomerService] Found customer by phone variation');
        return {
          customer: variationResult.customer,
          lookupStrategy: 'phone_variation',
          conflictDetected: true,
          phoneConflicts: [normalizedPhone],
          consolidationRequired: true
        };
      }
    }

    // No existing customer found
    console.log('[EnhancedCustomerService] No existing customer found, will create new');
    return {
      customer: null,
      lookupStrategy: 'new_customer',
      conflictDetected: false,
      consolidationRequired: false
    };
  }

  /**
   * Creates or updates customer with enhanced metadata and conflict resolution.
   */
  async findOrCreateCustomer(request: CustomerLookupRequest): Promise<{ customer: any; consolidationInfo: CustomerConsolidationInfo }> {
    const lookupResult = await this.findCustomerWithEnhancedLookup(request);
    
    if (lookupResult.customer) {
      // Update existing customer with consolidation
      const updatedCustomer = await this.updateCustomerWithConsolidation(lookupResult.customer, request, lookupResult);
      
      return {
        customer: updatedCustomer,
        consolidationInfo: {
          strategy_used: lookupResult.lookupStrategy,
          existing_customer_found: true,
          phone_conflicts_resolved: lookupResult.phoneConflicts?.length || 0
        }
      };
    } else {
      // Create new customer with enhanced metadata
      const newCustomer = await this.createNewCustomerWithMetadata(request);
      
      return {
        customer: newCustomer,
        consolidationInfo: {
          strategy_used: 'new_customer',
          existing_customer_found: false,
          phone_conflicts_resolved: 0
        }
      };
    }
  }

  private async lookupByEmail(email: string): Promise<{ customer: any | null }> {
    try {
      const [customer] = await this.customerModuleService.listCustomers(
        { email },
        { take: 1 }
      );
      return { customer: customer || null };
    } catch (error) {
      console.error('[EnhancedCustomerService] Email lookup error:', error);
      return { customer: null };
    }
  }

  private async lookupByPhoneMetadata(normalizedPhone: string): Promise<{ customer: any | null }> {
    try {
      const customers = await this.customerModuleService.listCustomers({}, { take: 100 });
      
      const matchingCustomer = customers.find((customer: any) => 
        customer.metadata?.phone_normalized === normalizedPhone ||
        customer.metadata?.phone === normalizedPhone
      );
      
      return { customer: matchingCustomer || null };
    } catch (error) {
      console.error('[EnhancedCustomerService] Phone metadata lookup error:', error);
      return { customer: null };
    }
  }

  private async lookupByPhoneField(normalizedPhone: string): Promise<{ customer: any | null }> {
    try {
      const [customer] = await this.customerModuleService.listCustomers(
        { phone: normalizedPhone },
        { take: 1 }
      );
      return { customer: customer || null };
    } catch (error) {
      console.error('[EnhancedCustomerService] Phone field lookup error:', error);
      return { customer: null };
    }
  }

  private async lookupByPhoneVariations(normalizedPhone: string): Promise<{ customer: any | null }> {
    try {
      const variations = generatePhoneVariations(normalizedPhone);
      const customers = await this.customerModuleService.listCustomers({}, { take: 200 });
      
      const matchingCustomer = customers.find((customer: any) => {
        if (!customer.metadata?.whatsapp_authenticated) return false;
        
        const customerPhone = customer.metadata?.phone_normalized || customer.phone;
        return variations.some(variation => arePhoneNumbersEquivalent(customerPhone, variation));
      });
      
      return { customer: matchingCustomer || null };
    } catch (error) {
      console.error('[EnhancedCustomerService] Phone variation lookup error:', error);
      return { customer: null };
    }
  }

  private detectPhoneConflict(customer: any, newPhone: string): boolean {
    const existingPhone = customer.metadata?.phone_normalized || customer.phone;
    return !arePhoneNumbersEquivalent(existingPhone, newPhone);
  }

  private getPhoneConflicts(customer: any, newPhone: string): string[] {
    const conflicts: string[] = [];
    const existingPhone = customer.metadata?.phone_normalized || customer.phone;
    
    if (existingPhone && !arePhoneNumbersEquivalent(existingPhone, newPhone)) {
      conflicts.push(existingPhone);
    }
    
    return conflicts;
  }

  private async updateCustomerWithConsolidation(
    existingCustomer: any, 
    request: CustomerLookupRequest, 
    lookupResult: CustomerLookupResult
  ): Promise<any> {
    const normalizedPhone = normalizePhoneNumber(request.phone);
    
    const updatePayload = {
      first_name: request.first_name || existingCustomer.first_name,
      last_name: request.last_name || existingCustomer.last_name,
      phone: request.phone || existingCustomer.phone,
      has_account: request.whatsapp_authenticated || existingCustomer.has_account || false, // Ensure WhatsApp authenticated customers are marked as registered
      metadata: {
        ...(existingCustomer.metadata || {}),
        phone: request.phone,
        phone_normalized: normalizedPhone,
        last_updated: new Date().toISOString(),
        update_source: 'enhanced_lookup',
        whatsapp_authenticated: request.whatsapp_authenticated || existingCustomer.metadata?.whatsapp_authenticated || false,
        auth_timestamp: existingCustomer.metadata?.auth_timestamp || new Date().toISOString(),
        unified_phone_lookup: true,
        consolidation_timestamp: new Date().toISOString(),
        duplicate_prevention: true,
        lookup_strategy_used: lookupResult.lookupStrategy,
        phone_conflicts_resolved: lookupResult.phoneConflicts?.length || 0
      }
    };

    console.log('[EnhancedCustomerService] Updating customer with consolidation:', {
      customerId: existingCustomer.id,
      lookupStrategy: lookupResult.lookupStrategy,
      phoneConflictsResolved: lookupResult.phoneConflicts?.length || 0
    });

    return await this.customerModuleService.updateCustomers(existingCustomer.id, updatePayload);
  }

  private async createNewCustomerWithMetadata(request: CustomerLookupRequest): Promise<any> {
    const normalizedPhone = normalizePhoneNumber(request.phone);
    const effectiveEmail = request.email || generatePlaceholderEmail(request.phone);
    
    const customerData = {
      first_name: request.first_name || "Customer",
      last_name: request.last_name || "",
      email: effectiveEmail,
      phone: request.phone,
      has_account: request.whatsapp_authenticated, // Mark WhatsApp authenticated customers as registered accounts
      metadata: {
        phone: request.phone,
        phone_normalized: normalizedPhone,
        created_via: 'enhanced_customer_service',
        creation_timestamp: new Date().toISOString(),
        profile_source: request.whatsapp_authenticated ? 'whatsapp_authenticated' : 'checkout',
        whatsapp_authenticated: request.whatsapp_authenticated,
        auth_timestamp: new Date().toISOString(),
        unified_phone_lookup: true,
        duplicate_prevention: true,
        auth_source: 'customer_creation'
      }
    };

    console.log('[EnhancedCustomerService] Creating new customer with enhanced metadata:', {
      email: effectiveEmail,
      phone: request.phone,
      normalizedPhone,
      whatsappAuthenticated: request.whatsapp_authenticated
    });

    // Note: This assumes the caller will handle the actual customer creation workflow
    return customerData;
  }
}

/**
 * Factory function to create an enhanced customer service instance.
 */
export function createEnhancedCustomerService(customerModuleService: any): EnhancedCustomerService {
  return new EnhancedCustomerService(customerModuleService);
}