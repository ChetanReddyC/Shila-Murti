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

// ---- Checkout-specific types ----
export interface UpdateCartPayload {
  email?: string;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address_1: string;
    address_2?: string;
    city: string;
    postal_code: string;
    province?: string;
    country_code: string;
    phone?: string;
  };
  billing_address?: {
    first_name?: string;
    last_name?: string;
    address_1: string;
    address_2?: string;
    city: string;
    postal_code: string;
    province?: string;
    country_code: string;
    phone?: string;
  };
}

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
  price_type?: string;
  provider_id?: string;
  profile_id?: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ShippingOptionsResponse {
  shipping_options: ShippingOption[];
}

export interface OrderSummaryItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  subtotal?: number;
  total?: number;
  thumbnail?: string | null;
}

export interface OrderMinimal {
  id: string;
  display_id?: number;
  email?: string;
  currency_code?: string;
  total?: number;
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  items?: OrderSummaryItem[];
  created_at?: string;
  metadata?: Record<string, any>;
}

export interface CompleteCartResponse {
  type?: 'order' | string;
  order?: OrderMinimal;
  cart?: MedusaCart;
}

export interface OrderResponse {
  order: OrderMinimal;
}

// Minimal types for Payment Collections (Medusa v2)
interface PaymentCollection {
  id: string
  amount?: number
  currency_code?: string
  status?: string
}

interface PaymentCollectionResponse {
  payment_collection: PaymentCollection
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
  public static readonly MANUAL_PAYMENT_PROVIDER_ID = 'manual';

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
    } else {
      console.log('[MedusaApiClient] Using publishable key (present). Base URL:', this.baseUrl)
    }
  }

  private async fetchWithTimeout(resource: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Build headers and preflight allowance dynamically
      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-publishable-api-key': this.publishableApiKey,
      };

      // Normalize provided headers
      const provided: Record<string, string> = {};
      const inputHeaders = options.headers as HeadersInit | undefined;
      if (inputHeaders) {
        if (Array.isArray(inputHeaders)) {
          for (const [k, v] of inputHeaders) provided[k] = String(v);
        } else if (typeof (inputHeaders as any).forEach === 'function') {
          (inputHeaders as any).forEach((value: string, key: string) => {
            provided[key] = value;
          });
        } else {
          Object.assign(provided, inputHeaders as Record<string, string>);
        }
      }

      // Compose Access-Control-Request-Headers to include custom headers such as Idempotency-Key
      const requestedHeaders = new Set<string>(
        (provided['Access-Control-Request-Headers'] || 'content-type,accept,x-publishable-api-key')
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean)
      );
      if (provided['Idempotency-Key'] || provided['idempotency-key']) {
        requestedHeaders.add('idempotency-key');
      }

      const finalHeaders: Record<string, string> = {
        ...baseHeaders,
        'Access-Control-Request-Headers': Array.from(requestedHeaders).join(','),
        ...provided,
      };

      const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: finalHeaders,
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
    // Generate a unique idempotency key for this request attempt (stable across retries in this call)
    const idempotencyKey = method.toUpperCase() !== 'GET' ? `${requestKey}:${startTime}` : undefined;
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
            // Ensure idempotency for non-GET requests to prevent duplicate effects on retries
            let normalizedHeaders: Record<string, string> = {};
            const original = options.headers as HeadersInit | undefined;
            if (original) {
              if (Array.isArray(original)) {
                for (const [k, v] of original) {
                  normalizedHeaders[k] = String(v);
                }
              } else if (typeof (original as any).forEach === 'function' && typeof (original as any).keys === 'function') {
                (original as any).forEach((value: string, key: string) => {
                  normalizedHeaders[key] = value;
                });
              } else {
                normalizedHeaders = { ...(original as Record<string, string>) };
              }
            }
            if (idempotencyKey && !normalizedHeaders['Idempotency-Key']) {
              normalizedHeaders['Idempotency-Key'] = idempotencyKey;
            }

            const response = await this.fetchWithTimeout(url, { ...options, headers: normalizedHeaders });

            if (!response.ok) {
              const errorText = await response.text().catch(() => '');
              let errorData: any = {}
              try { errorData = errorText ? JSON.parse(errorText) : {} } catch {}
              console.error('[MedusaApiClient] API Error Response Body:', errorText || errorData);
              if (response.status === 401 || response.status === 403) {
                console.warn('[MedusaApiClient] Auth-like failure. Ensure x-publishable-api-key is valid and linked to the sales channel.')
              }
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

  // ---------------- Checkout operations (Medusa v2 Store routes) ----------------

  /** Update cart details: email, shipping/billing address */
  async updateCart(cartId: string, payload: UpdateCartPayload): Promise<MedusaCart> {
    const endpoint = `/store/carts/${cartId}`;
    console.log('[MedusaApiClient] Updating cart:', cartId, payload);
    const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.cart;
  }

  /** List eligible shipping options for a cart */
  async getShippingOptionsForCart(cartId: string): Promise<ShippingOption[]> {
    // Request all fields to ensure profile_id is included for grouping per profile
    const endpoint = `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}&fields=*`;
    console.log('[MedusaApiClient] Fetching shipping options for cart:', cartId);
    const response = await this.makeRequestWithRetry<ShippingOptionsResponse>(endpoint);
    return response.shipping_options || [];
  }

  /** Add a shipping method to the cart using the selected option id */
  async addShippingMethod(cartId: string, optionId: string): Promise<MedusaCart> {
    const endpoint = `/store/carts/${cartId}/shipping-methods`;
    console.log('[MedusaApiClient] Adding shipping method:', { cartId, optionId });
    const response = await this.makeRequestWithRetry<MedusaCartResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId }),
    });
    return response.cart;
  }

  /** Create payment sessions for the cart */
  async createPaymentSessions(cartId: string): Promise<MedusaCart> {
    // Medusa v2.8+: Use Payment Collections instead of legacy cart payment-sessions
    console.log('[MedusaApiClient] [v2.8] Creating payment collection + sessions for cart:', cartId)

    // 1) Create or fetch the payment collection for this cart
    const createPcEndpoint = `/store/payment-collections`
    const pc = await this.makeRequestWithRetry<PaymentCollectionResponse>(createPcEndpoint, {
      method: 'POST',
      body: JSON.stringify({ cart_id: cartId })
    })

    const pcId = pc.payment_collection.id

    // 2) Create payment sessions for that collection using the default system provider
    const sessionsEndpoint = `/store/payment-collections/${pcId}/payment-sessions`
    await this.makeRequestWithRetry<PaymentCollectionResponse>(sessionsEndpoint, {
      method: 'POST',
      body: JSON.stringify({ provider_id: 'pp_system_default', data: {} })
    })

    // 3) Return the updated cart to keep the original method contract
    const updated = await this.getCart(cartId)
    return updated
  }

  /** Select a specific payment session provider (manual) */
  async selectPaymentSession(cartId: string, providerId: string): Promise<MedusaCart> {
    // In v2 payment collections flow, provider selection happens when creating sessions.
    // We keep this method for backwards compatibility and simply return the cart.
    console.log('[MedusaApiClient] [v2.8] selectPaymentSession is a no-op; sessions were created with provider during payment-collections step', { cartId, providerId })
    return this.getCart(cartId)
  }

  /** Complete the cart and expect an order in response */
  async completeCart(cartId: string): Promise<CompleteCartResponse> {
    const endpoint = `/store/carts/${cartId}/complete`;
    console.log('[MedusaApiClient] Completing cart:', cartId);
    const response = await this.makeRequestWithRetry<CompleteCartResponse>(endpoint, {
      method: 'POST',
    });
    return response;
  }

  /** Retrieve an order by id (minimal fields) */
  async getOrder(orderId: string): Promise<OrderMinimal> {
    // Request expanded fields so the order confirmation page can render
    // shipping address, shipping methods and items reliably.
    const endpoint = `/store/orders/${orderId}?fields=*shipping_address,*shipping_methods,*items,*items.variant,*items.variant.product`;
    console.log('[MedusaApiClient] Fetching order:', orderId);
    const response = await this.makeRequestWithRetry<OrderResponse>(endpoint);
    return response.order;
  }
}

// Export a default instance
export const medusaApiClient = new MedusaApiClient();

// Export factory function for custom configurations
export const createMedusaApiClient = (config: ApiClientConfig): MedusaApiClient => {
  return new MedusaApiClient(config);
};