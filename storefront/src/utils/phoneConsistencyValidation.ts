/**
 * Phone Consistency Validation for Frontend Checkout
 * 
 * Provides validation and conflict detection for phone numbers during checkout
 * to prevent duplicate customer accounts and provide user feedback.
 */

import { normalizePhoneNumber, arePhoneNumbersEquivalent, formatPhoneForDisplay } from './phoneNormalization';

export interface PhoneConsistencyResult {
  isConsistent: boolean;
  recommendedAction: 'proceed' | 'warn_user' | 'require_confirmation';
  conflictDetails?: {
    whatsappNormalized: string;
    shippingNormalized: string;
    whatsappDisplay: string;
    shippingDisplay: string;
    potentialDuplicate: boolean;
  };
  warningMessage?: string;
  userFriendlyMessage?: string;
}

export interface CheckoutFormValidation {
  whatsappPhone: string;
  shippingPhone: string;
  firstName: string;
  lastName?: string;
}

/**
 * Validates phone consistency between WhatsApp authentication and shipping address.
 * Provides recommendations for user experience and duplicate prevention.
 */
export function validatePhoneConsistency(
  whatsappPhone: string,
  shippingPhone: string
): PhoneConsistencyResult {
  if (!whatsappPhone || !shippingPhone) {
    return {
      isConsistent: true,
      recommendedAction: 'proceed'
    };
  }

  const whatsappNormalized = normalizePhoneNumber(whatsappPhone);
  const shippingNormalized = normalizePhoneNumber(shippingPhone);
  
  const isConsistent = arePhoneNumbersEquivalent(whatsappNormalized, shippingNormalized);
  
  if (isConsistent) {
    return {
      isConsistent: true,
      recommendedAction: 'proceed'
    };
  }

  // Phone numbers are different - determine severity
  const whatsappDisplay = formatPhoneForDisplay(whatsappPhone);
  const shippingDisplay = formatPhoneForDisplay(shippingPhone);
  
  const conflictDetails = {
    whatsappNormalized,
    shippingNormalized,
    whatsappDisplay,
    shippingDisplay,
    potentialDuplicate: true
  };

  // Determine recommended action based on phone similarity
  const lastDigitsSame = whatsappNormalized.slice(-4) === shippingNormalized.slice(-4);
  const recommendedAction = lastDigitsSame ? 'warn_user' : 'require_confirmation';
  
  const warningMessage = `Phone number mismatch detected: WhatsApp (${whatsappDisplay}) vs Shipping (${shippingDisplay})`;
  const userFriendlyMessage = recommendedAction === 'require_confirmation' 
    ? `We noticed you're using different phone numbers for WhatsApp authentication (${whatsappDisplay}) and shipping (${shippingDisplay}). To prevent account issues, we'll use your WhatsApp number as the primary contact.`
    : `Your WhatsApp number (${whatsappDisplay}) differs from your shipping number (${shippingDisplay}). We'll use your WhatsApp number for your account.`;

  return {
    isConsistent: false,
    recommendedAction,
    conflictDetails,
    warningMessage,
    userFriendlyMessage
  };
}

/**
 * Validates the entire checkout form for phone consistency and other issues.
 */
export function validateCheckoutForm(formData: CheckoutFormValidation): {
  isValid: boolean;
  phoneConsistency: PhoneConsistencyResult;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic validation
  if (!formData.firstName?.trim()) {
    errors.push('First name is required');
  }
  
  if (!formData.whatsappPhone?.trim()) {
    errors.push('WhatsApp phone number is required');
  }
  
  if (!formData.shippingPhone?.trim()) {
    errors.push('Shipping phone number is required');
  }
  
  // Phone consistency validation
  const phoneConsistency = validatePhoneConsistency(
    formData.whatsappPhone, 
    formData.shippingPhone
  );
  
  if (!phoneConsistency.isConsistent) {
    if (phoneConsistency.recommendedAction === 'warn_user') {
      warnings.push(phoneConsistency.userFriendlyMessage || 'Phone numbers differ');
    } else if (phoneConsistency.recommendedAction === 'require_confirmation') {
      warnings.push(phoneConsistency.userFriendlyMessage || 'Significant phone number difference detected');
    }
  }
  
  return {
    isValid: errors.length === 0,
    phoneConsistency,
    errors,
    warnings
  };
}

/**
 * Creates a user-friendly explanation of what will happen with conflicting phone numbers.
 */
export function createPhoneResolutionExplanation(
  whatsappPhone: string,
  shippingPhone: string
): string {
  const consistency = validatePhoneConsistency(whatsappPhone, shippingPhone);
  
  if (consistency.isConsistent) {
    return 'Your phone numbers are consistent across authentication and shipping.';
  }
  
  const whatsappDisplay = formatPhoneForDisplay(whatsappPhone);
  
  return `We'll use your WhatsApp-verified number (${whatsappDisplay}) as your primary account contact. This prevents duplicate accounts and ensures you can access your order history.`;
}

/**
 * Determines if user confirmation is required before proceeding with checkout.
 */
export function requiresUserConfirmation(
  whatsappPhone: string,
  shippingPhone: string
): boolean {
  const consistency = validatePhoneConsistency(whatsappPhone, shippingPhone);
  return consistency.recommendedAction === 'require_confirmation';
}

/**
 * Gets the primary phone number that should be used for the customer account.
 * Always prioritizes WhatsApp-authenticated phone for consistency.
 */
export function resolvePrimaryPhone(
  whatsappPhone: string,
  shippingPhone: string
): {
  primaryPhone: string;
  reasoning: string;
  conflictResolved: boolean;
} {
  const whatsappNormalized = normalizePhoneNumber(whatsappPhone);
  const shippingNormalized = normalizePhoneNumber(shippingPhone);
  
  if (arePhoneNumbersEquivalent(whatsappNormalized, shippingNormalized)) {
    return {
      primaryPhone: whatsappPhone,
      reasoning: 'Phone numbers are consistent',
      conflictResolved: false
    };
  }
  
  return {
    primaryPhone: whatsappPhone,
    reasoning: 'WhatsApp-authenticated phone takes priority for account consistency',
    conflictResolved: true
  };
}"