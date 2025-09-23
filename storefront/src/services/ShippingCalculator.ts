import { MedusaCart, ShippingMethod } from '../types/medusa';

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
  currency_code: string;
  description?: string;
  metadata?: Record<string, any>;
  is_return?: boolean;
  admin_only?: boolean;
  provider_id?: string;
  profile_id?: string;
  type?: 'standard' | 'express' | 'overnight' | 'pickup';
  estimated_delivery_days?: number;
}

export interface ShippingCalculationResult {
  selectedOption?: ShippingOption;
  amount: number;
  currency: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ShippingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  selectedOption?: ShippingOption;
}

/**
 * Shipping calculator service for consistent shipping option handling
 * and amount calculation throughout the checkout flow.
 */
export class ShippingCalculator {
  private static readonly DEFAULT_CURRENCY = 'INR';
  private static readonly FREE_SHIPPING_THRESHOLD = 0;

  /**
   * Get available shipping options for a cart
   * In a real implementation, this would call the Medusa API
   */
  public static async getAvailableOptions(cartId: string): Promise<ShippingOption[]> {
    // Placeholder implementation - in reality this would call:
    // GET /store/shipping-options/{cart_id}
    
    try {
      // Mock shipping options for demonstration
      const mockOptions: ShippingOption[] = [
        {
          id: 'standard_shipping',
          name: 'Standard Shipping',
          amount: 50,
          currency_code: 'INR',
          description: '5-7 business days',
          type: 'standard',
          estimated_delivery_days: 6
        },
        {
          id: 'express_shipping',
          name: 'Express Shipping',
          amount: 150,
          currency_code: 'INR',
          description: '2-3 business days',
          type: 'express',
          estimated_delivery_days: 2
        },
        {
          id: 'free_shipping',
          name: 'Free Shipping',
          amount: 0,
          currency_code: 'INR',
          description: '7-10 business days',
          type: 'standard',
          estimated_delivery_days: 8
        }
      ];

      return mockOptions;
    } catch (error) {
      console.error('Failed to fetch shipping options:', error);
      return [];
    }
  }

  /**
   * Calculate shipping amount based on selected option
   */
  public static calculateShippingAmount(
    options: ShippingOption[],
    selectedId?: string
  ): number {
    if (!selectedId || options.length === 0) {
      return 0;
    }

    const selectedOption = options.find(option => option.id === selectedId);
    return selectedOption ? selectedOption.amount : 0;
  }

  /**
   * Get shipping amount from cart's current shipping methods
   */
  public static getCartShippingAmount(cart: MedusaCart): number {
    if (!cart.shipping_methods || cart.shipping_methods.length === 0) {
      return cart.shipping_total || 0;
    }

    // Sum all shipping method amounts
    return cart.shipping_methods.reduce((total, method) => {
      return total + (method.amount || 0);
    }, 0);
  }

  /**
   * Get effective shipping amount considering selected option or cart default
   */
  public static getEffectiveShippingAmount(
    cart: MedusaCart,
    selectedOptionId?: string,
    availableOptions?: ShippingOption[]
  ): ShippingCalculationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let amount = 0;
    let selectedOption: ShippingOption | undefined;
    const currency = cart.currency_code || this.DEFAULT_CURRENCY;

    try {
      if (selectedOptionId && availableOptions) {
        // Use selected shipping option
        selectedOption = availableOptions.find(option => option.id === selectedOptionId);
        
        if (selectedOption) {
          amount = selectedOption.amount;
          
          // Validate currency consistency
          if (selectedOption.currency_code !== currency) {
            warnings.push(
              `Currency mismatch: cart ${currency}, shipping option ${selectedOption.currency_code}`
            );
          }
        } else {
          errors.push(`Selected shipping option not found: ${selectedOptionId}`);
          // Fallback to cart shipping total
          amount = this.getCartShippingAmount(cart);
          warnings.push('Falling back to cart shipping total');
        }
      } else {
        // Use cart's current shipping amount
        amount = this.getCartShippingAmount(cart);
        
        if (cart.shipping_methods && cart.shipping_methods.length > 0) {
          // Try to match cart shipping method to available options
          const cartMethod = cart.shipping_methods[0];
          if (availableOptions) {
            selectedOption = availableOptions.find(option => 
              option.name === cartMethod.name || 
              option.amount === cartMethod.amount
            );
          }
        }
      }

      // Validate amount
      if (amount < 0) {
        errors.push('Shipping amount cannot be negative');
        amount = 0;
      }

      return {
        selectedOption,
        amount,
        currency,
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        amount: 0,
        currency,
        isValid: false,
        errors: [`Shipping calculation failed: ${error}`],
        warnings
      };
    }
  }

  /**
   * Validate shipping selection for a cart
   */
  public static async validateShippingSelection(
    cartId: string,
    optionId: string
  ): Promise<ShippingValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get available options
      const availableOptions = await this.getAvailableOptions(cartId);
      
      if (availableOptions.length === 0) {
        errors.push('No shipping options available for this cart');
        return {
          isValid: false,
          errors,
          warnings
        };
      }

      // Find selected option
      const selectedOption = availableOptions.find(option => option.id === optionId);
      
      if (!selectedOption) {
        errors.push(`Shipping option not found: ${optionId}`);
        return {
          isValid: false,
          errors,
          warnings
        };
      }

      // Validate option properties
      if (selectedOption.admin_only) {
        errors.push('Selected shipping option is admin-only');
      }

      if (selectedOption.is_return) {
        warnings.push('Selected shipping option is marked as return shipping');
      }

      if (selectedOption.amount < 0) {
        errors.push('Shipping option has invalid negative amount');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        selectedOption
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Shipping validation failed: ${error}`],
        warnings
      };
    }
  }

  /**
   * Check if cart qualifies for free shipping
   */
  public static checkFreeShippingEligibility(
    cart: MedusaCart,
    freeShippingThreshold: number = this.FREE_SHIPPING_THRESHOLD
  ): {
    isEligible: boolean;
    currentAmount: number;
    threshold: number;
    amountNeeded: number;
  } {
    const currentAmount = cart.subtotal || 0;
    const isEligible = currentAmount >= freeShippingThreshold;
    const amountNeeded = isEligible ? 0 : freeShippingThreshold - currentAmount;

    return {
      isEligible,
      currentAmount,
      threshold: freeShippingThreshold,
      amountNeeded
    };
  }

  /**
   * Get recommended shipping option based on cart value and preferences
   */
  public static getRecommendedOption(
    options: ShippingOption[],
    cart: MedusaCart,
    preferences: {
      preferFree?: boolean;
      preferFast?: boolean;
      maxAmount?: number;
    } = {}
  ): ShippingOption | null {
    if (options.length === 0) {
      return null;
    }

    const { preferFree = true, preferFast = false, maxAmount } = preferences;

    // Filter options by max amount if specified
    let filteredOptions = options;
    if (maxAmount !== undefined) {
      filteredOptions = options.filter(option => option.amount <= maxAmount);
    }

    if (filteredOptions.length === 0) {
      return null;
    }

    // If preferring free shipping, look for free options first
    if (preferFree) {
      const freeOptions = filteredOptions.filter(option => option.amount === 0);
      if (freeOptions.length > 0) {
        return freeOptions[0];
      }
    }

    // If preferring fast shipping, sort by delivery time
    if (preferFast) {
      const sortedBySpeed = [...filteredOptions].sort((a, b) => {
        const aDays = a.estimated_delivery_days || 999;
        const bDays = b.estimated_delivery_days || 999;
        return aDays - bDays;
      });
      return sortedBySpeed[0];
    }

    // Default: return cheapest option
    const sortedByPrice = [...filteredOptions].sort((a, b) => a.amount - b.amount);
    return sortedByPrice[0];
  }

  /**
   * Calculate shipping cost breakdown for multiple methods
   */
  public static calculateMultiMethodShipping(
    shippingMethods: ShippingMethod[]
  ): {
    total: number;
    breakdown: Array<{
      methodId: string;
      name: string;
      amount: number;
    }>;
    hasDuplicates: boolean;
  } {
    const breakdown = shippingMethods.map(method => ({
      methodId: method.id,
      name: method.name,
      amount: method.amount
    }));

    const total = shippingMethods.reduce((sum, method) => sum + method.amount, 0);

    // Check for duplicate methods (same name and amount)
    const methodSignatures = shippingMethods.map(m => `${m.name}-${m.amount}`);
    const hasDuplicates = methodSignatures.length !== new Set(methodSignatures).size;

    return {
      total,
      breakdown,
      hasDuplicates
    };
  }

  /**
   * Validate shipping method consistency in cart
   */
  public static validateCartShippingMethods(cart: MedusaCart): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    methodCount: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const methodCount = cart.shipping_methods?.length || 0;

    if (!cart.shipping_methods) {
      return {
        isValid: true,
        errors,
        warnings: ['No shipping methods in cart'],
        methodCount: 0
      };
    }

    // Check for multiple shipping methods
    if (methodCount > 1) {
      warnings.push(`Multiple shipping methods found: ${methodCount}`);
      
      // Check if they're duplicates
      const multiMethodResult = this.calculateMultiMethodShipping(cart.shipping_methods);
      if (multiMethodResult.hasDuplicates) {
        errors.push('Duplicate shipping methods detected');
      }
    }

    // Validate individual methods
    cart.shipping_methods.forEach((method, index) => {
      if (!method.name || method.name.trim().length === 0) {
        errors.push(`Shipping method ${index} has no name`);
      }

      if (method.amount < 0) {
        errors.push(`Shipping method ${index} has negative amount: ${method.amount}`);
      }

      if (!method.cart_id || method.cart_id !== cart.id) {
        errors.push(`Shipping method ${index} cart_id mismatch`);
      }
    });

    // Validate total consistency
    const calculatedTotal = cart.shipping_methods.reduce((sum, method) => sum + method.amount, 0);
    const cartShippingTotal = cart.shipping_total || 0;
    
    if (Math.abs(calculatedTotal - cartShippingTotal) > 0.01) {
      warnings.push(
        `Shipping total mismatch: methods total ${calculatedTotal}, cart total ${cartShippingTotal}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      methodCount
    };
  }

  /**
   * Format shipping option for display
   */
  public static formatShippingOption(option: ShippingOption): string {
    const formattedAmount = option.amount === 0 
      ? 'Free' 
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: option.currency_code || 'INR'
        }).format(option.amount);

    let display = `${option.name} - ${formattedAmount}`;
    
    if (option.description) {
      display += ` (${option.description})`;
    }

    return display;
  }

  /**
   * Get shipping summary for cart
   */
  public static getShippingSummary(cart: MedusaCart): {
    hasShipping: boolean;
    methodCount: number;
    totalAmount: number;
    formattedAmount: string;
    methods: Array<{
      name: string;
      amount: number;
      formattedAmount: string;
    }>;
  } {
    const methods = cart.shipping_methods || [];
    const methodCount = methods.length;
    const hasShipping = methodCount > 0;
    const totalAmount = methods.reduce((sum, method) => sum + method.amount, 0);
    
    const currency = cart.currency_code || this.DEFAULT_CURRENCY;
    const formattedAmount = totalAmount === 0 
      ? 'Free' 
      : new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: currency
        }).format(totalAmount);

    const formattedMethods = methods.map(method => ({
      name: method.name,
      amount: method.amount,
      formattedAmount: method.amount === 0 
        ? 'Free' 
        : new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency
          }).format(method.amount)
    }));

    return {
      hasShipping,
      methodCount,
      totalAmount,
      formattedAmount,
      methods: formattedMethods
    };
  }
}