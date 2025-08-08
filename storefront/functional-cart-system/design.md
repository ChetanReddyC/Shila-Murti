# Design Document

## Overview

The functional cart system will implement a complete shopping cart experience that connects the product details page to a working cart using Medusa's built-in cart functionality. The system will leverage Medusa's cart APIs for persistence and state management, while providing a React Context layer for frontend state synchronization.

## Architecture

### Backend Integration (Medusa)
- **Medusa Cart API**: Use Medusa's `/store/carts` endpoints for cart operations
- **Session Management**: Leverage Medusa's cart session handling
- **Persistence**: Cart data persisted in Medusa's database, not localStorage
- **Currency Support**: Use configured INR currency from Medusa config

### Frontend State Management
- **Cart Context**: React Context for frontend cart state synchronization
- **Medusa API Client**: Extended to include cart operations
- **Real-time Updates**: Context updates when cart operations complete

### Component Structure
```
CartProvider (Context + Medusa API)
├── ProductDetailPage (Consumer)
│   └── Add to Cart via Medusa API
├── CartPage (Consumer)
│   ├── Cart items from Medusa
│   ├── Quantity updates via Medusa API
│   └── Price calculations from Medusa
└── Header (Consumer)
    └── Cart indicator from Medusa cart
```

## Components and Interfaces

### Medusa v2 Cart API Integration
Based on Medusa v2.8.5 framework structure:

```typescript
// Medusa v2 Cart Structure
interface MedusaCart {
  id: string;
  region_id: string;
  customer_id?: string;
  sales_channel_id?: string;
  items: MedusaLineItem[];
  shipping_address?: Address;
  billing_address?: Address;
  shipping_methods: ShippingMethod[];
  payment_sessions: PaymentSession[];
  total: number;
  subtotal: number;
  tax_total: number;
  shipping_total: number;
  discount_total: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

interface MedusaLineItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  title: string;
  description?: string;
  thumbnail?: string;
  variant: {
    id: string;
    title: string;
    sku?: string;
    product: {
      id: string;
      title: string;
      handle: string;
      thumbnail?: string;
    };
  };
  adjustments?: LineItemAdjustment[];
  metadata?: Record<string, any>;
}

interface CartContextType {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  addToCart: (variantId: string, quantity: number) => Promise<void>;
  removeFromCart: (lineItemId: string) => Promise<void>;
  updateQuantity: (lineItemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  getTotalItems: () => number;
  refreshCart: () => Promise<void>;
  createCart: () => Promise<void>;
}
```

### Extended Medusa API Client
Medusa v2 Cart API Endpoints:
- `POST /store/carts` - Create new cart
- `GET /store/carts/{id}` - Retrieve cart
- `POST /store/carts/{id}/line-items` - Add item to cart
- `POST /store/carts/{id}/line-items/{line_item_id}` - Update line item quantity
- `DELETE /store/carts/{id}/line-items/{line_item_id}` - Remove line item
- `POST /store/carts/{id}/complete` - Complete cart (for checkout)

API Client Extensions:
- Add cart-specific methods to existing MedusaApiClient
- Handle cart session management with sessionStorage
- Implement cart CRUD operations via Medusa v2 endpoints
- Manage region selection (INR currency from config)
- Handle cart completion and checkout flow preparation

### Updated Product Detail Page
- Integrates with CartContext to add product variants to Medusa cart
- Uses product variant ID for cart operations
- Maintains existing UI and functionality
- Adds success feedback when items are added via Medusa API
- Handles edge cases (out of stock, API errors)

### Updated Cart Page
- Removes all mock data
- Displays real cart items from Medusa cart API
- Implements quantity controls with Medusa API updates
- Shows dynamic price calculations from Medusa (including tax, shipping)
- Handles empty cart state and loading states

## Data Models

### Medusa v2 Cart Integration
The system will use Medusa v2.8.5 native cart structure with framework updates:

```typescript
// API Response Structure
interface MedusaCartResponse {
  cart: MedusaCart;
}

interface MedusaLineItemResponse {
  cart: MedusaCart; // Returns full cart after line item operations
}

// Region Configuration (from seed script)
interface MedusaRegion {
  id: string;
  name: string; // "India & International"
  currency_code: string; // 'inr' 
  countries: Country[]; // ["in", "us", "gb", "ca", "au"]
  payment_providers: string[]; // ["pp_system_default"]
  fulfillment_providers: string[];
}

// Cart Creation Payload
interface CreateCartPayload {
  region_id?: string;
  sales_channel_id?: string;
  country_code?: string;
  currency_code?: string; // Will use 'inr' from region
}

// Line Item Operations
interface AddLineItemPayload {
  variant_id: string;
  quantity: number;
  metadata?: Record<string, any>;
}

interface UpdateLineItemPayload {
  quantity: number;
  metadata?: Record<string, any>;
}
```

### Frontend Cart State
```typescript
interface CartState {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  cartId: string | null;
}
```

## Error Handling

### Medusa API Errors
- Handle network failures with retry logic
- Show user-friendly error messages for API failures
- Handle cart session expiration
- Graceful fallback for backend unavailability

### Cart Operations Errors
- Handle out of stock products via Medusa inventory
- Validate quantity limits through Medusa business logic
- Handle variant not found errors
- Manage cart creation failures

### Session Management
- Handle cart session persistence across browser sessions
- Automatic cart recovery on page refresh
- Handle cart ID storage in sessionStorage/localStorage
- Graceful cart recreation if session is lost

## Testing Strategy

### Manual Testing Focus
- Add to cart functionality from product details
- Cart page displays correct items and calculations
- Quantity updates work correctly
- Cart persistence across page refreshes
- Empty cart state handling
- Price calculations accuracy

### Test Scenarios
1. **Basic Flow**: Add item → View cart → Verify display
2. **Quantity Management**: Add multiple quantities → Update quantities → Remove items
3. **Persistence**: Add items → Refresh page → Verify cart maintained
4. **Edge Cases**: Add out of stock items → Exceed quantity limits → Clear cart
5. **Calculations**: Verify subtotals and totals are accurate

## Implementation Approach

### Phase 1: Medusa v2 API Client Extension
- Extend MedusaApiClient with Medusa v2 cart methods
- Implement cart CRUD operations using correct v2 endpoints
- Add cart session management with sessionStorage
- Handle region selection and INR currency from config
- Add proper error handling for v2 API responses

### Phase 2: Cart Context with Medusa Integration
- Create CartContext that uses Medusa API
- Implement cart state synchronization
- Add error handling and loading states
- Handle cart session persistence

### Phase 3: Product Detail Integration
- Update Add to Cart to use Medusa cart API
- Map product variants to cart line items
- Add success feedback and error handling
- Handle inventory validation

### Phase 4: Cart Page Update
- Remove mock data completely
- Connect to Medusa cart via context
- Implement quantity controls with API calls
- Display Medusa's calculated totals and taxes

### Phase 5: Polish and Edge Cases
- Empty cart state handling
- Loading states during API calls
- Error recovery and user feedback
- Cart session management across page refreshes

## Technical Considerations

### Medusa v2.8.5 Integration
- Use existing publishable API key (pk_6db7dd79...) for cart operations
- Leverage "India & International" region with INR currency from seed script
- Use "Stone Idol Sales Channel" for cart operations
- Handle Medusa v2 framework API structure with @medusajs/framework
- Integrate with existing ProductVariant structure (Material, Finish, Size options)
- Use correct v2 endpoints with field expansion syntax
- Handle v2's inventory management with stock locations and levels
- Work with existing shipping profiles and fulfillment sets

### Performance
- Memoize cart context values to prevent unnecessary re-renders
- Debounce API calls for quantity updates
- Use existing API client's caching and retry mechanisms
- Optimize cart refresh calls

### Session Management
- Store cart ID in sessionStorage for session persistence
- Handle cart recovery across browser sessions using stored cart ID
- Manage cart expiration and automatic recreation via Medusa API
- Integrate with Medusa's built-in session handling
- Handle region persistence for consistent currency (INR)
- Manage cart-to-customer association for future checkout

### Error Resilience
- Use existing API client's retry logic
- Handle network failures gracefully
- Provide fallback UI states during API failures
- Implement optimistic updates where appropriate

### API Call Patterns
Based on Medusa v2.8.5 framework structure from the seed script:

```typescript
// Cart Creation with Region (INR currency from config)
POST /store/carts
Headers: { 'x-publishable-api-key': 'pk_6db7dd79...' }
Body: { 
  region_id: 'reg_...', // India & International region
  currency_code: 'inr',
  sales_channel_id: 'sc_...' // Stone Idol Sales Channel
}

// Add Line Item (using variant_id from product variants)
POST /store/carts/{cart_id}/line-items
Body: { 
  variant_id: 'variant_...', // e.g., Ganesha variant ID
  quantity: 1 
}

// Update Line Item Quantity
POST /store/carts/{cart_id}/line-items/{line_item_id}
Body: { quantity: 2 }

// Remove Line Item
DELETE /store/carts/{cart_id}/line-items/{line_item_id}

// Get Cart with Expanded Fields (Medusa v2 style)
GET /store/carts/{cart_id}?fields=*items,*items.variant,*items.variant.product,*region
```

### Product Variant Integration
From the seed script, products have variants with options:
- Material: "Sandstone", "Marble", "White Marble", "Black Stone"
- Finish: "Natural", "Polished"  
- Size: "Medium", "Large"
- Stone Type: "Sandstone", "Granite"

Each variant has its own pricing in INR and USD, with SKUs like:
- "GANESHA-SM-SAND-NAT" (₹1,500)
- "BUDDHA-MED-SAND" (₹5,500)
- "KRISHNA-FLUTE-WM" (₹6,500)

### Security
- Leverage Medusa's built-in cart security and validation
- Use existing publishable API key (pk_6db7dd79...) for frontend operations
- Validate cart operations through Medusa's business logic
- Handle cart ownership and session security via Medusa framework
- Ensure proper CORS configuration (already set in backend/.env)