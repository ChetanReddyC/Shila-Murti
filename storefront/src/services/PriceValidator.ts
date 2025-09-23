import { CartTotals, PriceBreakdown, ValidationResult } from './PriceCalculationService';
import { MedusaCart } from '../types/medusa';

export interface PriceValidationOptions {
  strictMode?: boolean;
  toleranceAmount?: number;
  enableBackendComparison?: boolean;
}

export interface DuplicateChargeResult {
  hasDuplicates: boolean;
  duplicateTypes: string[];
  duplicateCharges: PriceBreakdown[];
}

export interface PriceConsistencyResult extends ValidationResult {
  duplicateCharges?: DuplicateChargeResult;
  calculationErrors?: string[];
  backendMismatch?: boolean;
}

/**
 * Price validation service for detecting inconsistencies and duplicate charges
 * in price calculations throughout the checkout flow.
 */
export class PriceValidator {
  private static readonly DEFAULT_TOLERANCE = 0.01; // 1 cent tolerance for floating point precision
  private static readonly MAX_SHIPPING_CHARGES = 1;
  private static readonly MAX_TAX_CHARGES = 1;

  /**
   * Comprehensive validation of cart totals and price breakdown
   */
  public static validateTotals(
    totals: CartTotals,
    options: PriceValidationOptions = {}
  ): PriceConsistencyResult {
    const {
      strictMode = false,
      toleranceAmount = this.DEFAULT_TOLERANCE,
      enableBackendComparison = false
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];
    const calculationErrors: string[] = [];

    // Validate basic constraints
    this.validateBasicConstraints(totals, errors, warnings, strictMode);

    // Check for duplicate charges
    const duplicateCharges = this.checkForDuplicateCharges(totals.breakdown);
    if (duplicateCharges.hasDuplicates) {
      if (strictMode) {
        errors.push(`Duplicate charges detected: ${duplicateCharges.duplicateTypes.join(', ')}`);
      } else {
        warnings.push(`Potential duplicate charges: ${duplicateCharges.duplicateTypes.join(', ')}`);
      }
    }

    // Validate calculation consistency
    const calculationValidation = this.validateCalculationConsistency(totals, toleranceAmount);
    if (!calculationValidation.isValid) {
      calculationErrors.push(...calculationValidation.errors);
      if (strictMode) {
        errors.push(...calculationValidation.errors);
      } else {
        warnings.push(...calculationValidation.errors);
      }
    }

    // Validate breakdown integrity
    const breakdownValidation = this.validateBreakdownIntegrity(totals);
    if (!breakdownValidation.isValid) {
      calculationErrors.push(...breakdownValidation.errors);
      warnings.push(...breakdownValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      duplicateCharges,
      calculationErrors: calculationErrors.length > 0 ? calculationErrors : undefined
    };
  }

  /**
   * Detect duplicate charges in price breakdown
   */
  public static checkForDuplicateCharges(breakdown: PriceBreakdown[]): DuplicateChargeResult {
    const chargesByType = new Map<string, PriceBreakdown[]>();
    const duplicateTypes: string[] = [];
    const duplicateCharges: PriceBreakdown[] = [];

    // Group charges by type
    breakdown.forEach(charge => {
      if (!chargesByType.has(charge.type)) {
        chargesByType.set(charge.type, []);
      }
      chargesByType.get(charge.type)!.push(charge);
    });

    // Check for duplicates based on business rules
    chargesByType.forEach((charges, type) => {
      let isDuplicate = false;

      switch (type) {
        case 'shipping':
          // Only one shipping charge should exist
          if (charges.length > this.MAX_SHIPPING_CHARGES) {
            isDuplicate = true;
          }
          break;

        case 'tax':
          // Only one tax charge should exist (unless itemized)
          if (charges.length > this.MAX_TAX_CHARGES) {
            // Check if they're itemized taxes (different descriptions)
            const uniqueDescriptions = new Set(charges.map(c => c.description));
            if (uniqueDescriptions.size < charges.length) {
              isDuplicate = true;
            }
          }
          break;

        case 'item':
          // Items can have duplicates, but check for exact duplicates
          const itemMap = new Map<string, PriceBreakdown[]>();
          charges.forEach(charge => {
            const key = `${charge.description}-${charge.amount}`;
            if (!itemMap.has(key)) {
              itemMap.set(key, []);
            }
            itemMap.get(key)!.push(charge);
          });

          itemMap.forEach((duplicateItems, key) => {
            if (duplicateItems.length > 1) {
              // Check if they have different item IDs (legitimate duplicates)
              const itemIds = duplicateItems
                .map(item => item.details?.itemId)
                .filter(id => id);
              
              if (itemIds.length > 0 && new Set(itemIds).size < itemIds.length) {
                isDuplicate = true;
                duplicateCharges.push(...duplicateItems);
              }
            }
          });
          break;

        case 'discount':
          // Multiple discounts are allowed, but check for identical ones
          const discountMap = new Map<string, number>();
          charges.forEach(charge => {
            const key = charge.description;
            discountMap.set(key, (discountMap.get(key) || 0) + 1);
          });

          discountMap.forEach((count, description) => {
            if (count > 1) {
              isDuplicate = true;
              duplicateCharges.push(...charges.filter(c => c.description === description));
            }
          });
          break;
      }

      if (isDuplicate) {
        duplicateTypes.push(type);
        if (type !== 'item' && type !== 'discount') {
          duplicateCharges.push(...charges);
        }
      }
    });

    return {
      hasDuplicates: duplicateTypes.length > 0,
      duplicateTypes,
      duplicateCharges
    };
  }

  /**
   * Validate price inconsistencies by comparing calculated vs expected totals
   */
  public static validatePriceConsistency(
    cart: MedusaCart,
    calculatedTotals: CartTotals,
    options: PriceValidationOptions = {}
  ): PriceConsistencyResult {
    const { toleranceAmount = this.DEFAULT_TOLERANCE } = options;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Compare with cart totals from backend
    if (cart.total !== undefined) {
      const totalDifference = Math.abs(calculatedTotals.total - cart.total);
      if (totalDifference > toleranceAmount) {
        errors.push(
          `Total mismatch: calculated ${calculatedTotals.total}, backend ${cart.total} (diff: ${totalDifference})`
        );
      }
    }

    if (cart.subtotal !== undefined) {
      const subtotalDifference = Math.abs(calculatedTotals.subtotal - cart.subtotal);
      if (subtotalDifference > toleranceAmount) {
        warnings.push(
          `Subtotal mismatch: calculated ${calculatedTotals.subtotal}, backend ${cart.subtotal}`
        );
      }
    }

    if (cart.shipping_total !== undefined) {
      const shippingDifference = Math.abs(calculatedTotals.shipping - cart.shipping_total);
      if (shippingDifference > toleranceAmount) {
        warnings.push(
          `Shipping mismatch: calculated ${calculatedTotals.shipping}, backend ${cart.shipping_total}`
        );
      }
    }

    if (cart.tax_total !== undefined) {
      const taxDifference = Math.abs(calculatedTotals.tax - cart.tax_total);
      if (taxDifference > toleranceAmount) {
        warnings.push(
          `Tax mismatch: calculated ${calculatedTotals.tax}, backend ${cart.tax_total}`
        );
      }
    }

    // Validate totals structure
    const structureValidation = this.validateTotals(calculatedTotals, options);

    return {
      isValid: errors.length === 0 && structureValidation.isValid,
      errors: [...errors, ...structureValidation.errors],
      warnings: [...warnings, ...structureValidation.warnings],
      duplicateCharges: structureValidation.duplicateCharges,
      calculationErrors: structureValidation.calculationErrors,
      backendMismatch: errors.length > 0
    };
  }

  /**
   * Validate basic constraints on totals
   */
  private static validateBasicConstraints(
    totals: CartTotals,
    errors: string[],
    warnings: string[],
    strictMode: boolean
  ): void {
    // Check for negative amounts (except discount which can be negative)
    if (totals.subtotal < 0) {
      errors.push('Subtotal cannot be negative');
    }

    if (totals.shipping < 0) {
      errors.push('Shipping amount cannot be negative');
    }

    if (totals.tax < 0) {
      errors.push('Tax amount cannot be negative');
    }

    if (totals.total < 0) {
      if (strictMode) {
        errors.push('Total amount cannot be negative');
      } else {
        warnings.push('Total amount is negative - this may indicate a calculation error');
      }
    }

    // Check for unreasonable values
    if (totals.shipping > totals.subtotal && totals.subtotal > 0) {
      warnings.push('Shipping cost exceeds subtotal - this may be unusual');
    }

    if (totals.tax > totals.subtotal * 0.5 && totals.subtotal > 0) {
      warnings.push('Tax amount seems unusually high compared to subtotal');
    }

    // Validate currency
    if (!totals.currency || totals.currency.length !== 3) {
      errors.push('Invalid currency code');
    }

    // Validate breakdown exists
    if (!totals.breakdown || totals.breakdown.length === 0) {
      warnings.push('Price breakdown is empty');
    }
  }

  /**
   * Validate calculation consistency between totals and breakdown
   */
  private static validateCalculationConsistency(
    totals: CartTotals,
    toleranceAmount: number
  ): ValidationResult {
    const errors: string[] = [];

    // Calculate expected total from breakdown
    let breakdownSubtotal = 0;
    let breakdownShipping = 0;
    let breakdownTax = 0;
    let breakdownDiscount = 0;

    totals.breakdown.forEach(item => {
      switch (item.type) {
        case 'item':
          breakdownSubtotal += item.amount;
          break;
        case 'shipping':
          breakdownShipping += item.amount;
          break;
        case 'tax':
          breakdownTax += item.amount;
          break;
        case 'discount':
          breakdownDiscount += Math.abs(item.amount); // Discount amounts should be positive in breakdown
          break;
      }
    });

    // Validate individual components
    if (Math.abs(totals.subtotal - breakdownSubtotal) > toleranceAmount) {
      errors.push(
        `Subtotal breakdown mismatch: total ${totals.subtotal}, breakdown ${breakdownSubtotal}`
      );
    }

    if (Math.abs(totals.shipping - breakdownShipping) > toleranceAmount) {
      errors.push(
        `Shipping breakdown mismatch: total ${totals.shipping}, breakdown ${breakdownShipping}`
      );
    }

    if (Math.abs(totals.tax - breakdownTax) > toleranceAmount) {
      errors.push(
        `Tax breakdown mismatch: total ${totals.tax}, breakdown ${breakdownTax}`
      );
    }

    if (Math.abs(totals.discount - breakdownDiscount) > toleranceAmount) {
      errors.push(
        `Discount breakdown mismatch: total ${totals.discount}, breakdown ${breakdownDiscount}`
      );
    }

    // Validate final total
    const expectedTotal = totals.subtotal + totals.shipping + totals.tax - totals.discount;
    if (Math.abs(totals.total - expectedTotal) > toleranceAmount) {
      errors.push(
        `Total calculation mismatch: stated ${totals.total}, calculated ${expectedTotal}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Validate breakdown integrity and structure
   */
  private static validateBreakdownIntegrity(totals: CartTotals): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for required breakdown items
    const hasItems = totals.breakdown.some(item => item.type === 'item');
    if (totals.subtotal > 0 && !hasItems) {
      errors.push('Missing item breakdown for non-zero subtotal');
    }

    const hasShipping = totals.breakdown.some(item => item.type === 'shipping');
    if (totals.shipping > 0 && !hasShipping) {
      warnings.push('Missing shipping breakdown for non-zero shipping cost');
    }

    // Validate breakdown item structure
    totals.breakdown.forEach((item, index) => {
      if (!item.type || !['item', 'shipping', 'tax', 'discount'].includes(item.type)) {
        errors.push(`Invalid breakdown type at index ${index}: ${item.type}`);
      }

      if (!item.description || item.description.trim().length === 0) {
        warnings.push(`Missing description for breakdown item at index ${index}`);
      }

      if (typeof item.amount !== 'number' || isNaN(item.amount)) {
        errors.push(`Invalid amount for breakdown item at index ${index}: ${item.amount}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Verify calculated totals against backend API
   */
  public static async verifyAgainstBackend(
    cartId: string,
    calculatedTotals: CartTotals
  ): Promise<ValidationResult> {
    // This would make an API call to verify totals
    // For now, return a placeholder implementation
    
    try {
      // In a real implementation, this would:
      // 1. Fetch fresh cart data from Medusa API
      // 2. Compare totals with calculated values
      // 3. Return validation result
      
      return {
        isValid: true,
        errors: [],
        warnings: ['Backend verification not implemented']
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Backend verification failed: ${error}`],
        warnings: []
      };
    }
  }

  /**
   * Create a detailed validation report
   */
  public static createValidationReport(
    cart: MedusaCart,
    calculatedTotals: CartTotals,
    options: PriceValidationOptions = {}
  ): {
    summary: PriceConsistencyResult;
    details: {
      cartInfo: {
        id: string;
        itemCount: number;
        currency: string;
      };
      calculationInfo: {
        version: string;
        calculatedAt: Date;
        breakdownItemCount: number;
      };
      validationOptions: PriceValidationOptions;
    };
  } {
    const summary = this.validatePriceConsistency(cart, calculatedTotals, options);

    return {
      summary,
      details: {
        cartInfo: {
          id: cart.id,
          itemCount: cart.items?.length || 0,
          currency: cart.currency_code
        },
        calculationInfo: {
          version: calculatedTotals.version,
          calculatedAt: calculatedTotals.calculatedAt,
          breakdownItemCount: calculatedTotals.breakdown.length
        },
        validationOptions: options
      }
    };
  }
}