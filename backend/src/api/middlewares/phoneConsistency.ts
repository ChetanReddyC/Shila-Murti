/**
 * Phone Consistency Middleware
 * 
 * Detects and handles phone number conflicts in customer creation and update requests.
 * Provides early warning and conflict resolution for duplicate prevention.
 */

import { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { normalizePhoneNumber, arePhoneNumbersEquivalent } from "../../utils/phoneNormalization";

export interface PhoneConflictDetails {
  primary: string;
  shipping: string[];
  conflicts: boolean;
  conflictCount: number;
}

/**
 * Middleware to validate phone number consistency across request data.
 * Detects conflicts between primary phone and shipping address phones.
 */
export async function validatePhoneConsistency(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const { phone, addresses } = (req.body || {}) as { phone?: string; addresses?: any[] };

  if (phone && addresses?.length) {
    const primaryPhone = normalizePhoneNumber(phone);
    const shippingPhones = addresses
      .map((addr: any) => normalizePhoneNumber(addr.phone))
      .filter(Boolean);

    if (shippingPhones.length > 0) {
      // Check for phone number conflicts
      const conflicts = shippingPhones.filter(sp => !arePhoneNumbersEquivalent(sp, primaryPhone));
      const hasConflicts = conflicts.length > 0;

      if (hasConflicts) {
        console.warn('[PhoneConsistency] Phone number conflict detected:', {
          endpoint: req.path,
          primaryPhone,
          shippingPhones,
          conflicts,
          conflictCount: conflicts.length
        });

        // Add conflict resolution metadata to request
        req.phoneConflictDetected = true;
        req.phoneConflictDetails = {
          primary: primaryPhone,
          shipping: shippingPhones,
          conflicts: true,
          conflictCount: conflicts.length
        } as PhoneConflictDetails;

        // Log metrics for monitoring
        console.info('[Metrics] phone_conflict_detected_total++', {
          endpoint: req.path,
          conflictCount: conflicts.length
        });
      } else {
        // Consistent phone numbers
        req.phoneConflictDetected = false;
        req.phoneConflictDetails = {
          primary: primaryPhone,
          shipping: shippingPhones,
          conflicts: false,
          conflictCount: 0
        } as PhoneConflictDetails;

        console.log('[PhoneConsistency] Phone numbers are consistent:', {
          endpoint: req.path,
          primaryPhone,
          shippingPhones
        });
      }
    }
  }

  next();
}

/**
 * Middleware to enhance customer lookup based on phone conflict detection.
 * Should be used after validatePhoneConsistency middleware.
 */
export async function enhanceCustomerLookup(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (req.phoneConflictDetected && req.phoneConflictDetails) {
    console.log('[EnhanceCustomerLookup] Phone conflict detected, enabling enhanced lookup mode:', {
      endpoint: req.path,
      conflictDetails: req.phoneConflictDetails
    });

    // Add enhanced lookup flag to request
    req.enhancedLookupRequired = true;
    req.phoneNumbers = {
      primary: req.phoneConflictDetails.primary,
      shipping: req.phoneConflictDetails.shipping,
      all: [req.phoneConflictDetails.primary, ...req.phoneConflictDetails.shipping]
    };

    // Log enhanced lookup activation
    console.info('[Metrics] enhanced_lookup_activated_total++');
  }

  next();
}

/**
 * Combined middleware that applies both phone consistency validation and enhanced lookup.
 */
export async function phoneConsistencyMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  await validatePhoneConsistency(req, res, async () => {
    await enhanceCustomerLookup(req, res, next);
  });
}

// Extend MedusaRequest interface to include phone conflict properties
declare global {
  namespace Express {
    interface Request {
      phoneConflictDetected?: boolean;
      phoneConflictDetails?: PhoneConflictDetails;
      enhancedLookupRequired?: boolean;
      phoneNumbers?: {
        primary: string;
        shipping: string[];
        all: string[];
      };
    }
  }
}