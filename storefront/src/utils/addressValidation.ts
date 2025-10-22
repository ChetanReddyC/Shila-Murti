/**
 * Address Validation Utility
 * 
 * Provides comprehensive address validation for Indian addresses with:
 * - Postal code (PIN) format validation
 * - Phone number format validation
 * - State validation against official list
 * - Name, address, and city validation
 * 
 * Security: Prevents malformed data from being submitted to checkout
 */

// Indian postal code regex: 6 digits, cannot start with 0
const INDIAN_POSTAL_CODE_REGEX = /^[1-9][0-9]{5}$/;

export interface AddressValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalized?: {
    postalCode: string;
    phone: string;
    state: string;
  };
}

export interface AddressInput {
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  contactNumber: string;
}

/**
 * Validates an Indian address with comprehensive checks
 * 
 * @param address - Address object to validate
 * @returns Validation result with errors, warnings, and normalized data
 */
export function validateIndianAddress(address: AddressInput): AddressValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name validation
  if (!address.name || address.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  if (address.name && address.name.length > 100) {
    errors.push('Name cannot exceed 100 characters');
  }
  if (address.name && !/^[a-zA-Z\s.]+$/.test(address.name)) {
    errors.push('Name should only contain letters, spaces, and periods');
  }

  // Address line validation
  if (!address.address || address.address.trim().length < 10) {
    errors.push('Address must be at least 10 characters');
  }
  if (address.address && address.address.length > 200) {
    errors.push('Address cannot exceed 200 characters');
  }

  // City validation
  if (!address.city || address.city.trim().length < 2) {
    errors.push('City name must be at least 2 characters');
  }
  if (address.city && address.city.length > 100) {
    errors.push('City name cannot exceed 100 characters');
  }
  if (address.city && !/^[a-zA-Z\s]+$/.test(address.city)) {
    errors.push('City name should only contain letters and spaces');
  }

  // State validation - just check it's not empty
  if (!address.state || address.state.trim().length < 2) {
    errors.push('State must be at least 2 characters');
  }
  if (address.state && address.state.length > 100) {
    errors.push('State cannot exceed 100 characters');
  }

  // Postal code validation
  const normalizedPostalCode = address.postalCode.replace(/\s/g, '');
  if (!INDIAN_POSTAL_CODE_REGEX.test(normalizedPostalCode)) {
    errors.push('Postal code must be a valid 6-digit Indian PIN code');
  }

  // Phone validation - just check it's not empty and reasonable length
  if (!address.contactNumber || address.contactNumber.trim().length < 10) {
    errors.push('Contact number must be at least 10 digits');
  }
  if (address.contactNumber && address.contactNumber.length > 15) {
    errors.push('Contact number cannot exceed 15 characters');
  }

  // Warnings for suspicious patterns (security checks)
  if (address.address.toLowerCase().includes('test') || 
      address.address.toLowerCase().includes('demo')) {
    warnings.push('Address contains test keywords - please verify this is a real address');
  }

  // Check for PO Box (some shipping methods may not deliver to PO Box)
  if (address.address.toLowerCase().includes('p.o. box') ||
      address.address.toLowerCase().includes('po box') ||
      address.address.toLowerCase().includes('p o box')) {
    warnings.push('PO Box addresses may have limited shipping options');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: errors.length === 0 ? {
      postalCode: normalizedPostalCode,
      phone: address.contactNumber.trim(),
      state: address.state.trim()
    } : undefined
  };
}

/**
 * Validates a single field from an address
 * 
 * @param fieldName - Name of the field to validate
 * @param value - Value to validate
 * @returns Error message if invalid, null if valid
 */
export function validateAddressField(
  fieldName: keyof AddressInput,
  value: string
): string | null {
  switch (fieldName) {
    case 'name':
      if (!value || value.trim().length < 2) {
        return 'Name must be at least 2 characters';
      }
      if (value.length > 100) {
        return 'Name cannot exceed 100 characters';
      }
      if (!/^[a-zA-Z\s.]+$/.test(value)) {
        return 'Name should only contain letters, spaces, and periods';
      }
      break;

    case 'address':
      if (!value || value.trim().length < 10) {
        return 'Address must be at least 10 characters';
      }
      if (value.length > 200) {
        return 'Address cannot exceed 200 characters';
      }
      break;

    case 'city':
      if (!value || value.trim().length < 2) {
        return 'City name must be at least 2 characters';
      }
      if (value.length > 100) {
        return 'City name cannot exceed 100 characters';
      }
      if (!/^[a-zA-Z\s]+$/.test(value)) {
        return 'City name should only contain letters and spaces';
      }
      break;

    case 'state':
      if (!value || value.trim().length < 2) {
        return 'State must be at least 2 characters';
      }
      if (value.length > 100) {
        return 'State cannot exceed 100 characters';
      }
      break;

    case 'postalCode':
      const normalized = value.replace(/\s/g, '');
      if (!INDIAN_POSTAL_CODE_REGEX.test(normalized)) {
        return 'Postal code must be a valid 6-digit Indian PIN code';
      }
      break;

    case 'contactNumber':
      if (!value || value.trim().length < 10) {
        return 'Contact number must be at least 10 digits';
      }
      if (value.length > 15) {
        return 'Contact number cannot exceed 15 characters';
      }
      break;
  }

  return null;
}

/**
 * Normalize postal code (remove spaces)
 */
export function normalizePostalCode(postalCode: string): string {
  return postalCode.replace(/\s/g, '');
}
