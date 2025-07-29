import { Product, ProductVariant, ProductImage, MoneyAmount } from '../types/medusa';
import { AggregatedInventoryInfo, InventoryInfo } from '../types/inventory';

export interface ProductCardData {
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
      console.error('Error processing product metadata:', error);
      return null;
    }
  }

  /**
   * Extracts comprehensive inventory information including stock status, quantities,
   * and backorder settings across all variants
   */
  static extractInventoryInfo(product: Product): AggregatedInventoryInfo {
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
    let totalQuantity = 0;
    let availableVariants = 0;
    let hasBackorderVariants = false;
    let hasManagedInventory = false;

    // Analyze each variant
    for (const variant of product.variants) {
      // Handle Medusa v2 inventory structure
      let variantQuantity = 0;
      
      // Check if variant has inventory_quantity (Medusa v1 style)
      if (typeof variant.inventory_quantity === 'number') {
        variantQuantity = variant.inventory_quantity;
      } 
      // Check for Medusa v2 inventory structure
      else if (variant.inventory_items && variant.inventory_items.length > 0) {
        const inventoryItem = variant.inventory_items[0];
        if (inventoryItem.inventory?.location_levels && inventoryItem.inventory.location_levels.length > 0) {
          variantQuantity = inventoryItem.inventory.location_levels[0].available_quantity || 0;
        }
      }
      
      totalQuantity += variantQuantity;
      
      if (variantQuantity > 0) {
        availableVariants++;
      }
      
      if (variant.allow_backorder) {
        hasBackorderVariants = true;
      }
      
      if (variant.manage_inventory) {
        hasManagedInventory = true;
      }
    }

    // Determine overall stock status
    const inStock = totalQuantity > 0;
    const status = inStock 
      ? 'in_stock'
      : hasBackorderVariants 
        ? 'backorder'
        : 'out_of_stock';

    return {
      inStock,
      quantity: totalQuantity,
      allowBackorder: hasBackorderVariants,
      managed: hasManagedInventory,
      status,
      totalQuantity,
      availableVariants,
      totalVariants
    };
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
   */
  private static processImageUrl(url: string): string {
    if (!url) {
      return this.FALLBACK_IMAGE;
    }

    // If URL is already absolute, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // If URL starts with /, it might be a backend static file
    if (url.startsWith('/')) {
      // Check if it's a static file that should be served from backend
      if (url.startsWith('/static/') || url.includes('static')) {
        const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
        return `${backendUrl}${url}`;
      }
      return url;
    }

    // Otherwise, assume it needs to be prefixed with backend URL for static files
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
    return `${backendUrl}/${url}`;
  }

  /**
   * Calculates price information from product variants
   */
  static calculatePrice(variants: ProductVariant[]): PriceCalculationResult {
    console.log('[ProductDataMapper] calculatePrice input:', {
      variantsCount: variants?.length || 0,
      variants: variants?.map(v => ({
        id: v.id,
        title: v.title,
        prices: v.prices
      }))
    });

    if (!variants || variants.length === 0) {
      console.log('[ProductDataMapper] No variants found, returning price 0');
      return { price: 0 };
    }

    const priceData = this.extractPricesFromVariants(variants);
    
    console.log('[ProductDataMapper] Extracted price data:', priceData);
    
    if (priceData.length === 0) {
      console.log('[ProductDataMapper] No price data found, returning price 0');
      return { price: 0 };
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

    console.log('[ProductDataMapper] Final price calculation result:', result);
    
    return result;
  }

  /**
   * Extracts price data from variants, using the first available currency
   */
  private static extractPricesFromVariants(variants: ProductVariant[]): Array<{amount: number, currency_code: string}> {
    const prices: Array<{amount: number, currency_code: string}> = [];

    console.log('[ProductDataMapper] extractPricesFromVariants input:', variants.length, 'variants');

    for (const variant of variants) {
      console.log('[ProductDataMapper] Processing variant:', {
        id: variant.id,
        title: variant.title,
        pricesCount: variant.prices?.length || 0,
        prices: variant.prices,
        rawVariant: variant // Log the entire variant to see structure
      });

      if (!variant.prices || variant.prices.length === 0) {
        console.log('[ProductDataMapper] Variant has no prices, skipping');
        continue;
      }

      // Try all prices, not just the first one
      for (const price of variant.prices) {
        console.log('[ProductDataMapper] Processing price:', price);

        if (price && typeof price.amount === 'number' && price.amount > 0) {
          prices.push({
            amount: price.amount,
            currency_code: price.currency_code
          });
          console.log('[ProductDataMapper] Added price:', { amount: price.amount, currency_code: price.currency_code });
        } else {
          console.log('[ProductDataMapper] Price is invalid or zero:', {
            price,
            amount: price?.amount,
            amountType: typeof price?.amount,
            isPositive: price?.amount > 0
          });
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