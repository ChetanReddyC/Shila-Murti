export interface InventoryInfo {
  quantity: number;
  allowBackorder: boolean;
  manageInventory: boolean;
}

export interface AggregatedInventoryInfo {
  inStock: boolean;
  quantity: number;
  allowBackorder: boolean;
  managed: boolean;
  status: 'in_stock' | 'out_of_stock' | 'backorder';
  totalQuantity: number;
  availableVariants: number;
  totalVariants: number;
}