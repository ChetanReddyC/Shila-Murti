/**
 * Fetches real-time inventory for a product from backend API
 */

const MEDUSA_API_BASE_URL = process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL || 'http://localhost:9000';

export interface VariantInventory {
  variant_id: string;
  sku: string;
  available: number;
  in_stock: boolean;
  manage_inventory: boolean;
  allow_backorder: boolean;
  inventory_quantity: number;
}

export interface ProductInventoryResponse {
  product_id: string;
  inventory: Record<string, VariantInventory>;
}

export async function getProductInventory(productId: string): Promise<ProductInventoryResponse | null> {
  console.log('🔍 [getProductInventory] Starting fetch for productId:', productId);
  console.log('🔍 [getProductInventory] API Base URL:', MEDUSA_API_BASE_URL);
  
  try {
    const url = `${MEDUSA_API_BASE_URL}/store/custom/product-inventory/${productId}`;
    console.log('🔍 [getProductInventory] Full URL:', url);
    
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
    console.log('🔍 [getProductInventory] Using publishable key:', publishableKey ? 'present' : 'missing');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableKey,
      },
      cache: 'no-store', // Always get fresh inventory data
    });

    console.log('🔍 [getProductInventory] Response status:', response.status);
    console.log('🔍 [getProductInventory] Response ok:', response.ok);

    if (!response.ok) {
      console.error('❌ [getProductInventory] Failed to fetch inventory for product:', productId, 'Status:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('✅ [getProductInventory] Inventory data received:', JSON.stringify(data, null, 2));
    console.log('✅ [getProductInventory] First variant data:', Object.values(data.inventory)[0]);
    
    return data;
  } catch (error) {
    console.error('❌ [getProductInventory] Error fetching product inventory:', error);
    return null;
  }
}

/**
 * Helper to get total available quantity across all variants
 */
export function getTotalAvailable(inventory: Record<string, VariantInventory>): number {
  return Object.values(inventory).reduce((total, variant) => total + variant.available, 0);
}

/**
 * Helper to check if any variant is in stock
 */
export function isAnyVariantInStock(inventory: Record<string, VariantInventory>): boolean {
  return Object.values(inventory).some(variant => variant.in_stock);
}
