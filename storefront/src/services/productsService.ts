import { MedusaApiClient, ApiError, ProductQueryParams } from '../utils/medusaApiClient';
import { ProductDataMapper, ProductCardData } from '../utils/productDataMapper';
import { Product } from '../types/medusa';
import { performanceMonitor } from '../utils/performanceMonitor';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ProductsServiceConfig {
  cacheTtl?: number; // Cache TTL in milliseconds
  enableLogging?: boolean;
  apiClient?: MedusaApiClient;
}

export interface ProductsServiceError {
  type: 'network' | 'api' | 'data' | 'cache' | 'timeout' | 'unknown';
  message: string;
  originalError?: Error;
  timestamp: number;
}

export class ProductsService {
  private apiClient: MedusaApiClient;
  private cache: Map<string, CacheEntry<any>>;
  private cacheTtl: number;
  private enableLogging: boolean;

  constructor(config: ProductsServiceConfig = {}) {
    this.apiClient = config.apiClient || new MedusaApiClient();
    this.cache = new Map();
    this.cacheTtl = config.cacheTtl || 5 * 60 * 1000; // 5 minutes default
    this.enableLogging = config.enableLogging ?? true;
  }

  /**
   * Fetches products and transforms them to ProductCardData format
   */
  async fetchProducts(params: ProductQueryParams = {}): Promise<ProductCardData[]> {
    const cacheKey = this.generateCacheKey('products', params);
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cachedData = this.getFromCache<ProductCardData[]>(cacheKey);
      if (cachedData) {
        const endTime = performance.now();
        const responseTime = Math.round(endTime - startTime);
        
        // Track cache hit performance
        performanceMonitor.trackApiPerformance({
          endpoint: '/store/products',
          method: 'GET',
          responseTime,
          timestamp: Date.now(),
          success: true,
          cacheHit: true
        });
        
        this.log('Products fetched from cache', { cacheKey, count: cachedData.length, responseTime });
        return cachedData;
      }

      this.log('Fetching products from API', { params });
      
      // If no region_id is specified, try to get the default region
      let finalParams = { ...params };
      if (!finalParams.region_id) {
        try {
          const regionsResponse = await this.apiClient.getRegions();
          console.log('[ProductsService] Regions response:', regionsResponse);
          
          if (regionsResponse.regions && regionsResponse.regions.length > 0) {
            // Look for a region with INR currency first
            const inrRegion = regionsResponse.regions.find((r: any) => r.currency_code === 'inr');
            const selectedRegion = inrRegion || regionsResponse.regions[0];
            
            finalParams.region_id = selectedRegion.id;
            
            console.log('[ProductsService] Selected region:', {
              id: selectedRegion.id,
              name: selectedRegion.name,
              currency_code: selectedRegion.currency_code
            });
            this.log('Using region', { 
              region_id: finalParams.region_id, 
              region_name: selectedRegion.name,
              currency_code: selectedRegion.currency_code,
              isInrRegion: !!inrRegion
            });
          }
        } catch (regionError) {
          this.log('Failed to fetch regions, proceeding without region_id', { error: regionError });
        }
      }
      
      // Fetch from API
      const response = await this.apiClient.getProducts(finalParams);
      
      this.log('Products fetched from API', { 
        count: response.products.length, 
        total: response.count 
      });

      // Debug: Log the raw API response
      console.log('[ProductsService] Raw API Response:', {
        count: response.products.length,
        firstProduct: response.products[0] ? {
          id: response.products[0].id,
          title: response.products[0].title,
          hasVariants: !!response.products[0].variants,
          variantsCount: response.products[0].variants?.length || 0,
          variants: response.products[0].variants?.map(v => ({
            id: v.id,
            title: v.title,
            hasPrices: !!v.prices,
            pricesCount: v.prices?.length || 0,
            prices: v.prices?.map(p => ({
              id: p.id,
              amount: p.amount,
              currency_code: p.currency_code,
              region_id: p.region_id
            }))
          }))
        } : null
      });

      // Transform data
      const transformStartTime = performance.now();
      const transformedProducts = this.transformProducts(response.products);
      const transformEndTime = performance.now();
      const transformTime = Math.round(transformEndTime - transformStartTime);
      
      // Debug: Log the transformed data
      console.log('[ProductsService] Transformed Products:', {
        count: transformedProducts.length,
        firstProduct: transformedProducts[0] ? {
          title: transformedProducts[0].title,
          price: transformedProducts[0].price,
          currency: transformedProducts[0].currency,
          material: transformedProducts[0].material,
          dimensions: transformedProducts[0].dimensions
        } : null
      });
      
      // Cache the result
      this.setCache(cacheKey, transformedProducts);
      
      const endTime = performance.now();
      const totalResponseTime = Math.round(endTime - startTime);
      
      // Track API performance (excluding cache hits since API client already tracks those)
      performanceMonitor.trackApiPerformance({
        endpoint: '/store/products',
        method: 'GET',
        responseTime: totalResponseTime,
        timestamp: Date.now(),
        success: true,
        cacheHit: false
      });
      
      this.log('Products transformed and cached', { 
        count: transformedProducts.length,
        cacheKey,
        transformTime,
        totalResponseTime
      });

      return transformedProducts;
    } catch (error) {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);
      
      // Track failed API performance
      performanceMonitor.trackApiPerformance({
        endpoint: '/store/products',
        method: 'GET',
        responseTime,
        timestamp: Date.now(),
        success: false
      });
      
      const serviceError = this.handleError(error, 'fetchProducts');
      this.logError('Failed to fetch products', serviceError);
      throw serviceError;
    }
  }

  /**
   * Fetches a single product by ID and transforms it
   */
  async fetchProduct(id: string): Promise<ProductCardData> {
    const cacheKey = this.generateCacheKey('product', { id });
    
    try {
      // Check cache first
      const cachedData = this.getFromCache<ProductCardData>(cacheKey);
      if (cachedData) {
        this.log('Product fetched from cache', { id, cacheKey });
        return cachedData;
      }

      this.log('Fetching product from API', { id });
      
      // Fetch from API
      const product = await this.apiClient.getProduct(id);
      
      this.log('Product fetched from API', { id, title: product.title });

      // Transform data
      const transformedProduct = this.transformProduct(product);
      
      // Cache the result
      this.setCache(cacheKey, transformedProduct);
      
      this.log('Product transformed and cached', { id, cacheKey });

      return transformedProduct;
    } catch (error) {
      const serviceError = this.handleError(error, 'fetchProduct');
      this.logError('Failed to fetch product', serviceError, { id });
      throw serviceError;
    }
  }

  /**
   * Transforms multiple Medusa products to ProductCardData format
   */
  private transformProducts(products: Product[]): ProductCardData[] {
    try {
      return products.map(product => this.transformProduct(product));
    } catch (error) {
      const serviceError = this.handleError(error, 'transformProducts');
      this.logError('Failed to transform products', serviceError);
      throw serviceError;
    }
  }

  /**
   * Transforms a single Medusa product to ProductCardData format
   */
  private transformProduct(product: Product): ProductCardData {
    try {
      return ProductDataMapper.mapToProductCard(product);
    } catch (error) {
      const serviceError = this.handleError(error, 'transformProduct');
      this.logError('Failed to transform product', serviceError, { 
        productId: product.id, 
        productTitle: product.title 
      });
      throw serviceError;
    }
  }

  /**
   * Generates a cache key based on operation and parameters
   */
  private generateCacheKey(operation: string, params: any): string {
    const paramString = JSON.stringify(params);
    return `${operation}:${paramString}`;
  }

  /**
   * Retrieves data from cache if not expired
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.log('Cache entry expired and removed', { key });
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stores data in cache with TTL
   */
  private setCache<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: this.cacheTtl
    };
    
    this.cache.set(key, entry);
  }

  /**
   * Clears all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.log('Cache cleared');
  }

  /**
   * Clears expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.log('Expired cache entries cleared', { removedCount });
    }
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Handles and transforms errors into service errors
   */
  private handleError(error: unknown, operation: string): ProductsServiceError {
    const timestamp = Date.now();

    if (error instanceof ApiError) {
      return {
        type: error.type,
        message: `${operation} failed: ${error.message}`,
        originalError: error,
        timestamp
      };
    }

    if (error instanceof Error) {
      return {
        type: 'unknown',
        message: `${operation} failed: ${error.message}`,
        originalError: error,
        timestamp
      };
    }

    return {
      type: 'unknown',
      message: `${operation} failed: Unknown error occurred`,
      originalError: error instanceof Error ? error : new Error(String(error)),
      timestamp
    };
  }

  /**
   * Logs information messages
   */
  private log(message: string, data?: any): void {
    if (!this.enableLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'ProductsService',
      message,
      ...(data && { data })
    };

    console.log('[ProductsService]', logEntry);
  }

  /**
   * Logs error messages
   */
  private logError(message: string, error: ProductsServiceError, data?: any): void {
    if (!this.enableLogging) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'ProductsService',
      message,
      error: {
        type: error.type,
        message: error.message,
        timestamp: error.timestamp
      },
      ...(data && { data })
    };

    console.error('[ProductsService]', logEntry);
  }
}

// Export a default instance
export const productsService = new ProductsService();

// Export factory function for custom configurations
export const createProductsService = (config: ProductsServiceConfig): ProductsService => {
  return new ProductsService(config);
};