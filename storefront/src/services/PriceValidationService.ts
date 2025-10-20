import { medusaApiClient } from '../utils/medusaApiClient';
import { MedusaCart } from '../types/medusa';

export interface PriceValidationInput {
  cartId: string;
  selectedShippingOptionId?: string;
  clientTotal?: number;
  clientShipping?: number;
  clientSubtotal?: number;
  clientTax?: number;
}

export interface ServerCalculatedPrices {
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
}

export interface PriceValidationResult {
  valid: boolean;
  serverPrices: ServerCalculatedPrices;
  clientPrices?: {
    total?: number;
    shipping?: number;
    subtotal?: number;
    tax?: number;
  };
  discrepancies?: {
    field: string;
    serverValue: number;
    clientValue: number;
    difference: number;
  }[];
  error?: string;
}

/**
 * Server-side price validation service to prevent price manipulation attacks
 * 
 * This service:
 * 1. Fetches cart from Medusa backend (source of truth)
 * 2. Calculates prices server-side based on cart data
 * 3. Validates against client-provided values
 * 4. Detects and logs potential price manipulation attempts
 */
export class PriceValidationService {
  private static readonly TOLERANCE = 0.01; // 1 paisa tolerance for rounding

  /**
   * Calculate server-side prices from cart data
   */
  public static calculateServerPrices(
    cart: MedusaCart,
    selectedShippingOptionId?: string
  ): ServerCalculatedPrices {
    // Calculate subtotal from cart items
    const subtotal = cart.items?.reduce((sum, item) => {
      return sum + (Number(item.unit_price) * Number(item.quantity));
    }, 0) || 0;

    // Calculate shipping based on selected option or cart's shipping total
    let shipping = 0;
    
    if (selectedShippingOptionId && cart.shipping_methods) {
      // Find the selected shipping method in cart by ID
      const method = cart.shipping_methods.find(m => m.id === selectedShippingOptionId);
      shipping = method ? Number(method.amount || 0) : Number(cart.shipping_total || 0);
    } else {
      // Use cart's calculated shipping total
      shipping = Number(cart.shipping_total || 0);
    }

    // Use cart's calculated tax and discount
    const tax = Number(cart.tax_total || 0);
    const discount = Number(cart.discount_total || 0);

    // Calculate total
    const total = subtotal + shipping + tax - discount;

    return {
      subtotal,
      shipping,
      tax,
      discount,
      total,
      currency: cart.currency_code || 'INR'
    };
  }

  /**
   * Validate client-provided prices against server-calculated prices
   */
  public static async validatePrices(
    input: PriceValidationInput
  ): Promise<PriceValidationResult> {
    try {
      // 1. Fetch cart from backend (source of truth)
      const cart = await medusaApiClient.getCart(input.cartId);

      // 2. Calculate server-side prices
      const serverPrices = this.calculateServerPrices(cart, input.selectedShippingOptionId);

      // 3. If no client prices provided, just return server prices
      if (
        input.clientTotal === undefined &&
        input.clientShipping === undefined &&
        input.clientSubtotal === undefined &&
        input.clientTax === undefined
      ) {
        return {
          valid: true,
          serverPrices
        };
      }

      // 4. Compare client prices with server prices
      const discrepancies: Array<{
        field: string;
        serverValue: number;
        clientValue: number;
        difference: number;
      }> = [];

      if (input.clientTotal !== undefined) {
        const diff = Math.abs(serverPrices.total - input.clientTotal);
        if (diff > this.TOLERANCE) {
          discrepancies.push({
            field: 'total',
            serverValue: serverPrices.total,
            clientValue: input.clientTotal,
            difference: diff
          });
        }
      }

      if (input.clientShipping !== undefined) {
        const diff = Math.abs(serverPrices.shipping - input.clientShipping);
        if (diff > this.TOLERANCE) {
          discrepancies.push({
            field: 'shipping',
            serverValue: serverPrices.shipping,
            clientValue: input.clientShipping,
            difference: diff
          });
        }
      }

      if (input.clientSubtotal !== undefined) {
        const diff = Math.abs(serverPrices.subtotal - input.clientSubtotal);
        if (diff > this.TOLERANCE) {
          discrepancies.push({
            field: 'subtotal',
            serverValue: serverPrices.subtotal,
            clientValue: input.clientSubtotal,
            difference: diff
          });
        }
      }

      if (input.clientTax !== undefined) {
        const diff = Math.abs(serverPrices.tax - input.clientTax);
        if (diff > this.TOLERANCE) {
          discrepancies.push({
            field: 'tax',
            serverValue: serverPrices.tax,
            clientValue: input.clientTax,
            difference: diff
          });
        }
      }

      // 5. Log potential fraud attempts
      if (discrepancies.length > 0) {
        console.error('[PRICE_VALIDATION] Price mismatch detected', {
          cartId: input.cartId,
          selectedShippingOptionId: input.selectedShippingOptionId,
          serverPrices,
          clientPrices: {
            total: input.clientTotal,
            shipping: input.clientShipping,
            subtotal: input.clientSubtotal,
            tax: input.clientTax
          },
          discrepancies,
          severity: discrepancies.some(d => d.difference > 1) ? 'high' : 'medium'
        });
      }

      return {
        valid: discrepancies.length === 0,
        serverPrices,
        clientPrices: {
          total: input.clientTotal,
          shipping: input.clientShipping,
          subtotal: input.clientSubtotal,
          tax: input.clientTax
        },
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined
      };

    } catch (error: any) {
      console.error('[PRICE_VALIDATION] Validation failed', {
        cartId: input.cartId,
        error: error?.message || String(error)
      });

      return {
        valid: false,
        serverPrices: {
          subtotal: 0,
          shipping: 0,
          tax: 0,
          discount: 0,
          total: 0,
          currency: 'INR'
        },
        error: error?.message || 'Price validation failed'
      };
    }
  }

  /**
   * Validate prices and throw error if invalid (for use in critical flows)
   */
  public static async validatePricesStrict(
    input: PriceValidationInput
  ): Promise<ServerCalculatedPrices> {
    const result = await this.validatePrices(input);

    if (!result.valid) {
      const errorMessage = result.error || 'Price validation failed. Please refresh and try again.';
      
      // Create detailed error for logging
      const errorDetails = {
        cartId: input.cartId,
        discrepancies: result.discrepancies,
        serverPrices: result.serverPrices,
        clientPrices: result.clientPrices
      };
      
      console.error('[PRICE_VALIDATION] Strict validation failed', errorDetails);
      
      throw new Error(errorMessage);
    }

    return result.serverPrices;
  }

  /**
   * Format currency for display (matches PriceCalculationService)
   */
  public static formatCurrency(amount: number, currency: string = 'INR'): string {
    if (currency === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(amount);
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
