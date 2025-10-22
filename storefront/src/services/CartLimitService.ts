/**
 * Cart Limit Service
 * 
 * Enforces cart-wide limits to prevent abuse and ensure system stability:
 * - Maximum items per cart
 * - Maximum quantity per item
 * - Maximum cart value
 * - Maximum unique variants
 * 
 * Security: Prevents cart manipulation attacks and resource exhaustion
 */

import { MedusaCart, MedusaLineItem } from '../types/medusa';

export interface CartLimits {
  MAX_ITEMS_PER_CART: number;
  MAX_QUANTITY_PER_ITEM: number;
  MAX_CART_VALUE: number;
  MAX_UNIQUE_VARIANTS: number;
}

export interface CartLimitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  currentStats?: {
    totalItems: number;
    totalValue: number;
    uniqueVariants: number;
  };
}

export class CartLimitService {
  // Cart-wide limits (configurable)
  private static readonly LIMITS: CartLimits = {
    MAX_ITEMS_PER_CART: 50,
    MAX_QUANTITY_PER_ITEM: 99,
    MAX_CART_VALUE: 10_00_000, // 10 lakh INR
    MAX_UNIQUE_VARIANTS: 20,
  };

  /**
   * Get current cart limits configuration
   */
  static getLimits(): CartLimits {
    return { ...this.LIMITS };
  }

  /**
   * Calculate current cart statistics
   */
  static getCartStats(cart: MedusaCart): {
    totalItems: number;
    totalValue: number;
    uniqueVariants: number;
  } {
    const items = cart.items || [];
    
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    
    // Calculate total value (subtotal + shipping + tax)
    const subtotal = items.reduce(
      (sum, item) => sum + (Number(item.unit_price) * item.quantity),
      0
    );
    const shipping = Number(cart.shipping_total || 0);
    const tax = Number(cart.tax_total || 0);
    const totalValue = subtotal + shipping + tax;
    
    const uniqueVariants = new Set(items.map(item => item.variant_id)).size;

    return {
      totalItems,
      totalValue,
      uniqueVariants,
    };
  }

  /**
   * Validate if adding an item would exceed cart limits
   * 
   * @param cart - Current cart
   * @param variantId - Variant ID to add
   * @param quantityToAdd - Quantity to add
   * @param estimatedUnitPrice - Estimated unit price (optional, for value limit check)
   * @returns Validation result with errors and warnings
   */
  static validateAddToCart(
    cart: MedusaCart | null,
    variantId: string,
    quantityToAdd: number,
    estimatedUnitPrice?: number
  ): CartLimitValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // If no cart, this is the first item - always allow
    if (!cart) {
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    }

    const stats = this.getCartStats(cart);
    const items = cart.items || [];

    // Check if variant already exists in cart
    const existingItem = items.find(item => item.variant_id === variantId);
    const currentQuantity = existingItem?.quantity || 0;
    const newQuantity = currentQuantity + quantityToAdd;

    // 1. Check quantity per item limit
    if (newQuantity > this.LIMITS.MAX_QUANTITY_PER_ITEM) {
      errors.push(
        `Cannot add ${quantityToAdd} item${quantityToAdd !== 1 ? 's' : ''}. ` +
        `Maximum quantity per item is ${this.LIMITS.MAX_QUANTITY_PER_ITEM}. ` +
        `You currently have ${currentQuantity} of this item.`
      );
    }

    // 2. Check total items limit
    const newTotalItems = stats.totalItems + quantityToAdd;
    if (newTotalItems > this.LIMITS.MAX_ITEMS_PER_CART) {
      errors.push(
        `Cannot add ${quantityToAdd} item${quantityToAdd !== 1 ? 's' : ''}. ` +
        `Maximum items per cart is ${this.LIMITS.MAX_ITEMS_PER_CART}. ` +
        `Your cart currently has ${stats.totalItems} items.`
      );
    }

    // 3. Check unique variants limit (only if adding a new variant)
    if (!existingItem) {
      const newUniqueVariants = stats.uniqueVariants + 1;
      if (newUniqueVariants > this.LIMITS.MAX_UNIQUE_VARIANTS) {
        errors.push(
          `Cannot add more product variants. ` +
          `Maximum ${this.LIMITS.MAX_UNIQUE_VARIANTS} different products allowed per cart. ` +
          `Your cart currently has ${stats.uniqueVariants} different products.`
        );
      }
    }

    // 4. Check cart value limit (if price is provided)
    if (estimatedUnitPrice !== undefined && estimatedUnitPrice > 0) {
      const estimatedAddedValue = estimatedUnitPrice * quantityToAdd;
      const newTotalValue = stats.totalValue + estimatedAddedValue;
      
      if (newTotalValue > this.LIMITS.MAX_CART_VALUE) {
        errors.push(
          `Cannot add items. Maximum cart value is ₹${this.formatCurrency(this.LIMITS.MAX_CART_VALUE)}. ` +
          `Your cart would be ₹${this.formatCurrency(newTotalValue)}.`
        );
      }

      // Warning at 80% of limit
      if (newTotalValue > this.LIMITS.MAX_CART_VALUE * 0.8 && newTotalValue <= this.LIMITS.MAX_CART_VALUE) {
        warnings.push(
          `Your cart is approaching the maximum value limit of ₹${this.formatCurrency(this.LIMITS.MAX_CART_VALUE)}.`
        );
      }
    }

    // Warning at 80% of item limit
    if (newTotalItems > this.LIMITS.MAX_ITEMS_PER_CART * 0.8 && newTotalItems <= this.LIMITS.MAX_ITEMS_PER_CART) {
      warnings.push(
        `Your cart is approaching the maximum item limit of ${this.LIMITS.MAX_ITEMS_PER_CART} items.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      currentStats: stats,
    };
  }

  /**
   * Validate if updating a quantity would exceed limits
   * 
   * @param cart - Current cart
   * @param lineItemId - Line item ID to update
   * @param newQuantity - New quantity
   * @returns Validation result
   */
  static validateUpdateQuantity(
    cart: MedusaCart,
    lineItemId: string,
    newQuantity: number
  ): CartLimitValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const items = cart.items || [];
    const item = items.find(i => i.id === lineItemId);

    if (!item) {
      errors.push('Item not found in cart');
      return { valid: false, errors, warnings };
    }

    const stats = this.getCartStats(cart);
    const currentQuantity = item.quantity;
    const quantityDifference = newQuantity - currentQuantity;

    // 1. Check quantity per item limit
    if (newQuantity > this.LIMITS.MAX_QUANTITY_PER_ITEM) {
      errors.push(
        `Maximum quantity per item is ${this.LIMITS.MAX_QUANTITY_PER_ITEM}`
      );
    }

    // 2. Check total items limit
    const newTotalItems = stats.totalItems + quantityDifference;
    if (newTotalItems > this.LIMITS.MAX_ITEMS_PER_CART) {
      errors.push(
        `Cannot increase quantity. Maximum items per cart is ${this.LIMITS.MAX_ITEMS_PER_CART}. ` +
        `Your cart currently has ${stats.totalItems} items.`
      );
    }

    // 3. Check cart value limit
    const itemValue = Number(item.unit_price) * quantityDifference;
    const newTotalValue = stats.totalValue + itemValue;
    
    if (newTotalValue > this.LIMITS.MAX_CART_VALUE) {
      errors.push(
        `Cannot update quantity. Maximum cart value is ₹${this.formatCurrency(this.LIMITS.MAX_CART_VALUE)}.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      currentStats: stats,
    };
  }

  /**
   * Validate entire cart against limits
   * 
   * @param cart - Cart to validate
   * @returns Validation result
   */
  static validateCartLimits(cart: MedusaCart): CartLimitValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const stats = this.getCartStats(cart);

    // Check total items
    if (stats.totalItems > this.LIMITS.MAX_ITEMS_PER_CART) {
      errors.push(
        `Cart has ${stats.totalItems} items. Maximum is ${this.LIMITS.MAX_ITEMS_PER_CART}.`
      );
    }

    // Check unique variants
    if (stats.uniqueVariants > this.LIMITS.MAX_UNIQUE_VARIANTS) {
      errors.push(
        `Cart has ${stats.uniqueVariants} different products. Maximum is ${this.LIMITS.MAX_UNIQUE_VARIANTS}.`
      );
    }

    // Check individual item quantities
    const items = cart.items || [];
    items.forEach(item => {
      if (item.quantity > this.LIMITS.MAX_QUANTITY_PER_ITEM) {
        errors.push(
          `Item "${item.title}" has quantity ${item.quantity}. Maximum per item is ${this.LIMITS.MAX_QUANTITY_PER_ITEM}.`
        );
      }
    });

    // Check cart value
    if (stats.totalValue > this.LIMITS.MAX_CART_VALUE) {
      errors.push(
        `Cart value is ₹${this.formatCurrency(stats.totalValue)}. Maximum is ₹${this.formatCurrency(this.LIMITS.MAX_CART_VALUE)}.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      currentStats: stats,
    };
  }

  /**
   * Format currency value for display
   */
  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Check if adding quantity is valid (basic check)
   * 
   * @param quantity - Quantity to validate
   * @returns Error message if invalid, null if valid
   */
  static validateQuantityInput(quantity: number): string | null {
    if (!Number.isInteger(quantity)) {
      return 'Quantity must be a whole number';
    }

    if (quantity < 1) {
      return 'Quantity must be at least 1';
    }

    if (quantity > this.LIMITS.MAX_QUANTITY_PER_ITEM) {
      return `Maximum quantity per item is ${this.LIMITS.MAX_QUANTITY_PER_ITEM}`;
    }

    return null;
  }
}
