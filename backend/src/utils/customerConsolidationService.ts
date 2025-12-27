/**
 * Customer Consolidation Service
 * 
 * Identifies and merges duplicate customer accounts based on phone numbers
 * and other identifying information. Handles data migration, order reassignment,
 * and maintains audit trails for consolidation operations.
 */

import { normalizePhoneNumber, arePhoneNumbersEquivalent } from './phoneNormalization';

export interface DuplicateCustomerGroup {
  normalizedPhone: string;
  customers: any[];
  primaryCustomer: any;
  duplicateCustomers: any[];
  totalOrders: number;
  totalAddresses: number;
}

export interface ConsolidationResult {
  success: boolean;
  primaryCustomerId: string;
  mergedCustomerIds: string[];
  ordersReassigned: number;
  addressesConsolidated: number;
  errorMessage?: string;
}

export interface ConsolidationLog {
  id: string;
  primary_customer_id: string;
  merged_customer_ids: string[];
  phone_normalized: string;
  consolidation_timestamp: Date;
  orders_reassigned: number;
  addresses_consolidated: number;
  metadata: any;
}

/**
 * Service for consolidating duplicate customer accounts
 */
export class CustomerConsolidationService {
  private customerModuleService: any;
  private orderModuleService: any;

  constructor(customerModuleService: any, orderModuleService?: any) {
    this.customerModuleService = customerModuleService;
    this.orderModuleService = orderModuleService;
  }

  /**
   * Finds all duplicate customer groups based on normalized phone numbers
   */
  async findDuplicateCustomerGroups(): Promise<DuplicateCustomerGroup[]> {
    console.log('[CustomerConsolidation] Starting duplicate detection scan...');

    try {
      // Get all customers with phone metadata
      const allCustomers = await this.customerModuleService.listCustomers({}, { take: 1000 });

      console.log(`[CustomerConsolidation] Analyzing ${allCustomers.length} customers for duplicates`);

      // Group customers by normalized phone
      const phoneGroups = new Map<string, any[]>();

      for (const customer of allCustomers) {
        const phoneNormalized = customer.metadata?.phone_normalized ||
          normalizePhoneNumber(customer.phone) ||
          normalizePhoneNumber(customer.metadata?.phone);

        if (phoneNormalized && phoneNormalized.length >= 12) {
          if (!phoneGroups.has(phoneNormalized)) {
            phoneGroups.set(phoneNormalized, []);
          }
          phoneGroups.get(phoneNormalized)!.push(customer);
        }
      }

      // Filter groups with duplicates
      const duplicateGroups: DuplicateCustomerGroup[] = [];

      for (const [normalizedPhone, customers] of phoneGroups.entries()) {
        if (customers.length > 1) {
          const primaryCustomer = this.selectPrimaryCustomer(customers);
          const duplicateCustomers = customers.filter(c => c.id !== primaryCustomer.id);

          console.log(`[CustomerConsolidation] Found duplicate group for phone ${normalizedPhone}:`, {
            totalCustomers: customers.length,
            primaryCustomerId: primaryCustomer.id,
            duplicateCustomerIds: duplicateCustomers.map(c => c.id)
          });

          duplicateGroups.push({
            normalizedPhone,
            customers,
            primaryCustomer,
            duplicateCustomers,
            totalOrders: 0, // Will be calculated during consolidation
            totalAddresses: customers.reduce((sum, c) => sum + (c.addresses?.length || 0), 0)
          });
        }
      }

      console.log(`[CustomerConsolidation] Found ${duplicateGroups.length} duplicate groups`);
      return duplicateGroups;

    } catch (error) {
      console.error('[CustomerConsolidation] Error finding duplicates:', error);
      throw error;
    }
  }

  /**
   * Consolidates a single duplicate customer group
   */
  async consolidateCustomerGroup(group: DuplicateCustomerGroup): Promise<ConsolidationResult> {
    console.log(`[CustomerConsolidation] Starting consolidation for phone ${group.normalizedPhone}`, {
      primaryCustomerId: group.primaryCustomer.id,
      duplicateCount: group.duplicateCustomers.length
    });

    try {
      const { primaryCustomer, duplicateCustomers } = group;

      // Step 1: Merge customer data
      const consolidatedData = await this.mergeCustomerData(primaryCustomer, duplicateCustomers);

      // Step 2: Update primary customer
      await this.customerModuleService.updateCustomers(primaryCustomer.id, consolidatedData);

      // Step 3: Reassign orders (if order service is available)
      let ordersReassigned = 0;
      if (this.orderModuleService) {
        ordersReassigned = await this.reassignOrdersToHistory(duplicateCustomers, primaryCustomer.id);
      }

      // Step 4: Consolidate addresses
      const addressesConsolidated = await this.consolidateAddresses(duplicateCustomers, primaryCustomer);

      // Step 5: Mark duplicate customers as consolidated
      await this.markCustomersAsConsolidated(duplicateCustomers, primaryCustomer.id);

      // Step 6: Log consolidation
      await this.logConsolidation({
        primary_customer_id: primaryCustomer.id,
        merged_customer_ids: duplicateCustomers.map(c => c.id),
        phone_normalized: group.normalizedPhone,
        orders_reassigned: ordersReassigned,
        addresses_consolidated: addressesConsolidated
      });

      console.log(`[CustomerConsolidation] Successfully consolidated group for phone ${group.normalizedPhone}`, {
        primaryCustomerId: primaryCustomer.id,
        mergedCount: duplicateCustomers.length,
        ordersReassigned,
        addressesConsolidated
      });

      return {
        success: true,
        primaryCustomerId: primaryCustomer.id,
        mergedCustomerIds: duplicateCustomers.map(c => c.id),
        ordersReassigned,
        addressesConsolidated
      };

    } catch (error) {
      console.error(`[CustomerConsolidation] Failed to consolidate group for phone ${group.normalizedPhone}:`, error);

      return {
        success: false,
        primaryCustomerId: group.primaryCustomer.id,
        mergedCustomerIds: [],
        ordersReassigned: 0,
        addressesConsolidated: 0,
        errorMessage: error.message
      };
    }
  }

  /**
   * Consolidates all duplicate customer groups
   */
  async consolidateAllDuplicates(): Promise<{
    totalGroups: number;
    successfulConsolidations: number;
    failedConsolidations: number;
    results: ConsolidationResult[];
  }> {
    console.log('[CustomerConsolidation] Starting full consolidation process...');

    const duplicateGroups = await this.findDuplicateCustomerGroups();
    const results: ConsolidationResult[] = [];

    let successfulConsolidations = 0;
    let failedConsolidations = 0;

    for (const group of duplicateGroups) {
      try {
        const result = await this.consolidateCustomerGroup(group);
        results.push(result);

        if (result.success) {
          successfulConsolidations++;
        } else {
          failedConsolidations++;
        }

        // Add delay between consolidations to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`[CustomerConsolidation] Failed to process group:`, error);
        failedConsolidations++;

        results.push({
          success: false,
          primaryCustomerId: group.primaryCustomer.id,
          mergedCustomerIds: [],
          ordersReassigned: 0,
          addressesConsolidated: 0,
          errorMessage: error.message
        });
      }
    }

    console.log('[CustomerConsolidation] Consolidation process completed:', {
      totalGroups: duplicateGroups.length,
      successfulConsolidations,
      failedConsolidations
    });

    return {
      totalGroups: duplicateGroups.length,
      successfulConsolidations,
      failedConsolidations,
      results
    };
  }

  /**
   * Selects the primary customer from a group of duplicates
   * Priority: WhatsApp authenticated > earliest creation > has orders
   */
  private selectPrimaryCustomer(customers: any[]): any {
    // Sort by priority
    return customers.sort((a, b) => {
      // 1. WhatsApp authenticated customers take priority
      const aWhatsApp = a.metadata?.whatsapp_authenticated || false;
      const bWhatsApp = b.metadata?.whatsapp_authenticated || false;

      if (aWhatsApp && !bWhatsApp) return -1;
      if (!aWhatsApp && bWhatsApp) return 1;

      // 2. Earlier creation date takes priority
      const aCreated = new Date(a.created_at || 0);
      const bCreated = new Date(b.created_at || 0);

      if (aCreated.getTime() !== bCreated.getTime()) {
        return aCreated.getTime() - bCreated.getTime();
      }

      // 3. Customer with more complete data takes priority
      const aDataScore = this.calculateDataCompletenessScore(a);
      const bDataScore = this.calculateDataCompletenessScore(b);

      return bDataScore - aDataScore;
    })[0];
  }

  /**
   * Calculates a completeness score for customer data
   */
  private calculateDataCompletenessScore(customer: any): number {
    let score = 0;

    if (customer.first_name) score += 1;
    if (customer.last_name) score += 1;
    if (customer.phone) score += 1;
    if (customer.email && !customer.email.includes('@guest.local')) score += 2;
    if (customer.addresses?.length > 0) score += customer.addresses.length;
    if (customer.metadata?.whatsapp_authenticated) score += 2;

    return score;
  }

  /**
   * Merges customer data from duplicates into the primary customer
   */
  private async mergeCustomerData(primaryCustomer: any, duplicateCustomers: any[]): Promise<any> {
    const mergedData: any = {
      // Keep primary customer's basic info but allow enhancement
      first_name: primaryCustomer.first_name,
      last_name: primaryCustomer.last_name,
      phone: primaryCustomer.phone,
      email: primaryCustomer.email, // Include email in base structure

      metadata: {
        ...(primaryCustomer.metadata || {}),
        // Track consolidation
        consolidated_accounts: duplicateCustomers.map(c => c.id),
        consolidation_timestamp: new Date().toISOString(),
        data_sources: [
          primaryCustomer.id,
          ...duplicateCustomers.map(c => c.id)
        ],
        unified_phone_lookup: true,
        duplicate_prevention: true,

        // Preserve WhatsApp authentication from any source
        whatsapp_authenticated: [primaryCustomer, ...duplicateCustomers]
          .some(c => c.metadata?.whatsapp_authenticated),

        // Use earliest auth timestamp
        auth_timestamp: [primaryCustomer, ...duplicateCustomers]
          .map(c => c.metadata?.auth_timestamp)
          .filter(Boolean)
          .sort()[0] || new Date().toISOString()
      }
    };

    // Enhance with better data from duplicates if available
    for (const duplicate of duplicateCustomers) {
      // Use real email if primary has placeholder email
      if (primaryCustomer.email?.includes('@guest.local') &&
        duplicate.email && !duplicate.email.includes('@guest.local')) {
        mergedData.email = duplicate.email;
      }

      // Use better name if available
      if (!primaryCustomer.last_name && duplicate.last_name) {
        mergedData.last_name = duplicate.last_name;
      }
    }

    return mergedData;
  }

  /**
   * Reassigns orders from duplicate customers to primary customer
   */
  private async reassignOrdersToHistory(duplicateCustomers: any[], primaryCustomerId: string): Promise<number> {
    if (!this.orderModuleService) {
      console.log('[CustomerConsolidation] Order service not available, skipping order reassignment');
      return 0;
    }

    let totalReassigned = 0;

    for (const duplicate of duplicateCustomers) {
      try {
        // Note: This is a placeholder - actual implementation depends on Medusa v2 order API
        console.log(`[CustomerConsolidation] Would reassign orders from ${duplicate.id} to ${primaryCustomerId}`);
        // const orders = await this.orderModuleService.listOrders({ customer_id: duplicate.id });
        // for (const order of orders) {
        //   await this.orderModuleService.updateOrders(order.id, { customer_id: primaryCustomerId });
        //   totalReassigned++;
        // }
      } catch (error) {
        console.error(`[CustomerConsolidation] Failed to reassign orders for customer ${duplicate.id}:`, error);
      }
    }

    return totalReassigned;
  }

  /**
   * Consolidates addresses from duplicate customers
   */
  private async consolidateAddresses(duplicateCustomers: any[], primaryCustomer: any): Promise<number> {
    let addressesConsolidated = 0;

    // Collect unique addresses from all duplicates
    const existingAddresses = primaryCustomer.addresses || [];
    const newAddresses: any[] = [];

    for (const duplicate of duplicateCustomers) {
      if (duplicate.addresses?.length > 0) {
        for (const address of duplicate.addresses) {
          // Check if this address is already in primary customer's addresses
          const isDuplicate = existingAddresses.some((existing: any) =>
            this.areAddressesSimilar(existing, address)
          );

          if (!isDuplicate) {
            newAddresses.push({
              ...address,
              metadata: {
                ...(address.metadata || {}),
                migrated_from_customer: duplicate.id,
                consolidation_timestamp: new Date().toISOString()
              }
            });
            addressesConsolidated++;
          }
        }
      }
    }

    if (newAddresses.length > 0) {
      // Add consolidated addresses to primary customer
      const updatedAddresses = [...existingAddresses, ...newAddresses];
      await this.customerModuleService.updateCustomers(primaryCustomer.id, {
        addresses: updatedAddresses
      });
    }

    return addressesConsolidated;
  }

  /**
   * Checks if two addresses are similar enough to be considered duplicates
   */
  private areAddressesSimilar(address1: any, address2: any): boolean {
    const normalize = (str: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

    return (
      normalize(address1.address_1) === normalize(address2.address_1) &&
      normalize(address1.city) === normalize(address2.city) &&
      normalize(address1.postal_code) === normalize(address2.postal_code)
    );
  }

  /**
   * Marks duplicate customers as consolidated
   */
  private async markCustomersAsConsolidated(duplicateCustomers: any[], primaryCustomerId: string): Promise<void> {
    for (const duplicate of duplicateCustomers) {
      try {
        await this.customerModuleService.updateCustomers(duplicate.id, {
          metadata: {
            ...(duplicate.metadata || {}),
            consolidated_into: primaryCustomerId,
            consolidation_timestamp: new Date().toISOString(),
            account_status: 'consolidated',
            original_email: duplicate.email
          }
        });
      } catch (error) {
        console.error(`[CustomerConsolidation] Failed to mark customer ${duplicate.id} as consolidated:`, error);
      }
    }
  }

  /**
   * Logs the consolidation operation for audit purposes
   */
  private async logConsolidation(logData: Omit<ConsolidationLog, 'id' | 'consolidation_timestamp' | 'metadata'>): Promise<void> {
    const log: ConsolidationLog = {
      id: `consolidation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...logData,
      consolidation_timestamp: new Date(),
      metadata: {
        service_version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    console.log('[CustomerConsolidation] Logging consolidation:', log);

    // In a real implementation, this would be stored in a dedicated consolidation log table
    // For now, we'll just log it to console and potentially store in customer metadata
  }
}

/**
 * Factory function to create a customer consolidation service
 */
export function createCustomerConsolidationService(
  customerModuleService: any,
  orderModuleService?: any
): CustomerConsolidationService {
  return new CustomerConsolidationService(customerModuleService, orderModuleService);
}