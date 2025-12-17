import { Product, ProductVariant, ProductImage, MoneyAmount } from '../types/medusa';
import { AggregatedInventoryInfo, InventoryInfo } from '../types/inventory';

export interface ProductCardData {
  // Core identity used across the app
  id: string;

  // Existing fields
  title: string;
  backgroundImage: string;
  foregroundImage: string;
  price?: number;
  originalPrice?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  material?: string;
  dimensions?: string;

  // New comprehensive fields
  description?: string | null;
  subtitle?: string | null;
  weight?: number | null;
  weightUnit?: string;
  technicalSpecs?: {
    hsCode?: string | null;
    originCountry?: string | null;
    midCode?: string | null;
    sku?: string | null;
    barcode?: string | null;
    ean?: string | null;
    upc?: string | null;
  };
  inventory?: {
    quantity?: number | null;
    allowBackorder?: boolean;
    manageInventory?: boolean;
  };
  metadata?: Record<string, any> | null;
  status?: 'draft' | 'proposed' | 'published' | 'rejected';
  isGiftcard?: boolean;
  discountable?: boolean;
  inStock?: boolean;
}

export interface PriceCalculationResult {
  price: number;
  originalPrice?: number;
  currency?: string;
}

export class ProductDataMapper {
  private static readonly FALLBACK_IMAGE = '/images/placeholder-product.svg';
  private static readonly FALLBACK_BACKGROUND = '/images/placeholder-background.svg';

  /**
   * Maps a Medusa product to ProductCardData format
   */
  static mapToProductCard(medusaProduct: Product): ProductCardData {
    const inventoryInfo = this.extractInventoryInfo(medusaProduct);

    return {
      id: medusaProduct.id,
      title: medusaProduct.title,
      backgroundImage: this.extractBackgroundImage(medusaProduct.images),
      foregroundImage: this.extractPrimaryImage(medusaProduct.images),
      ...this.calculatePrice(medusaProduct.variants),
      material: this.extractMaterial(medusaProduct.variants, medusaProduct.material),
      dimensions: this.determineDimensions(medusaProduct),
      inventory: inventoryInfo,
      inStock: inventoryInfo.inStock,
      description: this.extractDescription(medusaProduct),
      subtitle: this.extractSubtitle(medusaProduct),
      ...this.extractWeight(medusaProduct),
      technicalSpecs: this.extractTechnicalSpecs(medusaProduct),
      metadata: this.extractMetadata(medusaProduct),
      // Note: rating and reviewCount are not available in Medusa by default
      // These would need to be added through custom fields or separate review system
      rating: undefined,
      reviewCount: undefined,
    };
  }

  /**
   * Extracts product description with null handling
   */
  static extractDescription(product: Product): string | null {
    return product.description || null;
  }

  /**
   * Extracts product subtitle with null handling
   */
  static extractSubtitle(product: Product): string | null {
    return product.subtitle || null;
  }

  /**
   * Extracts weight information with unit formatting
   */
  static extractWeight(product: Product): { weight: number | null; weightUnit: string } {
    const weight = product.weight || product.variants?.[0]?.weight || null;
    // Assuming the weight from Medusa is in grams.
    const weightUnit = weight !== null ? 'g' : '';
    return { weight, weightUnit };
  }

  /**
   * Extracts technical specifications (HS code, origin, etc.)
   */
  static extractTechnicalSpecs(product: Product): ProductCardData['technicalSpecs'] {
    const firstVariant = product.variants?.[0];

    return {
      hsCode: product.hs_code || firstVariant?.hs_code || null,
      originCountry: product.origin_country || firstVariant?.origin_country || null,
      midCode: product.mid_code || firstVariant?.mid_code || null,
      sku: firstVariant?.sku || null,
      barcode: firstVariant?.barcode || null,
      ean: firstVariant?.ean || null,
      upc: firstVariant?.upc || null,
    };
  }

  /**
   * Safely processes and validates product metadata
   * Handles JSON parsing errors and sanitizes metadata fields
   */
  static extractMetadata(product: Product): Record<string, any> | null {
    try {
      if (!product.metadata) {
        return null;
      }

      // Create a new object to store sanitized metadata
      const sanitizedMetadata: Record<string, any> = {};

      // Process each metadata field
      for (const [key, value] of Object.entries(product.metadata)) {
        // Skip null or undefined values
        if (value == null) continue;

        // Handle different value types appropriately
        if (typeof value === 'string') {
          // Try parsing JSON strings
          try {
            sanitizedMetadata[key] = JSON.parse(value);
          } catch {
            // If not JSON, store as is after trimming
            sanitizedMetadata[key] = value.trim();
          }
        } else if (typeof value === 'object') {
          // Deep clone objects to prevent mutations
          sanitizedMetadata[key] = JSON.parse(JSON.stringify(value));
        } else {
          // For primitive types, store as is
          sanitizedMetadata[key] = value;
        }
      }

      return Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : null;
    } catch (error) {
      // Log error but don't break the application
      return null;
    }
  }

  /**
   * Extracts comprehensive inventory information including stock status, quantities,
   * and backorder settings across all variants
   * 
   * NOTE: This is a preliminary check based on API data.
   * For real-time inventory, use getProductInventory() utility instead.
   */
  static extractInventoryInfo(product: Product): AggregatedInventoryInfo {
    console.log('[ProductDataMapper] Extracting inventory info:', {
      productId: product.id,
      productTitle: product.title,
      variantCount: product.variants?.length,
      firstVariant: product.variants?.[0] ? {
        id: product.variants[0].id,
        inventory_quantity: product.variants[0].inventory_quantity,
        manage_inventory: product.variants[0].manage_inventory,
        allow_backorder: product.variants[0].allow_backorder,
        variantKeys: Object.keys(product.variants[0])
      } : null
    });

    if (!product.variants || product.variants.length === 0) {
      return {
        inStock: false,
        quantity: 0,
        allowBackorder: false,
        managed: false,
        status: 'out_of_stock',
        totalQuantity: 0,
        availableVariants: 0,
        totalVariants: 0
      };
    }

    const totalVariants = product.variants.length;
    let totalQuantity = 0; // legacy aggregate, kept for compatibility
    let availableVariants = 0;
    let hasBackorderVariants = false;
    let hasManagedInventory = false;
    let hasUnmanagedVariants = false;
    let totalEffectiveUnits = 0; // effective purchasable units across variants

    // Analyze each variant
    for (const variant of product.variants) {
      // Handle Medusa inventory structure (v1 and v2)
      let variantQuantity = 0; // raw available sum (for legacy displays)
      let variantEffectiveUnits = 0; // effective purchasable units considering required_quantity

      console.log('[ProductDataMapper] Processing variant:', {
        variantId: variant.id,
        inventory_quantity: variant.inventory_quantity,
        manage_inventory: variant.manage_inventory,
        allow_backorder: variant.allow_backorder
      });

      // Check if inventory is managed
      if (!variant.manage_inventory) {
        // Unmanaged inventory = always available
        variantQuantity = Infinity;
        variantEffectiveUnits = Infinity;
        hasUnmanagedVariants = true;
        console.log('[ProductDataMapper] Unmanaged inventory - always available');
      } else if (typeof variant.inventory_quantity === 'number') {
        // Use inventory_quantity from Store API (calculated by Medusa for the sales channel)
        variantQuantity = Math.max(0, variant.inventory_quantity);
        variantEffectiveUnits = variantQuantity;
        console.log('[ProductDataMapper] Using inventory_quantity:', variantQuantity);
      } else {
        // Medusa v2 doesn't provide inventory_quantity by default
        // Assume available for now - will be updated by real-time check
        console.warn('[ProductDataMapper] No inventory_quantity in API response');
        console.warn('[ProductDataMapper] Product will fetch real-time inventory separately');
        // Optimistic: assume 1 available so product shows as potentially in stock
        // Real check happens in ProductDetailPage
        variantQuantity = 1;
        variantEffectiveUnits = 1;
      }

      totalQuantity += variantQuantity;
      totalEffectiveUnits += variantEffectiveUnits;

      // Track flags
      if (variant.allow_backorder) {
        hasBackorderVariants = true;
      }
      if (variant.manage_inventory) {
        hasManagedInventory = true;
      } else {
        hasUnmanagedVariants = true;
      }

      // Determine if this variant is orderable
      const variantOrderable = !variant.manage_inventory
        ? true // unmanaged inventory => always available
        : (variantEffectiveUnits > 0) || variant.allow_backorder;

      if (variantOrderable) {
        availableVariants++;
      }
    }

    // Determine overall stock status
    const inStock = availableVariants > 0;
    const status: 'in_stock' | 'out_of_stock' | 'backorder' = totalQuantity > 0
      ? 'in_stock'
      : (hasBackorderVariants || hasUnmanagedVariants)
        ? 'backorder'
        : 'out_of_stock';

    const result: import('../types/inventory').AggregatedInventoryInfo = {
      inStock,
      // quantity reflects effective purchasable units where possible
      quantity: totalEffectiveUnits > 0 ? totalEffectiveUnits : totalQuantity,
      allowBackorder: hasBackorderVariants || hasUnmanagedVariants,
      managed: hasManagedInventory,
      status,
      totalQuantity: totalEffectiveUnits > 0 ? totalEffectiveUnits : totalQuantity,
      availableVariants,
      totalVariants
    };

    console.log('[ProductDataMapper] Final inventory result:', result);
    return result;
  }

  /**
   * Extracts the primary product image for foreground display
   */
  static extractPrimaryImage(images: ProductImage[]): string {
    if (!images || images.length === 0) {
      return this.FALLBACK_IMAGE;
    }

    // Use the first image as primary
    const primaryImage = images[0];
    return this.processImageUrl(primaryImage.url);
  }

  /**
   * Extracts or generates background image
   */
  static extractBackgroundImage(images: ProductImage[]): string {
    if (!images || images.length === 0) {
      return this.FALLBACK_BACKGROUND;
    }

    // Use second image as background if available, otherwise use primary
    const backgroundImage = images.length > 1 ? images[1] : images[0];
    return this.processImageUrl(backgroundImage.url);
  }

  /**
   * Processes image URL to ensure it's properly formatted
   * Transforms localhost URLs to production backend URL
   */
  private static processImageUrl(url: string): string {
    if (!url) {
      return this.FALLBACK_IMAGE;
    }

    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'https://admin.shilamurti.com';

    // Transform localhost URLs to production backend URL
    if (url.includes('localhost:9000') || url.includes('127.0.0.1:9000')) {
      // Replace localhost with production backend URL
      return url
        .replace('http://localhost:9000', backendUrl)
        .replace('http://127.0.0.1:9000', backendUrl);
    }

    // If URL is already absolute and not localhost, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // If URL starts with /, it might be a backend static file
    if (url.startsWith('/')) {
      // Check if it's a static file that should be served from backend
      if (url.startsWith('/static/') || url.includes('static')) {
        return `${backendUrl}${url}`;
      }
      return url;
    }

    // Otherwise, assume it needs to be prefixed with backend URL for static files
    return `${backendUrl}/${url}`;
  }

  /**
   * Calculates price information from product variants
   */
  static calculatePrice(variants: ProductVariant[]): PriceCalculationResult {

    if (!variants || variants.length === 0) {
      return { price: 0, currency: 'INR' };
    }

    const priceData = this.extractPricesFromVariants(variants);


    if (priceData.length === 0) {
      return { price: 0, currency: 'INR' };
    }

    // Sort prices to find min and max
    const sortedPrices = priceData.sort((a, b) => a.amount - b.amount);
    const minPriceData = sortedPrices[0];
    const maxPriceData = sortedPrices[sortedPrices.length - 1];

    // Use the price as-is (your Medusa setup stores prices as whole currency units, not cents)
    const price = minPriceData.amount;

    // Only show original price if there's a significant difference (more than 10%)
    const originalPrice = maxPriceData.amount > minPriceData.amount * 1.1 ? maxPriceData.amount : undefined;

    const result = {
      price,
      originalPrice,
      currency: minPriceData.currency_code.toUpperCase()
    };


    return result;
  }

  /**
   * Extracts price data from variants, using the first available currency
   */
  private static extractPricesFromVariants(variants: ProductVariant[]): Array<{ amount: number, currency_code: string }> {
    const prices: Array<{ amount: number, currency_code: string }> = [];

    console.log('[ProductDataMapper] Extracting prices from variants:', {
      variantCount: variants?.length,
      firstVariant: variants?.[0] ? {
        id: variants[0].id,
        title: variants[0].title,
        prices: variants[0].prices,
        calculated_price: (variants[0] as any).calculated_price,
        variantKeys: Object.keys(variants[0])
      } : null
    });

    for (const variant of variants) {
      // Medusa v2 might use calculated_price instead of prices array
      const variantAny = variant as any;

      // Try calculated_price first (Medusa v2)
      if (variantAny.calculated_price) {
        const calculatedPrice = variantAny.calculated_price;
        if (calculatedPrice.calculated_amount !== undefined) {
          prices.push({
            amount: calculatedPrice.calculated_amount, // Price is already in correct currency units
            currency_code: calculatedPrice.currency_code || 'inr'
          });
          console.log('[ProductDataMapper] Using calculated_price:', calculatedPrice);
          continue;
        }
      }

      // Fallback to prices array (Medusa v1 style)
      if (!variant.prices || variant.prices.length === 0) {
        console.warn('[ProductDataMapper] No prices found for variant:', variant.id);
        continue;
      }

      // Try all prices, not just the first one
      for (const price of variant.prices) {
        if (price && typeof price.amount === 'number' && price.amount > 0) {
          prices.push({
            amount: price.amount, // Price is already in correct currency units
            currency_code: price.currency_code
          });
          console.log('[ProductDataMapper] Using prices array:', price);
        }
      }
    }

    console.log('[ProductDataMapper] Final extracted prices:', prices);
    return prices;
  }

  /**
   * Determines product dimensions from product or variant data
   */
  static determineDimensions(product: Product): string {
    // Check product-level dimensions first
    if (product.length && product.width && product.height) {
      return this.formatDimensions(product.length, product.width, product.height);
    }

    // Check variant dimensions
    for (const variant of product.variants || []) {
      if (variant.length && variant.width && variant.height) {
        return this.formatDimensions(variant.length, variant.width, variant.height);
      }
    }

    return '';
  }

  /**
   * Formats dimensions into a readable string
   */
  private static formatDimensions(length: number, width: number, height: number): string {
    // Assuming dimensions are in centimeters, format to reasonable precision
    const formatDimension = (dim: number): string => {
      return dim % 1 === 0 ? dim.toString() : dim.toFixed(1);
    };

    return `${formatDimension(length)} × ${formatDimension(width)} × ${formatDimension(height)} cm`;
  }

  /**
   * Extracts material information from variants or product
   */
  static extractMaterial(variants: ProductVariant[], productMaterial?: string | null): string {
    // Check product-level material first
    if (productMaterial) {
      return productMaterial;
    }

    // Check variant materials
    for (const variant of variants || []) {
      if (variant.material) {
        return variant.material;
      }
    }

    // Check variant options for material-related fields
    for (const variant of variants || []) {
      if (!variant.options) continue;

      for (const option of variant.options) {
        const optionTitle = option.option_id?.toLowerCase() || '';
        const optionValue = option.value?.toLowerCase() || '';

        // Look for material-related option names
        if (optionTitle.includes('material') ||
          optionTitle.includes('stone') ||
          optionTitle.includes('type')) {
          return option.value;
        }

        // Look for common material values
        if (this.isMaterialValue(optionValue)) {
          return option.value;
        }
      }
    }

    return '';
  }

  /**
   * Checks if a value appears to be a material
   */
  private static isMaterialValue(value: string): boolean {
    const materialKeywords = [
      'marble', 'granite', 'stone', 'ceramic', 'porcelain',
      'wood', 'metal', 'glass', 'plastic', 'fabric',
      'leather', 'cotton', 'silk', 'wool', 'linen'
    ];

    return materialKeywords.some(keyword => value.includes(keyword));
  }
}
