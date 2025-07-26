import { Product } from '../types/medusa';

export interface ProductQueryParams {
  limit?: number;
  offset?: number;
  region_id?: string;
  sales_channel_id?: string;
  category_id?: string[];
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

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';
    this.timeout = config.timeout || 8000;
    this.retryOptions = config.retryOptions || {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
    this.corsMode = config.corsMode || 'cors';
    this.credentials = config.credentials || 'same-origin';
  }

  private async fetchWithTimeout(resource: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal,
        mode: this.corsMode,
        credentials: this.credentials,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
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

  private async makeRequestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    let lastError: ApiError;

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
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

    const endpoint = `/store/products${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    return this.makeRequestWithRetry<MedusaProductsResponse>(endpoint);
  }

  async getProduct(id: string): Promise<Product> {
    const endpoint = `/store/products/${id}`;
    const response = await this.makeRequestWithRetry<{ product: Product }>(endpoint);
    return response.product;
  }
}

// Export a default instance
export const medusaApiClient = new MedusaApiClient();

// Export factory function for custom configurations
export const createMedusaApiClient = (config: ApiClientConfig): MedusaApiClient => {
  return new MedusaApiClient(config);
};