export interface ProductImage {
  id: string;
  url: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata: Record<string, any> | null;
}

export interface ProductOptionValue {
  id: string;
  value: string;
  option_id: string;
  variant_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata: Record<string, any> | null;
}

export interface ProductOption {
  id: string;
  title: string;
  product_id: string;
  values: ProductOptionValue[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata: Record<string, any> | null;
}

export interface MoneyAmount {
  id: string;
  currency_code: string;
  amount: number;
  region_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryLevel {
  id: string;
  location_id: string;
  inventory_item_id: string;
  stocked_quantity: number;
  reserved_quantity: number;
  incoming_quantity: number;
  available_quantity: number;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryItem {
  id: string;
  sku: string | null;
  origin_country: string | null;
  hs_code: string | null;
  mid_code: string | null;
  material: string | null;
  weight: number | null;
  length: number | null;
  height: number | null;
  width: number | null;
  requires_shipping: boolean;
  description: string | null;
  title: string | null;
  thumbnail: string | null;
  metadata: Record<string, any> | null;
  location_levels: InventoryLevel[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProductVariantInventoryItem {
  variant_id: string;
  inventory_item_id: string;
  id: string;
  required_quantity: number;
  inventory: InventoryItem;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProductVariant {
  id: string;
  title: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  ean: string | null;
  upc: string | null;
  inventory_quantity: number;
  allow_backorder: boolean;
  manage_inventory: boolean;
  hs_code: string | null;
  origin_country: string | null;
  mid_code: string | null;
  material: string | null;
  weight: number | null;
  length: number | null;
  height: number | null;
  width: number | null;
  options: ProductOptionValue[];
  prices: MoneyAmount[];
  inventory_items?: ProductVariantInventoryItem[]; // Medusa v2 inventory structure
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  metadata: Record<string, any> | null;
}

export interface Product {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  handle: string | null;
  is_giftcard: boolean;
  status: 'draft' | 'proposed' | 'published' | 'rejected';
  thumbnail: string | null;
  weight: number | null;
  height: number | null;
  width: number | null;
  length: number | null;
  hs_code: string | null;
  origin_country: string | null;
  mid_code: string | null;
  material: string | null;
  collection_id: string | null;
  type_id: string | null;
  discountable: boolean;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  metadata: Record<string, any> | null;
}
