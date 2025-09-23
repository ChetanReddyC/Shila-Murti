import { MedusaCart } from '../types/medusa';

// Core interfaces for price calculation
export interface PriceBreakdown {
  type: 'item' | 'shipping' | 'tax' | 'discount';
  description: string;
  amount: number;
  details?: Record<string, any>;
}

export interface CartTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  breakdown: PriceBreakdown[];
  calculatedAt: Date;
  version: string;
}

export interface PriceCalculationContext {
  cart: MedusaCart;
  selectedShippingOptionId?: string;
  appliedDiscounts?: string[];
  taxConfiguration?: TaxConfig;
  calculationMode: 'live' | 'cached' | 'validation';
}

export interface TaxConfig {
  rate: number;
  inclusive: boolean;
  region: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Centralized price calculation service that ensures consistent pricing
 * across all components in the checkout flow.
 */
export class PriceCalculationService {
  private static readonly VERSION = '1.0.0';
  private static readonly DEFAULT_CURRENCY = 'INR';

  /**
   * Calculate comprehensive cart totals with detailed breakdown
   */
  public static calculateCartTotals(
    cart: MedusaCart | null,
    shippingOptionId?: string,
    availableShippingOptions?: Array<{ id: string; name: string; amount: number }>
  ): CartTotals {
    const calculatedAt = new Date();
    const currency = cart?.currency_code || this.DEFAULT_CURRENCY;
    const breakdown: PriceBreakdown[] = [];

    // Calculate subtotal from cart items
    const subtotal = this.calculateSubtotal(cart, breakdown);

    // Calculate shipping amount
    const shipping = this.getShippingAmount(cart, shippingOptionId, availableShippingOptions);
    if (shipping > 0) {
      breakdown.push({
        type: 'shipping',
        description: 'Shipping charges',
        amount: shipping,
        details: { optionId: shippingOptionId }
      });
    }

    // Calculate tax (use cart's tax_total if available, otherwise calculate)
    const tax = cart?.tax_total || 0;
    if (tax > 0) {
      breakdown.push({
        type: 'tax',
        description: 'Taxes',
        amount: tax
      });
    }

    // Calculate discount
    const discount = cart?.discount_total || 0;
    if (discount > 0) {
      breakdown.push({
        type: 'discount',
        description: 'Discounts applied',
        amount: -discount // Negative because it reduces total
      });
    }

    // Calculate final total
    const total = subtotal + shipping + tax - discount;

    return {
      subtotal,
      shipping,
      tax,
      discount,
      total,
      currency,
      breakdown,
      calculatedAt,
      version: this.VERSION
    };
  }

  /**
   * Calculate subtotal from cart items and add to breakdown
   */
  private static calculateSubtotal(cart: MedusaCart | null, breakdown: PriceBreakdown[]): number {
    if (!cart?.items || cart.items.length === 0) {
      return 0;
    }

    let subtotal = 0;
    
    cart.items.forEach(item => {
      const itemTotal = item.unit_price * item.quantity;
      subtotal += itemTotal;
      
      breakdown.push({
        type: 'item',
        description: `${item.title} (x${item.quantity})`,
        amount: itemTotal,
        details: {
          itemId: item.id,
          variantId: item.variant_id,
          unitPrice: item.unit_price,
          quantity: item.quantity
        }
      });
    });

    return subtotal;
  }

  /**
   * Get shipping amount based on selected option or cart default
   */
  public static getShippingAmount(
    cart: MedusaCart | null,
    selectedOptionId?: string,
    availableOptions?: Array<{ id: string; name: string; amount: number }>
  ): number {
    // If a specific shipping option is selected, look it up in available options first
    if (selectedOptionId && availableOptions && availableOptions.length > 0) {
      const selectedOption = availableOptions.find(
        option => option.id === selectedOptionId
      );
      if (selectedOption) {
        return selectedOption.amount;
      }
    }

    // If a specific shipping option is selected, look it up in cart's shipping methods
    if (selectedOptionId && cart?.shipping_methods) {
      const selectedMethod = cart.shipping_methods.find(
        method => method.id === selectedOptionId || method.shipping_option_id === selectedOptionId
      );
      if (selectedMethod) {
        return selectedMethod.amount;
      }
    }

    // If selectedOptionId is provided but not found in available options or cart methods,
    // we need to look up the shipping option from standard options
    if (selectedOptionId) {
      // Define standard shipping options that match the checkout page
      const standardShippingOptions = [
        { id: 'standard_shipping', amount: 50 },
        { id: 'express_shipping', amount: 150 },
        { id: 'free_shipping', amount: 0 },
        { id: 'overnight_shipping', amount: 300 }
      ];
      
      const selectedOption = standardShippingOptions.find(
        option => option.id === selectedOptionId
      );
      
      if (selectedOption) {
        return selectedOption.amount;
      }
    }

    // Fall back to cart's calculated shipping total
    return cart?.shipping_total || 0;
  }

  /**
   * Format currency consistently across the application
   */
  public static formatCurrency(
    amount: number,
    currency: string = this.DEFAULT_CURRENCY
  ): string {
    // Handle edge cases
    if (typeof amount !== 'number' || isNaN(amount)) {
      amount = 0;
    }

    // Special handling for INR
    if (currency === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(amount);
    }

    // Generic currency formatting
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Validate price calculation consistency
   */
  public static validatePriceConsistency(totals: CartTotals): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for negative amounts (except discount)
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
      errors.push('Total amount cannot be negative');
    }

    // Validate breakdown consistency
    const breakdownTotal = totals.breakdown.reduce((sum, item) => {
      return sum + (item.type === 'discount' ? item.amount : item.amount);
    }, 0);

    const expectedTotal = totals.subtotal + totals.shipping + totals.tax - totals.discount;
    if (Math.abs(breakdownTotal - expectedTotal) > 0.01) {
      warnings.push('Breakdown total does not match calculated total');
    }

    // Check for duplicate charges
    const shippingCharges = totals.breakdown.filter(item => item.type === 'shipping');
    if (shippingCharges.length > 1) {
      warnings.push('Multiple shipping charges detected');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a price calculation context for advanced scenarios
   */
  public static createCalculationContext(
    cart: MedusaCart,
    options: {
      selectedShippingOptionId?: string;
      appliedDiscounts?: string[];
      calculationMode?: 'live' | 'cached' | 'validation';
    } = {}
  ): PriceCalculationContext {
    return {
      cart,
      selectedShippingOptionId: options.selectedShippingOptionId,
      appliedDiscounts: options.appliedDiscounts || [],
      calculationMode: options.calculationMode || 'live'
    };
  }

  /**
   * Calculate totals with full context
   */
  public static calculateWithContext(context: PriceCalculationContext): CartTotals {
    return this.calculateCartTotals(context.cart, context.selectedShippingOptionId);
  }

  /**
   * Helper method to get formatted shipping display
   */
  public static getFormattedShipping(
    cart: MedusaCart | null,
    selectedOptionId?: string,
    availableOptions?: Array<{ id: string; name: string; amount: number }>
  ): string {
    const amount = this.getShippingAmount(cart, selectedOptionId, availableOptions);
    return amount > 0 ? this.formatCurrency(amount, cart?.currency_code) : 'Free';
  }

  /**
   * Helper method to check if cart has items
   */
  public static hasItems(cart: MedusaCart | null): boolean {
    return !!(cart?.items && cart.items.length > 0);
  }

  /**
   * Helper method to get total item count
   */
  public static getTotalItemCount(cart: MedusaCart | null): number {
    if (!cart?.items) return 0;
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  }
}