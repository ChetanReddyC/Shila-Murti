import { NextRequest, NextResponse } from 'next/server';
import { PriceValidationService } from '@/services/PriceValidationService';

/**
 * POST /api/checkout/validate-pricing
 * 
 * Validates client-provided prices against server-calculated prices
 * to prevent price manipulation attacks.
 * 
 * Request body:
 * {
 *   cartId: string;
 *   selectedShippingOptionId?: string;
 *   clientTotal?: number;
 *   clientShipping?: number;
 *   clientSubtotal?: number;
 *   clientTax?: number;
 * }
 * 
 * Response:
 * {
 *   valid: boolean;
 *   serverPrices: {
 *     subtotal: number;
 *     shipping: number;
 *     tax: number;
 *     discount: number;
 *     total: number;
 *     currency: string;
 *   };
 *   clientPrices?: {...};
 *   discrepancies?: Array<{
 *     field: string;
 *     serverValue: number;
 *     clientValue: number;
 *     difference: number;
 *   }>;
 *   error?: string;
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      cartId,
      selectedShippingOptionId,
      clientTotal,
      clientShipping,
      clientSubtotal,
      clientTax
    } = body;

    // Validate required fields
    if (!cartId || typeof cartId !== 'string') {
      return NextResponse.json(
        {
          valid: false,
          error: 'cartId is required'
        },
        { status: 400 }
      );
    }

    // Log validation request for monitoring
    console.log('[PRICE_VALIDATION_API] Validation request', {
      cartId,
      selectedShippingOptionId,
      hasClientTotal: clientTotal !== undefined,
      hasClientShipping: clientShipping !== undefined,
      timestamp: new Date().toISOString()
    });

    // Perform validation
    const result = await PriceValidationService.validatePrices({
      cartId,
      selectedShippingOptionId,
      clientTotal,
      clientShipping,
      clientSubtotal,
      clientTax
    });

    // Log result
    if (!result.valid) {
      console.warn('[PRICE_VALIDATION_API] Validation failed', {
        cartId,
        discrepancies: result.discrepancies,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown'
      });
    } else {
      console.log('[PRICE_VALIDATION_API] Validation passed', {
        cartId,
        serverTotal: result.serverPrices.total
      });
    }

    // Return validation result
    return NextResponse.json(result, {
      status: result.valid ? 200 : 400
    });

  } catch (error: any) {
    console.error('[PRICE_VALIDATION_API] Error', {
      error: error?.message || String(error),
      stack: error?.stack
    });

    return NextResponse.json(
      {
        valid: false,
        error: 'Price validation failed. Please try again.'
      },
      { status: 500 }
    );
  }
}
