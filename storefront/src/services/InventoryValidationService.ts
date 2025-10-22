import { Product, ProductVariant } from '../types/medusa';

/**
 * Result of inventory availability check
 */
export interface InventoryCheckResult {
  available: boolean;
  availableQuantity: number;
  requestedQuantity: number;
  allowBackorder: boolean;
  inventoryManaged: boolean;
  message?: string;
}

/**
 * Result of cart item update validation
 */
export interface CartItemValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Service for validating inventory availability
 * Used to prevent overselling by checking stock before cart operations
 */
export class InventoryValidationService {
  private static readonly MAX_QUANTITY_PER_ITEM = 99;

  /**
   * Fetch product variant from Medusa API
   * @param variantId - Variant ID to fetch
   * @param productId - Optional product ID for optimized fetching
   */
  private static async fetchVariant(
    variantId: string,
    productId?: string
  ): Promise<ProductVariant | null> {
    try {
      // If we have product ID, fetch that specific product (more efficient)
      if (productId) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL}/store/products/${productId}?fields=+variants.inventory_quantity`,
          {
            headers: {
              'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '',
            },
          }
        );

        if (!response.ok) {
          console.error('[INVENTORY_CHECK] Failed to fetch product:', response.status);
          return null;
        }

        const data = await response.json();
        const product: Product = data.product;
        const variant = product.variants?.find((v) => v.id === variantId);

        if (variant) {
          return variant;
        }
      }

      // Fallback: fetch all products (less efficient but works if no product ID)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL}/store/products?fields=+variants.inventory_quantity`,
        {
          headers: {
            'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const products: Product[] = data.products || [];

      // Find the variant across all products
      for (const product of products) {
        const variant = product.variants?.find((v) => v.id === variantId);
        if (variant) {
          return variant;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate available inventory quantity for a variant (Medusa v2)
   * Uses the same approach as ProductDataMapper for consistency
   */
  private static calculateAvailableQuantity(variant: ProductVariant): {
    quantity: number;
    managed: boolean;
  } {
    const inventoryManaged = variant.manage_inventory ?? true;

    // If inventory is not managed, return unlimited
    if (!inventoryManaged) {
      return {
        quantity: Infinity,
        managed: false,
      };
    }

    let availableQuantity = 0;

    // Medusa v2: Use inventory_quantity field from Store API
    // This is already calculated by Medusa for the current sales channel
    if (typeof variant.inventory_quantity === 'number') {
      availableQuantity = Math.max(0, variant.inventory_quantity);
    } else {
      // Default to 0 if no inventory data available
      availableQuantity = 0;
    }

    return {
      quantity: availableQuantity,
      managed: true,
    };
  }

  /**
   * Check if requested quantity is available for a variant
   * @param variantId - The variant ID to check
   * @param requestedQuantity - The quantity being requested
   * @param productId - Optional product ID for optimized fetching
   * @returns InventoryCheckResult with availability status
   */
  static async checkVariantAvailability(
    variantId: string,
    requestedQuantity: number,
    productId?: string
  ): Promise<InventoryCheckResult> {
    // Validate quantity is positive integer
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return {
        available: false,
        availableQuantity: 0,
        requestedQuantity,
        allowBackorder: false,
        inventoryManaged: true,
        message: 'Quantity must be a positive integer',
      };
    }

    // Fetch variant from backend
    const variant = await this.fetchVariant(variantId, productId);

    if (!variant) {
      // If we can't fetch variant data, fail gracefully by allowing the operation
      // Backend will handle the validation
      return {
        available: true,
        availableQuantity: requestedQuantity,
        requestedQuantity,
        allowBackorder: false,
        inventoryManaged: false,
        message: 'Unable to verify stock availability',
      };
    }

    // Calculate available quantity
    const { quantity: availableQuantity, managed: inventoryManaged } =
      this.calculateAvailableQuantity(variant);

    const allowBackorder = variant.allow_backorder ?? false;

    // If inventory is not managed, allow any quantity
    if (!inventoryManaged) {
      return {
        available: true,
        availableQuantity: Infinity,
        requestedQuantity,
        allowBackorder: false,
        inventoryManaged: false,
      };
    }

    // Check if requested quantity is available
    const available = availableQuantity >= requestedQuantity || allowBackorder;

    // Generate appropriate message
    let message: string | undefined;
    if (!available) {
      message =
        availableQuantity > 0
          ? `Only ${availableQuantity} unit${availableQuantity !== 1 ? 's' : ''} available`
          : 'Out of stock';
    } else if (requestedQuantity > availableQuantity && allowBackorder) {
      const backorderCount = requestedQuantity - availableQuantity;
      message = `${backorderCount} unit${backorderCount !== 1 ? 's' : ''} will be backordered`;
    }

    return {
      available,
      availableQuantity,
      requestedQuantity,
      allowBackorder,
      inventoryManaged: true,
      message,
    };
  }

  /**
   * Validate cart item quantity update
   * Checks both inventory availability and quantity limits
   * @param variantId - The variant ID
   * @param currentQuantity - Current quantity in cart
   * @param newQuantity - New quantity being requested
   * @param productId - Optional product ID for optimized fetching
   * @returns CartItemValidationResult
   */
  static async validateCartItemUpdate(
    variantId: string,
    currentQuantity: number,
    newQuantity: number,
    productId?: string
  ): Promise<CartItemValidationResult> {
    // Validate quantity is positive integer
    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      return {
        valid: false,
        error: 'Quantity must be a positive integer',
      };
    }

    // Check maximum quantity limit
    if (newQuantity > this.MAX_QUANTITY_PER_ITEM) {
      return {
        valid: false,
        error: `Maximum quantity per item is ${this.MAX_QUANTITY_PER_ITEM}`,
      };
    }

    // Check inventory availability
    const inventoryCheck = await this.checkVariantAvailability(variantId, newQuantity, productId);

    if (!inventoryCheck.available) {
      return {
        valid: false,
        error: inventoryCheck.message || 'Insufficient stock',
      };
    }

    // Return success with warning if backorder
    if (inventoryCheck.message && inventoryCheck.allowBackorder) {
      return {
        valid: true,
        warning: inventoryCheck.message,
      };
    }

    return { valid: true };
  }

  /**
   * Validate quantity for add to cart operation
   * Similar to update but doesn't need current quantity
   * @param variantId - The variant ID
   * @param quantity - Quantity to add
   * @param productId - Optional product ID for optimized fetching
   * @returns CartItemValidationResult
   */
  static async validateAddToCart(
    variantId: string,
    quantity: number,
    productId?: string
  ): Promise<CartItemValidationResult> {
    // Validate quantity is positive integer
    if (!Number.isInteger(quantity) || quantity < 1) {
      return {
        valid: false,
        error: 'Quantity must be a positive integer',
      };
    }

    // Check maximum quantity limit
    if (quantity > this.MAX_QUANTITY_PER_ITEM) {
      return {
        valid: false,
        error: `Maximum quantity per item is ${this.MAX_QUANTITY_PER_ITEM}`,
      };
    }

    // Check inventory availability
    const inventoryCheck = await this.checkVariantAvailability(variantId, quantity, productId);

    if (!inventoryCheck.available) {
      return {
        valid: false,
        error: inventoryCheck.message || 'Insufficient stock',
      };
    }

    // Return success with warning if backorder
    if (inventoryCheck.message && inventoryCheck.allowBackorder) {
      return {
        valid: true,
        warning: inventoryCheck.message,
      };
    }

    return { valid: true };
  }

  /**
   * Get maximum allowed quantity for a variant
   * Used to set max attribute on quantity inputs
   * @param variantId - The variant ID
   * @param productId - Optional product ID for optimized fetching
   * @returns Maximum allowed quantity
   */
  static async getMaxAllowedQuantity(variantId: string, productId?: string): Promise<number> {
    const variant = await this.fetchVariant(variantId, productId);

    if (!variant) {
      return this.MAX_QUANTITY_PER_ITEM;
    }

    const { quantity: availableQuantity, managed: inventoryManaged } =
      this.calculateAvailableQuantity(variant);

    // If inventory is not managed, return max limit
    if (!inventoryManaged) {
      return this.MAX_QUANTITY_PER_ITEM;
    }

    // If backorders allowed, return max limit
    if (variant.allow_backorder) {
      return this.MAX_QUANTITY_PER_ITEM;
    }

    // Return the lesser of available quantity and max limit
    return Math.min(availableQuantity, this.MAX_QUANTITY_PER_ITEM);
  }
}
