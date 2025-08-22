/**
 * Phone Number Normalization Utilities
 * 
 * Provides consistent phone number normalization across the application.
 * Used for customer authentication, profile creation, and data synchronization.
 */

/**
 * Normalizes a phone number to a consistent format for storage and comparison.
 * 
 * Rules:
 * 1. Remove all non-digit characters
 * 2. Remove leading 0 if present (except for numbers like 000...)
 * 3. Add India country code (91) if not present
 * 
 * @param phone - Raw phone number input
 * @returns Normalized phone number (e.g., "919876543210")
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // First remove all non-digit characters
  let normalized = String(phone).replace(/\D/g, '');
  
  // If the number starts with 0 but isn't 000..., remove the leading 0
  if (normalized.startsWith('0') && normalized.length > 1) {
    normalized = normalized.substring(1);
  }
  
  // If the number doesn't start with 91 (India country code), add it
  if (!normalized.startsWith('91') && normalized.length > 0) {
    normalized = '91' + normalized;
  }
  
  return normalized;
}

/**
 * Generates a placeholder email address from a phone number.
 * Used for customers who authenticate via WhatsApp but don't provide email.
 * 
 * @param phone - Phone number to convert
 * @returns Email in format: {normalizedPhone}@guest.local
 */
export function generatePlaceholderEmail(phone: string | null | undefined): string {
  const normalized = normalizePhoneNumber(phone);
  return normalized ? `${normalized}@guest.local` : '';
}

/**
 * Validates if a phone number is properly formatted after normalization.
 * 
 * @param phone - Phone number to validate
 * @returns true if the phone number is valid
 */
export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  
  const normalized = normalizePhoneNumber(phone);
  
  // Should start with 91 (India) and have at least 12 digits total
  return normalized.startsWith('91') && normalized.length >= 12 && normalized.length <= 13;
}

/**
 * Formats a normalized phone number for display purposes.
 * 
 * @param phone - Normalized phone number
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  const normalized = normalizePhoneNumber(phone);
  
  if (normalized.startsWith('91') && normalized.length >= 12) {
    // Format as +91 XXXXX XXXXX
    const countryCode = normalized.substring(0, 2);
    const rest = normalized.substring(2);
    const firstPart = rest.substring(0, 5);
    const secondPart = rest.substring(5);
    
    return `+${countryCode} ${firstPart} ${secondPart}`;
  }
  
  return normalized;
}

/**
 * Checks if two phone numbers are equivalent after normalization.
 * Used for customer deduplication and conflict detection.
 * 
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if the normalized phone numbers are identical
 */
export function arePhoneNumbersEquivalent(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
  if (!phone1 || !phone2) return false;
  
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  return normalized1 === normalized2 && normalized1.length >= 12;
}

/**
 * Extracts the last 10 digits from a normalized phone number.
 * Used for fuzzy matching when different country codes might be used.
 * 
 * @param phone - Phone number to extract digits from
 * @returns Last 10 digits of the phone number
 */
export function getPhoneSuffix(phone: string | null | undefined): string {
  if (!phone) return '';
  
  const normalized = normalizePhoneNumber(phone);
  
  // Return last 10 digits (standard mobile number length without country code)
  return normalized.length >= 10 ? normalized.slice(-10) : normalized;
}

/**
 * Generates multiple phone number variations for lookup purposes.
 * Helps find customers who might have been created with different formats.
 * 
 * @param phone - Base phone number
 * @returns Array of phone number variations
 */
export function generatePhoneVariations(phone: string | null | undefined): string[] {
  if (!phone) return [];
  
  const normalized = normalizePhoneNumber(phone);
  const variations: string[] = [normalized];
  
  if (normalized.startsWith('91') && normalized.length >= 12) {
    const withoutCountryCode = normalized.substring(2);
    const withZero = '0' + withoutCountryCode;
    const withPlusPrefix = '+' + normalized;
    
    variations.push(withoutCountryCode, withZero, withPlusPrefix);
  }
  
  // Remove duplicates and empty strings
  return [...new Set(variations)].filter(v => v.length > 0);
}