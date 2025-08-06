import { Product, MedusaCart, Region } from '../types/medusa';

export interface ProductQueryParams {
  limit?: number;
  offset?: number;
  region_id?: string;
  sales_channel_id?: string;
  category_id?: string[];
}

// Cart-related interfaces
export interface CreateCartPayload {
  region_id?: string;
  sales_channel_id?: string;
  country_code?: string;
  currency_code?: string;
}

export interface AddLineItemPayload {
  variant_id: string;
  quantity: number;
  metadata?: Record<string, any>;
}

export interface UpdateLineItemPayload {
  quantity: number;
  metadata?: Record<string, any>;
}

export interface MedusaCartResponse {
  cart: MedusaCart;
}

export interface MedusaRegionsResponse {
  regions: Region[];
}

export interface MedusaProductsResponse {
  products: Product[];
  count: number;
  offset: number;
  limit: number;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  retryOptions?: RetryOptions;
  corsMode?: RequestMode;
  credentials?: RequestCredentials;
  enablePerformanceLogging?: boolean;
  publishableApiKey?: string;
}

export interface PerformanceMetrics {
  endpoint: string;
  method: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  cacheHit?: boolean;
  retryCount?: number;
  error?: string;
}

export class ApiError extends Error {
  public readonly status?: number;
  public readonly type: 'network' | 'api' | 'timeout' | 'unknown';

  constructor(message: string, status?: number, type: 'network' | 'api' | 'timeout' | 'unknown' = 'unknown') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
  }
}

export class MedusaApiClient {
  private baseUrl: string;
  private timeout: number;
  private retryOptions: RetryOptions;
  private corsMode: RequestMode;
  private credentials: RequestCredentials;
  private pendingRequests: Map<string, Promise<any>>;
  private enablePerformanceLogging: boolean;
  private performanceMetrics: PerformanceMetrics[];
  private publishableApiKey: string;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
    this.timeout = config.timeout || 8000;
    this.retryOptions = config.retryOptions || {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
    this.corsMode = config.corsMode || 'cors';
    this.credentials = config.credentials || 'omit';
    this.pendingRequests = new Map();
    this.enablePerformanceLogging = config.enablePerformanceLogging ?? true;
    this.performanceMetrics = [];
    this.publishableApiKey = config.publishableApiKey || process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
    
    if (!this.publishableApiKey) {
      console.error('[MedusaApiClient] No publishable API key provided. Please add NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY to your .env.local file.');
      console.error('[MedusaApiClient] You can get this key from your Medusa admin dashboard at http://localhost:9000/app → Settings → API Key Management');
    }
  }

  private async fetchWithTimeout(resource: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-publishable-api-key': this.publishableApiKey,
          ...options.headers,
        },
      });

      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timeout', undefined, 'timeout');
      }
      
      // Handle CORS-specific errors
      if (error instanceof Error && (
        error.message.includes('CORS') || 
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError')
      )) {
        throw new ApiError(
          'Unable to connect to the API server. This might be due to CORS configuration or the server being unavailable.',
          undefined,
          'network'
        );
      }
      
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error occurred',
        undefined,
        'network'
      );
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.retryOptions.baseDelay * Math.pow(2, attempt);
    return Math.min(delay, this.retryOptions.maxDelay);
  }

  private generateRequestKey(endpoint: string, options: RequestInit = {}): string {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    return `${method}:${endpoint}:${body}`;
  }

  private logPerformanceMetrics(metrics: PerformanceMetrics): void {
    if (!this.enablePerformanceLogging) return;

    this.performanceMetrics.push(metrics);

    // Keep only the last 100 metrics to prevent memory leaks
    if (this.performanceMetrics.length > 100) {
      this.performanceMetrics = this.performanceMetrics.slice(-100);
    }

    const logLevel = metrics.success ? 'info' : 'warn';
    const logMessage = `API ${metrics.method} ${metrics.endpoint} - ${metrics.duration}ms`;
    
    const logData = {
      endpoint: metrics.endpoint,
      method: metrics.method,
      duration: metrics.duration,
      success: metrics.success,
      ...(metrics.cacheHit && { cacheHit: true }),
      ...(metrics.retryCount && { retryCount: metrics.retryCount }),
      ...(metrics.error && { error: metrics.error })
    };

    if (logLevel === 'info') {
      console.log(`[MedusaApiClient] ${logMessage}`, logData);
    } else {
      console.warn(`[MedusaApiClient] ${logMessage}`, logData);
    }

    // Log performance warnings
    if (metrics.duration > 3000) {
      console.warn(`[MedusaApiClient] Slow API response detected: ${metrics.endpoint} took ${metrics.duration}ms`);
    }
  }

  public getPerformanceMetrics(): PerformanceMetrics[] {
    return [...this.performanceMetrics];
  }

  public getAverageResponseTime(endpoint?: string): number {
    const relevantMetrics = endpoint 
      ? this.performanceMetrics.filter(m => m.endpoint === endpoint && m.success)
      : this.performanceMetrics.filter(m => m.success);

    if (relevantMetrics.length === 0) return 0;

    const totalDuration = relevantMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return Math.round(totalDuration / relevantMetrics.length);
  }

  private async makeRequestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const requestKey = this.generateRequestKey(endpoint, options);
    const method = options.method || 'GET';
    const startTime = performance.now();
    let retryCount = 0;
    
    // Check if there's already a pending request for this endpoint
    if (this.pendingRequests.has(requestKey)) {
      const cachedPromise = this.pendingRequests.get(requestKey) as Promise<T>;
      
      // Log cache hit
      if (this.enablePerformanceLogging) {
        const endTime = performance.now();
        this.logPerformanceMetrics({
          endpoint,
          method,
          startTime,
          endTime,
          duration: Math.round(endTime - startTime),
          success: true,
          cacheHit: true
        });
      }
      
      return cachedPromise;
    }

    const url = `${this.baseUrl}${endpoint}`;
    let lastError: ApiError;

    // Create the request promise
    const requestPromise = (async (): Promise<T> => {
      try {
        for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
          retryCount = attempt;
          
          try {
            const response = await this.fetchWithTimeout(url, options);

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error('[MedusaApiClient] API Error Response Body:', errorData);
              const apiError = new ApiError(
                errorData.message || `HTTP error! status: ${response.status}`,
                response.status,
                'api'
              );
              
              // Don't retry client errors (4xx), only server errors (5xx) and network errors
              if (response.status >= 400 && response.status < 500) {
                throw apiError;
              }
              
              lastError = apiError;
              
              if (attempt === this.retryOptions.maxRetries) {
                throw apiError;
              }
            } else {
              const data = await response.json();
              
              // Log successful request
              const endTime = performance.now();
              this.logPerformanceMetrics({
                endpoint,
                method,
                startTime,
                endTime,
                duration: Math.round(endTime - startTime),
                success: true,
                ...(retryCount > 0 && { retryCount })
              });
              
              return data;
            }
          } catch (error) {
            if (error instanceof ApiError) {
              lastError = error;
              
              // Don't retry timeout errors or client errors (4xx)
              if (error.type === 'timeout' || (error.status && error.status >= 400 && error.status < 500)) {
                throw error;
              }
            } else {
              lastError = new ApiError(
                error instanceof Error ? error.message : 'Unknown error occurred',
                undefined,
                'unknown'
              );
            }
            
            if (attempt === this.retryOptions.maxRetries) {
              throw lastError;
            }
          }

          // Wait before retrying
          if (attempt < this.retryOptions.maxRetries) {
            const delay = this.calculateDelay(attempt);
            await this.sleep(delay);
          }
        }

        throw lastError!;
      } catch (error) {
        // Log failed request
        const endTime = performance.now();
        this.logPerformanceMetrics({
          endpoint,
          method,
          startTime,
          endTime,
          duration: Math.round(endTime - startTime),
          success: false,
          retryCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        throw error;
      } finally {
        // Remove the request from pending requests when it completes
        this.pendingRequests.delete(requestKey);
      }
    })();

    // Store the promise in pending requests
    this.pendingRequests.set(requestKey, requestPromise);

    return requestPromise;
  }

  async getProducts(params: ProductQueryParams = {}): Promise<MedusaProductsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params.region_id) queryParams.append('region_id', params.region_id);
    if (params.sales_channel_id) queryParams.append('sales_channel_id', params.sales_channel_id);
    if (params.category_id) {
      params.category_id.forEach(id => queryParams.append('category_id[]', id));
    }

    // For Medusa v2, try using fields parameter to include related data
    queryParams.append('fields', '*variants,*variants.prices,*images,*variants.inventory_items,*variants.inventory_items.inventory,*variants.inventory_items.inventory.location_levels');

    const endpoint = `/store/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    console.log('[MedusaApiClient] Fetching products with params:', params);
    console.log('[MedusaApiClient] Final endpoint:', endpoint);
    
    return this.makeRequestWithRetry<MedusaProductsResponse>(endpoint);
  }

  async getRegions(): Promise<MedusaRegionsResponse> {
    const endpoint = '/store/regions';
    return this.makeRequestWithRetry<MedusaRegionsResponse>(endpoint);
  }

  // Cart operations
  async createCart(payload: CreateCartPayload = {}): Promise<MedusaCart> {
    const endpoint = '/store/carts';

    // If no region_id is provided, try to get the India & International region
    let finalPayload = { ...payload };

    if (!finalPayload.region_id) {
      try {
        const indiaRegion = await this.getIndiaRegion();
        if (indiaRegion) {
          finalPayload.region_id = indiaRegion.id;
        }
      } catch (e) {
        console.error('[MedusaApiClient] Failed to getIndiaRegion', e);
      }
    }

    // Prepare the final payload
    const finalPayloadWithContext = {
      ...finalPayload,
    };

    try {
      const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(finalPayloadWithContext),
      });

      return response.cart;
    } catch (error) {
      throw error;
    }
  }

  async getCart(cartId: string): Promise<MedusaCart> {
    const queryParams = new URLSearchParams();
    // Expand cart items with variant and product information
    queryParams.append('fields', '*items,*items.variant,*items.variant.product');
    
    const endpoint = `/store/carts/${cartId}?${queryParams.toString()}`;
    
    console.log('[MedusaApiClient] Fetching cart:', cartId);
    
    try {
      const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint);
      return response.cart;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new ApiError('Cart not found or has expired. A new cart will be created.', 404, 'api');
      }
      throw error;
    }
  }

  async addLineItem(cartId: string, payload: AddLineItemPayload): Promise<MedusaCart> {
    const endpoint = `/store/carts/${cartId}/line-items`;
    
    console.log('[MedusaApiClient] Adding line item to cart:', cartId, payload);
    
    try {
      const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      return response.cart;
    } catch (error) {
      if (error instanceof ApiError) {
        // Handle specific cart errors
        if (error.status === 404) {
          throw new ApiError('Cart not found. Please refresh and try again.', 404, 'api');
        } else if (error.status === 400) {
          throw new ApiError('Invalid product variant or insufficient stock.', 400, 'api');
        }
      }
      throw error;
    }
  }

  async updateLineItem(cartId: string, lineItemId: string, payload: UpdateLineItemPayload): Promise<MedusaCart> {
    const endpoint = `/store/carts/${cartId}/line-items/${lineItemId}`;
    
    console.log('[MedusaApiClient] Updating line item:', cartId, lineItemId, payload);
    
    try {
      const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      return response.cart;
    } catch (error) {
      if (error instanceof ApiError) {
        // Handle specific cart errors
        if (error.status === 404) {
          throw new ApiError('Cart or item not found. Please refresh and try again.', 404, 'api');
        } else if (error.status === 400) {
          throw new ApiError('Invalid quantity or insufficient stock.', 400, 'api');
        }
      }
      throw error;
    }
  }

  async removeLineItem(cartId: string, lineItemId: string): Promise<MedusaCart> {
    const endpoint = `/store/carts/${cartId}/line-items/${lineItemId}`;
    
    console.log('[MedusaApiClient] Removing line item:', cartId, lineItemId);
    
    try {
      const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
        method: 'DELETE'
      });
      
      return response.cart;
    } catch (error) {
      if (error instanceof ApiError) {
        // Handle specific cart errors
        if (error.status === 404) {
          throw new ApiError('Cart or item not found. Please refresh and try again.', 404, 'api');
        }
      }
      throw error;
    }
  }

  // Helper method to find the India & International region
  async getIndiaRegion(): Promise<Region | null> {
    try {
      const regionsResponse = await this.getRegions();
      const indiaRegion = regionsResponse.regions.find(
        region => region.name === 'India & International' || 
                 region.currency_code === 'inr'
      );
      
      if (!indiaRegion) {
        console.warn('[MedusaApiClient] India & International region not found, using first available region');
        return regionsResponse.regions[0] || null;
      }
      
      return indiaRegion;
    } catch (error) {
      console.error('[MedusaApiClient] Failed to fetch regions:', error);
      return null;
    }
  }

  async getProduct(id: string): Promise<Product> {
    const endpoint = `/store/products/${id}`;
    const response = await this.makeRequestWithRetry<{ product: Product }>(endpoint);
    return response.product;
  }

  async getProductByHandle(handle: string): Promise<Product> {
    // For Medusa v2, we can use the handle parameter directly
    const queryParams = new URLSearchParams();
    queryParams.append('handle', handle);
    queryParams.append('fields', '*variants,*variants.prices,*images,*variants.inventory_items,*variants.inventory_items.inventory,*variants.inventory_items.inventory.location_levels');

    const endpoint = `/store/products?${queryParams.toString()}`;
    const response = await this.makeRequestWithRetry<MedusaProductsResponse>(endpoint);
    
    if (!response.products || response.products.length === 0) {
      throw new ApiError('Product not found', 404, 'api');
    }

    return response.products[0];
  }
}

// Export a default instance
export const medusaApiClient = new MedusaApiClient();

// Export factory function for custom configurations
export const createMedusaApiClient = (config: ApiClientConfig): MedusaApiClient => {
  return new MedusaApiClient(config);
};