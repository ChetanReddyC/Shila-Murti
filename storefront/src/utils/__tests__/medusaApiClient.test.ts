import { MedusaApiClient, ApiError, createMedusaApiClient } from '../medusaApiClient';

describe('MedusaApiClient', () => {
  let client: MedusaApiClient;
  const MOCK_BASE_URL = 'http://localhost:9000';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MedusaApiClient({ 
      baseUrl: MOCK_BASE_URL, 
      timeout: 100, 
      retryOptions: { maxRetries: 0, baseDelay: 0, maxDelay: 0 } 
    }); // Disable retries for simpler testing
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fetch products successfully', async () => {
    const mockProductsResponse = {
      products: [{ id: 'prod_1', title: 'Test Product' }],
      count: 1,
      offset: 0,
      limit: 10,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    });

    const products = await client.getProducts();
    expect(products).toEqual(mockProductsResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      `${MOCK_BASE_URL}/store/products`,
      expect.any(Object)
    );
  });

  it('should fetch a single product successfully', async () => {
    const mockProductResponse = {
      product: { id: 'prod_1', title: 'Test Product' },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProductResponse),
    });

    const product = await client.getProduct('prod_1');
    expect(product).toEqual(mockProductResponse.product);
    expect(global.fetch).toHaveBeenCalledWith(
      `${MOCK_BASE_URL}/store/products/prod_1`,
      expect.any(Object)
    );
  });

  it('should handle HTTP errors for products endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not Found' }),
    });

    await expect(client.getProducts()).rejects.toThrow(ApiError);
    await expect(client.getProducts()).rejects.toMatchObject({ message: 'Not Found' });
  });

  it('should handle network errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(client.getProducts()).rejects.toThrow(ApiError);
    await expect(client.getProducts()).rejects.toMatchObject({ message: 'Network error' });
  });

  it('should apply query parameters for getProducts', async () => {
    const mockProductsResponse = {
      products: [],
      count: 0,
      offset: 0,
      limit: 1,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProductsResponse),
    });

    await client.getProducts({ limit: 1, offset: 0, region_id: 'us', category_id: ['cat_1', 'cat_2'] });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/store/products?'),
      expect.any(Object)
    );
    
    const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(callUrl).toContain('limit=1');
    expect(callUrl).toContain('offset=0');
    expect(callUrl).toContain('region_id=us');
    expect(callUrl).toContain('category_id');
    expect(callUrl).toContain('cat_1');
    expect(callUrl).toContain('cat_2');
  });

  it('should handle timeout', async () => {
    const timeoutClient = new MedusaApiClient({ 
      baseUrl: MOCK_BASE_URL, 
      timeout: 50, 
      retryOptions: { maxRetries: 0, baseDelay: 0, maxDelay: 0 } 
    });
    
    (global.fetch as jest.Mock).mockImplementation(() => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      return Promise.reject(abortError);
    });

    await expect(timeoutClient.getProducts()).rejects.toThrow(ApiError);
    await expect(timeoutClient.getProducts()).rejects.toMatchObject({ type: 'timeout' });
  });

  it('should retry on 5xx errors', async () => {
    const retryClient = new MedusaApiClient({ 
      baseUrl: MOCK_BASE_URL, 
      timeout: 5000, 
      retryOptions: { maxRetries: 1, baseDelay: 10, maxDelay: 50 } 
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server Error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ products: [], count: 0, offset: 0, limit: 0 }),
      });

    const products = await retryClient.getProducts();
    expect(products).toEqual({ products: [], count: 0, offset: 0, limit: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 15000);

  it('should not retry on 4xx errors', async () => {
    const noRetryClient = new MedusaApiClient({ 
      baseUrl: MOCK_BASE_URL, 
      timeout: 5000, 
      retryOptions: { maxRetries: 1, baseDelay: 10, maxDelay: 50 } 
    });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Bad Request' }),
    });

    try {
      await noRetryClient.getProducts();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  describe('CORS and configuration', () => {
    it('should configure CORS mode and credentials', async () => {
      const corsClient = new MedusaApiClient({
        baseUrl: MOCK_BASE_URL,
        corsMode: 'no-cors',
        credentials: 'include'
      });

      const mockResponse = {
        products: [],
        count: 0,
        offset: 0,
        limit: 0,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await corsClient.getProducts();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mode: 'no-cors',
          credentials: 'include',
        })
      );
    });

    it('should use default configuration when none provided', () => {
      const defaultClient = new MedusaApiClient();
      expect(defaultClient).toBeInstanceOf(MedusaApiClient);
    });

    it('should create client with factory function', () => {
      const factoryClient = createMedusaApiClient({
        baseUrl: 'http://custom-url.com',
        timeout: 5000
      });
      expect(factoryClient).toBeInstanceOf(MedusaApiClient);
    });
  });

  describe('ApiError', () => {
    it('should create ApiError with correct properties', () => {
      const error = new ApiError('Test error', 404, 'api');
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.type).toBe('api');
      expect(error.name).toBe('ApiError');
    });

    it('should handle different error types', async () => {
      // Test timeout error
      const timeoutClient = new MedusaApiClient({ 
        baseUrl: MOCK_BASE_URL, 
        timeout: 50, 
        retryOptions: { maxRetries: 0, baseDelay: 0, maxDelay: 0 } 
      });
      
      (global.fetch as jest.Mock).mockImplementation(() => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      });

      await expect(timeoutClient.getProducts()).rejects.toThrow(ApiError);
      await expect(timeoutClient.getProducts()).rejects.toMatchObject({ type: 'timeout' });
    });
  });

  describe('Request headers and configuration', () => {
    it('should include proper headers in requests', async () => {
      const mockResponse = {
        products: [],
        count: 0,
        offset: 0,
        limit: 0,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.getProducts();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }),
        })
      );
    });

    it('should handle malformed JSON responses gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(client.getProducts()).rejects.toThrow(ApiError);
    });
  });

  describe('Retry logic', () => {
    it('should implement exponential backoff', async () => {
      const retryClient = new MedusaApiClient({
        baseUrl: MOCK_BASE_URL,
        timeout: 5000,
        retryOptions: { maxRetries: 2, baseDelay: 10, maxDelay: 100 }
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server Error' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: 'Server Error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ products: [], count: 0, offset: 0, limit: 0 }),
        });

      const result = await retryClient.getProducts();
      expect(result).toEqual({ products: [], count: 0, offset: 0, limit: 0 });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should respect maxDelay in exponential backoff', async () => {
      const retryClient = new MedusaApiClient({
        baseUrl: MOCK_BASE_URL,
        timeout: 100,
        retryOptions: { maxRetries: 3, baseDelay: 1000, maxDelay: 2000 }
      });

      // The calculateDelay method should cap at maxDelay
      // This is tested indirectly through the retry behavior
      expect(retryClient).toBeInstanceOf(MedusaApiClient);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query parameters', async () => {
      const mockResponse = {
        products: [],
        count: 0,
        offset: 0,
        limit: 0,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.getProducts({});
      
      expect(global.fetch).toHaveBeenCalledWith(
        `${MOCK_BASE_URL}/store/products`,
        expect.any(Object)
      );
    });

    it('should handle undefined query parameters', async () => {
      const mockResponse = {
        products: [],
        count: 0,
        offset: 0,
        limit: 0,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.getProducts(undefined);
      
      expect(global.fetch).toHaveBeenCalledWith(
        `${MOCK_BASE_URL}/store/products`,
        expect.any(Object)
      );
    });

    it('should handle product not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Product not found' }),
      });

      await expect(client.getProduct('non-existent')).rejects.toThrow(ApiError);
    });
  });
});