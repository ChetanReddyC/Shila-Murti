import { ProductDataMapper, ProductCardData, PriceCalculationResult } from '../productDataMapper';
import { Product, ProductVariant, ProductImage, MoneyAmount, ProductOptionValue } from '../../types/medusa';

// Mock data helpers
const createMockImage = (id: string, url: string): ProductImage => ({
  id,
  url,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  metadata: null,
});

const createMockMoneyAmount = (amount: number, currency = 'usd', region_id?: string): MoneyAmount => ({
  id: `price_${Math.random()}`,
  currency_code: currency,
  amount,
  region_id,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
});

const createMockOptionValue = (value: string, option_id = 'opt_material'): ProductOptionValue => ({
  id: `optval_${Math.random()}`,
  value,
  option_id,
  variant_id: 'var_test',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  metadata: null,
});

const createMockVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'var_test',
  title: 'Default Variant',
  product_id: 'prod_test',
  sku: 'TEST-SKU',
  barcode: null,
  ean: null,
  upc: null,
  inventory_quantity: 10,
  allow_backorder: false,
  manage_inventory: true,
  hs_code: null,
  origin_country: null,
  mid_code: null,
  material: null,
  weight: null,
  length: null,
  height: null,
  width: null,
  options: [],
  prices: [createMockMoneyAmount(2999)], // $29.99
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  metadata: null,
  ...overrides,
});

const createMockProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod_test',
  title: 'Test Product',
  subtitle: null,
  description: 'A test product',
  handle: 'test-product',
  is_giftcard: false,
  status: 'published',
  thumbnail: null,
  weight: null,
  height: null,
  width: null,
  length: null,
  hs_code: null,
  origin_country: null,
  mid_code: null,
  material: null,
  collection_id: null,
  type_id: null,
  discountable: true,
  external_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  images: [],
  options: [],
  variants: [createMockVariant()],
  metadata: null,
  ...overrides,
});

describe('ProductDataMapper', () => {
  describe('mapToProductCard', () => {
    it('should map a complete product to ProductCardData', () => {
      const product = createMockProduct({
        title: 'Marble Sculpture',
        images: [
          createMockImage('img1', '/images/sculpture-front.jpg'),
          createMockImage('img2', '/images/sculpture-back.jpg'),
        ],
        material: 'Marble',
        length: 30,
        width: 20,
        height: 40,
        variants: [
          createMockVariant({
            prices: [createMockMoneyAmount(4999)], // $49.99
            inventory_quantity: 5,
          }),
        ],
      });

      const result = ProductDataMapper.mapToProductCard(product);

      expect(result).toEqual({
        title: 'Marble Sculpture',
        backgroundImage: '/images/sculpture-back.jpg',
        foregroundImage: '/images/sculpture-front.jpg',
        price: 49.99,
        originalPrice: undefined,
        material: 'Marble',
        dimensions: '30 × 20 × 40 cm',
        inStock: true,
        rating: undefined,
        reviewCount: undefined,
      });
    });

    it('should handle product with minimal data', () => {
      const product = createMockProduct({
        title: 'Simple Product',
        images: [],
        variants: [],
      });

      const result = ProductDataMapper.mapToProductCard(product);

      expect(result).toEqual({
        title: 'Simple Product',
        backgroundImage: '/images/placeholder-background.jpg',
        foregroundImage: '/images/placeholder-product.jpg',
        price: 0,
        originalPrice: undefined,
        material: '',
        dimensions: '',
        inStock: false,
        rating: undefined,
        reviewCount: undefined,
      });
    });
  });

  describe('extractPrimaryImage', () => {
    it('should return the first image URL', () => {
      const images = [
        createMockImage('img1', '/images/primary.jpg'),
        createMockImage('img2', '/images/secondary.jpg'),
      ];

      const result = ProductDataMapper.extractPrimaryImage(images);
      expect(result).toBe('/images/primary.jpg');
    });

    it('should return fallback for empty images array', () => {
      const result = ProductDataMapper.extractPrimaryImage([]);
      expect(result).toBe('/images/placeholder-product.jpg');
    });

    it('should handle absolute URLs', () => {
      const images = [createMockImage('img1', 'https://example.com/image.jpg')];
      const result = ProductDataMapper.extractPrimaryImage(images);
      expect(result).toBe('https://example.com/image.jpg');
    });

    it('should handle URLs without leading slash', () => {
      const images = [createMockImage('img1', 'images/test.jpg')];
      const result = ProductDataMapper.extractPrimaryImage(images);
      expect(result).toBe('/images/test.jpg');
    });
  });

  describe('extractBackgroundImage', () => {
    it('should return the second image when available', () => {
      const images = [
        createMockImage('img1', '/images/primary.jpg'),
        createMockImage('img2', '/images/background.jpg'),
      ];

      const result = ProductDataMapper.extractBackgroundImage(images);
      expect(result).toBe('/images/background.jpg');
    });

    it('should return the first image when only one is available', () => {
      const images = [createMockImage('img1', '/images/only.jpg')];
      const result = ProductDataMapper.extractBackgroundImage(images);
      expect(result).toBe('/images/only.jpg');
    });

    it('should return fallback for empty images array', () => {
      const result = ProductDataMapper.extractBackgroundImage([]);
      expect(result).toBe('/images/placeholder-background.jpg');
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price from single variant', () => {
      const variants = [
        createMockVariant({
          prices: [createMockMoneyAmount(2999)], // $29.99
        }),
      ];

      const result = ProductDataMapper.calculatePrice(variants);
      expect(result).toEqual({ price: 29.99, originalPrice: undefined });
    });

    it('should calculate price range with original price', () => {
      const variants = [
        createMockVariant({
          prices: [createMockMoneyAmount(1999)], // $19.99
        }),
        createMockVariant({
          prices: [createMockMoneyAmount(3999)], // $39.99
        }),
      ];

      const result = ProductDataMapper.calculatePrice(variants);
      expect(result).toEqual({ price: 19.99, originalPrice: 39.99 });
    });

    it('should not show original price for small differences', () => {
      const variants = [
        createMockVariant({
          prices: [createMockMoneyAmount(2999)], // $29.99
        }),
        createMockVariant({
          prices: [createMockMoneyAmount(3099)], // $30.99 (only 3% difference)
        }),
      ];

      const result = ProductDataMapper.calculatePrice(variants);
      expect(result).toEqual({ price: 29.99, originalPrice: undefined });
    });

    it('should prefer USD currency', () => {
      const variants = [
        createMockVariant({
          prices: [
            createMockMoneyAmount(5000, 'eur'), // €50.00
            createMockMoneyAmount(2999, 'usd'), // $29.99
          ],
        }),
      ];

      const result = ProductDataMapper.calculatePrice(variants);
      expect(result).toEqual({ price: 29.99, originalPrice: undefined });
    });

    it('should handle empty variants array', () => {
      const result = ProductDataMapper.calculatePrice([]);
      expect(result).toEqual({ price: 0 });
    });

    it('should handle variants without prices', () => {
      const variants = [createMockVariant({ prices: [] })];
      const result = ProductDataMapper.calculatePrice(variants);
      expect(result).toEqual({ price: 0 });
    });
  });

  describe('determineDimensions', () => {
    it('should format product-level dimensions', () => {
      const product = createMockProduct({
        length: 30.5,
        width: 20,
        height: 40.25,
      });

      const result = ProductDataMapper.determineDimensions(product);
      expect(result).toBe('30.5 × 20 × 40.3 cm');
    });

    it('should use variant dimensions when product dimensions are missing', () => {
      const product = createMockProduct({
        variants: [
          createMockVariant({
            length: 15,
            width: 10,
            height: 25,
          }),
        ],
      });

      const result = ProductDataMapper.determineDimensions(product);
      expect(result).toBe('15 × 10 × 25 cm');
    });

    it('should return empty string when no dimensions available', () => {
      const product = createMockProduct();
      const result = ProductDataMapper.determineDimensions(product);
      expect(result).toBe('');
    });

    it('should format integer dimensions without decimals', () => {
      const product = createMockProduct({
        length: 30,
        width: 20,
        height: 40,
      });

      const result = ProductDataMapper.determineDimensions(product);
      expect(result).toBe('30 × 20 × 40 cm');
    });
  });

  describe('extractMaterial', () => {
    it('should return product-level material', () => {
      const variants = [createMockVariant()];
      const result = ProductDataMapper.extractMaterial(variants, 'Marble');
      expect(result).toBe('Marble');
    });

    it('should return variant material when product material is null', () => {
      const variants = [createMockVariant({ material: 'Granite' })];
      const result = ProductDataMapper.extractMaterial(variants, null);
      expect(result).toBe('Granite');
    });

    it('should extract material from variant options', () => {
      const variants = [
        createMockVariant({
          options: [createMockOptionValue('Marble', 'opt_material')],
        }),
      ];
      const result = ProductDataMapper.extractMaterial(variants);
      expect(result).toBe('Marble');
    });

    it('should recognize material from stone type option', () => {
      const variants = [
        createMockVariant({
          options: [createMockOptionValue('Granite', 'opt_stone_type')],
        }),
      ];
      const result = ProductDataMapper.extractMaterial(variants);
      expect(result).toBe('Granite');
    });

    it('should recognize common material values', () => {
      const variants = [
        createMockVariant({
          options: [createMockOptionValue('ceramic tile', 'opt_finish')],
        }),
      ];
      const result = ProductDataMapper.extractMaterial(variants);
      expect(result).toBe('ceramic tile');
    });

    it('should return empty string when no material found', () => {
      const variants = [createMockVariant()];
      const result = ProductDataMapper.extractMaterial(variants);
      expect(result).toBe('');
    });
  });

  describe('checkStockStatus', () => {
    it('should return true when variant has inventory', () => {
      const variants = [
        createMockVariant({
          inventory_quantity: 5,
          manage_inventory: true,
        }),
      ];
      const result = ProductDataMapper.checkStockStatus(variants);
      expect(result).toBe(true);
    });

    it('should return true when inventory management is disabled', () => {
      const variants = [
        createMockVariant({
          inventory_quantity: 0,
          manage_inventory: false,
        }),
      ];
      const result = ProductDataMapper.checkStockStatus(variants);
      expect(result).toBe(true);
    });

    it('should return true when backorders are allowed', () => {
      const variants = [
        createMockVariant({
          inventory_quantity: 0,
          manage_inventory: true,
          allow_backorder: true,
        }),
      ];
      const result = ProductDataMapper.checkStockStatus(variants);
      expect(result).toBe(true);
    });

    it('should return false when out of stock', () => {
      const variants = [
        createMockVariant({
          inventory_quantity: 0,
          manage_inventory: true,
          allow_backorder: false,
        }),
      ];
      const result = ProductDataMapper.checkStockStatus(variants);
      expect(result).toBe(false);
    });

    it('should return false for empty variants array', () => {
      const result = ProductDataMapper.checkStockStatus([]);
      expect(result).toBe(false);
    });

    it('should return true if any variant is in stock', () => {
      const variants = [
        createMockVariant({
          inventory_quantity: 0,
          manage_inventory: true,
          allow_backorder: false,
        }),
        createMockVariant({
          inventory_quantity: 3,
          manage_inventory: true,
          allow_backorder: false,
        }),
      ];
      const result = ProductDataMapper.checkStockStatus(variants);
      expect(result).toBe(true);
    });
  });
});