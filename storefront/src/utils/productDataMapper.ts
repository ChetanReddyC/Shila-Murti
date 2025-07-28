import { Product, ProductVariant, ProductImage, MoneyAmount } from '../types/medusa';

export interface ProductCardData {
  title: string;
  backgroundImage: string;
  foregroundImage: string;
  price?: number;
  originalPrice?: number;
  rating?: number;
  reviewCount?: number;
  material?: string;
  dimensions?: string;
  inStock?: boolean;
}

export interface PriceCalculationResult {
  price: number;
  originalPrice?: number;
}

export class ProductDataMapper {
  private static readonly DEFAULT_CURRENCY = 'usd';
  private static readonly FALLBACK_IMAGE = '/images/placeholder-product.svg';
  private static readonly FALLBACK_BACKGROUND = '/images/placeholder-background.svg';

  /**
   * Maps a Medusa product to ProductCardData format
   */
  static mapToProductCard(medusaProduct: Product): ProductCardData {
    return {
      title: medusaProduct.title,
      backgroundImage: this.extractBackgroundImage(medusaProduct.images),
      foregroundImage: this.extractPrimaryImage(medusaProduct.images),
      ...this.calculatePrice(medusaProduct.variants),
      material: this.extractMaterial(medusaProduct.variants, medusaProduct.material),
      dimensions: this.determineDimensions(medusaProduct),
      inStock: this.checkStockStatus(medusaProduct.variants),
      // Note: rating and reviewCount are not available in Medusa by default
      // These would need to be added through custom fields or separate review system
      rating: undefined,
      reviewCount: undefined,
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

    // If URL starts with /, it's relative to domain root
    if (url.startsWith('/')) {
      return url;
    }

    // Otherwise, assume it needs to be prefixed
    return `/${url}`;
  }

  /**
   * Calculates price information from product variants
   */
  static calculatePrice(variants: ProductVariant[]): PriceCalculationResult {
    if (!variants || variants.length === 0) {
      return { price: 0 };
    }

    const prices = this.extractPricesFromVariants(variants);
    
    if (prices.length === 0) {
      return { price: 0 };
    }

    // Sort prices to find min and max
    const sortedPrices = prices.sort((a, b) => a - b);
    const minPrice = sortedPrices[0];
    const maxPrice = sortedPrices[sortedPrices.length - 1];

    // Convert from cents to dollars (Medusa stores prices in cents)
    const price = minPrice / 100;
    
    // Only show original price if there's a significant difference (more than 10%)
    const originalPrice = maxPrice > minPrice * 1.1 ? maxPrice / 100 : undefined;

    return { price, originalPrice };
  }

  /**
   * Extracts price amounts from variants, preferring USD
   */
  private static extractPricesFromVariants(variants: ProductVariant[]): number[] {
    const prices: number[] = [];

    for (const variant of variants) {
      if (!variant.prices || variant.prices.length === 0) {
        continue;
      }

      // Prefer USD currency, fall back to first available
      const preferredPrice = variant.prices.find(
        price => price.currency_code.toLowerCase() === this.DEFAULT_CURRENCY
      ) || variant.prices[0];

      if (preferredPrice && preferredPrice.amount > 0) {
        prices.push(preferredPrice.amount);
      }
    }

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

  /**
   * Determines stock status from variants
   */
  static checkStockStatus(variants: ProductVariant[]): boolean {
    if (!variants || variants.length === 0) {
      return false;
    }

    // Check if any variant has inventory
    for (const variant of variants) {
      // If inventory management is disabled, assume in stock
      if (!variant.manage_inventory) {
        return true;
      }

      // If backorders are allowed, consider in stock
      if (variant.allow_backorder) {
        return true;
      }

      // Check actual inventory quantity
      if (variant.inventory_quantity > 0) {
        return true;
      }
    }

    return false;
  }
}