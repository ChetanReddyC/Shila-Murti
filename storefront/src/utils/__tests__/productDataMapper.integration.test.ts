import { ProductDataMapper } from '../productDataMapper';
import { Product } from '../../types/medusa';

describe('ProductDataMapper Integration Tests', () => {
  it('should handle a realistic product with complex variant structure', () => {
    const complexProduct: Product = {
      id: 'prod_marble_sculpture_001',
      title: 'Abstract Marble Sculpture - Flowing Forms',
      subtitle: 'Handcrafted Contemporary Art',
      description: 'A beautiful abstract sculpture carved from premium marble',
      handle: 'abstract-marble-sculpture-flowing-forms',
      is_giftcard: false,
      status: 'published',
      thumbnail: '/images/sculptures/marble-abstract-thumb.jpg',
      weight: 5000, // 5kg
      height: 40,
      width: 25,
      length: 30,
      hs_code: null,
      origin_country: 'IN',
      mid_code: null,
      material: 'Premium Marble',
      collection_id: 'col_sculptures',
      type_id: 'type_art',
      discountable: true,
      external_id: null,
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-20T14:45:00Z',
      deleted_at: null,
      images: [
        {
          id: 'img_001',
          url: 'https://cdn.example.com/sculptures/marble-abstract-front.jpg',
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          deleted_at: null,
          metadata: { alt: 'Front view of marble sculpture' },
        },
        {
          id: 'img_002',
          url: '/images/sculptures/marble-abstract-side.jpg',
          created_at: '2024-01-15T10:31:00Z',
          updated_at: '2024-01-15T10:31:00Z',
          deleted_at: null,
          metadata: { alt: 'Side view of marble sculpture' },
        },
      ],
      options: [
        {
          id: 'opt_finish',
          title: 'Finish',
          product_id: 'prod_marble_sculpture_001',
          values: [
            {
              id: 'optval_polished',
              value: 'Polished',
              option_id: 'opt_finish',
              variant_id: 'var_polished',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
              metadata: null,
            },
            {
              id: 'optval_matte',
              value: 'Matte',
              option_id: 'opt_finish',
              variant_id: 'var_matte',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
              metadata: null,
            },
          ],
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          deleted_at: null,
          metadata: null,
        },
      ],
      variants: [
        {
          id: 'var_polished',
          title: 'Polished Finish',
          product_id: 'prod_marble_sculpture_001',
          sku: 'MARBLE-ABS-POL-001',
          barcode: null,
          ean: null,
          upc: null,
          inventory_quantity: 3,
          allow_backorder: false,
          manage_inventory: true,
          hs_code: null,
          origin_country: 'IN',
          mid_code: null,
          material: 'Carrara Marble',
          weight: 5000,
          length: 30,
          height: 40,
          width: 25,
          options: [
            {
              id: 'optval_polished',
              value: 'Polished',
              option_id: 'opt_finish',
              variant_id: 'var_polished',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
              metadata: null,
            },
          ],
          prices: [
            {
              id: 'price_usd_polished',
              currency_code: 'usd',
              amount: 89999, // $899.99
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
            },
            {
              id: 'price_eur_polished',
              currency_code: 'eur',
              amount: 82999, // €829.99
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
            },
          ],
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          deleted_at: null,
          metadata: null,
        },
        {
          id: 'var_matte',
          title: 'Matte Finish',
          product_id: 'prod_marble_sculpture_001',
          sku: 'MARBLE-ABS-MAT-001',
          barcode: null,
          ean: null,
          upc: null,
          inventory_quantity: 0,
          allow_backorder: true, // Available for backorder
          manage_inventory: true,
          hs_code: null,
          origin_country: 'IN',
          mid_code: null,
          material: 'Carrara Marble',
          weight: 5000,
          length: 30,
          height: 40,
          width: 25,
          options: [
            {
              id: 'optval_matte',
              value: 'Matte',
              option_id: 'opt_finish',
              variant_id: 'var_matte',
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
              metadata: null,
            },
          ],
          prices: [
            {
              id: 'price_usd_matte',
              currency_code: 'usd',
              amount: 79999, // $799.99
              created_at: '2024-01-15T10:30:00Z',
              updated_at: '2024-01-15T10:30:00Z',
              deleted_at: null,
            },
          ],
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
          deleted_at: null,
          metadata: null,
        },
      ],
      metadata: {
        artist: 'Local Artisan',
        collection: 'Contemporary Forms',
        care_instructions: 'Clean with soft cloth, avoid harsh chemicals',
      },
    };

    const result = ProductDataMapper.mapToProductCard(complexProduct);

    expect(result).toEqual({
      title: 'Abstract Marble Sculpture - Flowing Forms',
      backgroundImage: '/images/sculptures/marble-abstract-side.jpg',
      foregroundImage: 'https://cdn.example.com/sculptures/marble-abstract-front.jpg',
      price: 799.99, // Lowest price from variants
      originalPrice: 899.99, // Highest price (significant difference)
      material: 'Premium Marble', // Product-level material takes precedence
      dimensions: '30 × 25 × 40 cm',
      inStock: true, // True because matte variant allows backorder
      rating: undefined,
      reviewCount: undefined,
    });
  });

  it('should handle edge case with missing data gracefully', () => {
    const minimalProduct: Product = {
      id: 'prod_minimal',
      title: 'Minimal Product',
      subtitle: null,
      description: null,
      handle: null,
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
      variants: [
        {
          id: 'var_minimal',
          title: 'Default',
          product_id: 'prod_minimal',
          sku: null,
          barcode: null,
          ean: null,
          upc: null,
          inventory_quantity: 0,
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
          prices: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          metadata: null,
        },
      ],
      metadata: null,
    };

    const result = ProductDataMapper.mapToProductCard(minimalProduct);

    expect(result).toEqual({
      title: 'Minimal Product',
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

  it('should extract material from variant options when product material is missing', () => {
    const productWithOptionMaterial: Product = {
      id: 'prod_option_material',
      title: 'Stone Sculpture',
      subtitle: null,
      description: null,
      handle: null,
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
      material: null, // No product-level material
      collection_id: null,
      type_id: null,
      discountable: true,
      external_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      deleted_at: null,
      images: [],
      options: [],
      variants: [
        {
          id: 'var_granite',
          title: 'Granite Variant',
          product_id: 'prod_option_material',
          sku: 'STONE-GRA-001',
          barcode: null,
          ean: null,
          upc: null,
          inventory_quantity: 5,
          allow_backorder: false,
          manage_inventory: true,
          hs_code: null,
          origin_country: null,
          mid_code: null,
          material: null, // No variant-level material
          weight: null,
          length: null,
          height: null,
          width: null,
          options: [
            {
              id: 'optval_granite',
              value: 'Black Granite',
              option_id: 'opt_stone_type',
              variant_id: 'var_granite',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              deleted_at: null,
              metadata: null,
            },
          ],
          prices: [
            {
              id: 'price_granite',
              currency_code: 'usd',
              amount: 59999,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              deleted_at: null,
            },
          ],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          deleted_at: null,
          metadata: null,
        },
      ],
      metadata: null,
    };

    const result = ProductDataMapper.mapToProductCard(productWithOptionMaterial);

    expect(result.material).toBe('Black Granite');
    expect(result.inStock).toBe(true);
    expect(result.price).toBe(599.99);
  });
});