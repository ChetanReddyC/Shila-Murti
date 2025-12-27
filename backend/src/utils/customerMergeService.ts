/**
 * Customer Merge Service
 * 
 * Detects and handles duplicate customer accounts to prevent account proliferation.
 * Provides confidence scoring and merge functionality for duplicate customers.
 */

import { normalizePhoneToCanonical, generateCanonicalCustomerId } from './phoneNormalization';

export interface DuplicateCustomer {
  customerId: string;
  confidence: number;
  matchedOn: ('phone' | 'email' | 'name' | 'address')[];
}

export interface DuplicateDetectionResult {
  hasDuplicates: boolean;
  duplicates: DuplicateCustomer[];
  primaryCustomerId?: string;
}

/**
 * Customer Merge Service
 * 
 * Provides functionality to detect and handle duplicate customer accounts.
 */
export class CustomerMergeService {
  private customerModuleService: any;

  constructor(customerModuleService: any) {
    this.customerModuleService = customerModuleService;
  }

  /**
   * Detects potential duplicate customers based on phone, email, name, and address.
   * 
   * @param customer - Customer to check for duplicates
   * @returns Detection result with list of duplicates and confidence scores
   */
  async detectDuplicateCustomers(customer: {
    id?: string;
    phone?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  }): Promise<DuplicateDetectionResult> {
    const duplicates: DuplicateCustomer[] = [];

    try {
      // Get canonical phone for comparison
      let canonicalPhone: string | null = null;
      try {
        if (customer.phone) {
          canonicalPhone = normalizePhoneToCanonical(customer.phone);
        }
      } catch {
        // Invalid phone format, skip phone matching
      }

      // Find all customers
      const allCustomers = await this.customerModuleService.listCustomers({}, { take: 500 });

      for (const existingCustomer of allCustomers) {
        // Skip self
        if (customer.id && existingCustomer.id === customer.id) {
          continue;
        }

        const confidence = this.calculateDuplicateConfidence(customer, existingCustomer, canonicalPhone);

        // Consider it a duplicate if confidence > 70%
        if (confidence >= 0.7) {
          const matchedOn: ('phone' | 'email' | 'name' | 'address')[] = [];

          // Determine what matched
          if (canonicalPhone && this.phonesMatch(canonicalPhone, existingCustomer.phone, existingCustomer.metadata?.phone_canonical)) {
            matchedOn.push('phone');
          }
          if (customer.email && this.emailsMatch(customer.email, existingCustomer.email)) {
            matchedOn.push('email');
          }
          if (customer.first_name && this.namesMatch(customer.first_name, customer.last_name, existingCustomer.first_name, existingCustomer.last_name)) {
            matchedOn.push('name');
          }

          duplicates.push({
            customerId: existingCustomer.id,
            confidence,
            matchedOn
          });
        }
      }

      // Sort by confidence (highest first)
      duplicates.sort((a, b) => b.confidence - a.confidence);

      return {
        hasDuplicates: duplicates.length > 0,
        duplicates,
        primaryCustomerId: duplicates.length > 0 ? duplicates[0].customerId : undefined
      };
    } catch (error) {
      console.error('[CustomerMergeService] Error detecting duplicates:', error);
      return {
        hasDuplicates: false,
        duplicates: []
      };
    }
  }

  /**
   * Calculates confidence score (0-1) that two customers are duplicates.
   * 
   * @param customer1 - First customer
   * @param customer2 - Second customer
   * @param canonicalPhone - Pre-calculated canonical phone for customer1
   * @returns Confidence score (0.0 to 1.0)
   */
  private calculateDuplicateConfidence(
    customer1: { phone?: string; email?: string; first_name?: string; last_name?: string },
    customer2: any,
    canonicalPhone: string | null
  ): number {
    let score = 0;

    // Exact email match = 100% confidence (strongest signal)
    if (customer1.email && customer2.email && this.emailsMatch(customer1.email, customer2.email)) {
      return 1.0;
    }

    // Canonical phone match = 90% confidence (very strong signal)
    if (canonicalPhone && this.phonesMatch(canonicalPhone, customer2.phone, customer2.metadata?.phone_canonical)) {
      score += 0.9;
    }

    // Same name = +5% confidence
    if (customer1.first_name && customer2.first_name && this.namesMatch(customer1.first_name, customer1.last_name, customer2.first_name, customer2.last_name)) {
      score += 0.05;
    }

    // Guest email match on same phone = +5% confidence
    if (customer1.email?.includes('@guest.local') && customer2.email?.includes('@guest.local')) {
      const phone1 = customer1.email.replace('@guest.local', '');
      const phone2 = customer2.email.replace('@guest.local', '');
      if (phone1 === phone2) {
        score += 0.05;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Checks if two phones match using canonical format.
   */
  private phonesMatch(canonicalPhone: string, otherPhone?: string, otherPhoneCanonical?: string): boolean {
    try {
      // Check against stored canonical phone in metadata
      if (otherPhoneCanonical === canonicalPhone) {
        return true;
      }

      // Check against phone field
      if (otherPhone) {
        const otherCanonical = normalizePhoneToCanonical(otherPhone);
        return otherCanonical === canonicalPhone;
      }
    } catch {
      // Invalid phone format
    }

    return false;
  }

  /**
   * Checks if two emails match (case-insensitive).
   */
  private emailsMatch(email1: string, email2: string): boolean {
    return email1.toLowerCase().trim() === email2.toLowerCase().trim();
  }

  /**
   * Checks if two names match.
   */
  private namesMatch(firstName1: string, lastName1: string | undefined, firstName2: string, lastName2: string): boolean {
    const first1 = firstName1.toLowerCase().trim();
    const first2 = firstName2.toLowerCase().trim();
    const last1 = (lastName1 || '').toLowerCase().trim();
    const last2 = (lastName2 || '').toLowerCase().trim();

    return first1 === first2 && last1 === last2;
  }

  /**
   * Finds the best existing customer to use (highest confidence duplicate).
   * 
   * @param phone - Phone number to search for
   * @param email - Email to search for
   * @returns Best matching customer or null
   */
  async findBestExistingCustomer(phone?: string, email?: string): Promise<any | null> {
    if (!phone && !email) {
      return null; // Need at least one identifier
    }

    try {
      const detectionResult = await this.detectDuplicateCustomers({ phone, email });


      if (detectionResult.hasDuplicates && detectionResult.primaryCustomerId) {
        // Return the highest confidence match
        const [bestMatch] = await this.customerModuleService.listCustomers(
          { id: detectionResult.primaryCustomerId },
          { take: 1 }
        );

        if (bestMatch) {
          return bestMatch;
        }
      }
    } catch (error) {
      console.error('[CustomerMergeService] Error finding best existing customer:', error);
    }

    return null;
  }

  /**
   * Checks if creating a new customer would result in a duplicate.
   * 
   * @param phone - Phone number of new customer
   * @param email - Email of new customer
   * @returns True if duplicate would be created
   */
  async wouldCreateDuplicate(phone: string, email?: string): Promise<boolean> {
    const detectionResult = await this.detectDuplicateCustomers({ phone, email });
    return detectionResult.hasDuplicates;
  }
}

/**
 * Factory function to create a customer merge service instance.
 */
export function createCustomerMergeService(customerModuleService: any): CustomerMergeService {
  return new CustomerMergeService(customerModuleService);
}
