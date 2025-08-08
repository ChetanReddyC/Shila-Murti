# Design Document

## Overview

The functional checkout system orchestrates Medusa v2 Store API calls to transform a cart into a persisted order. It captures customer details, selects the backend-determined cheapest eligible shipping option, initializes and selects a manual payment session, and completes the cart. The frontend coordinates these steps with robust error handling and clear UX.

## Architecture

### Backend Integration (Medusa v2)
- Store routes only; no custom backend needed initially
- Endpoints leveraged:
  - `POST /store/carts` (create cart)
  - `GET /store/carts/{id}` (retrieve cart with expanded fields)
  - `POST /store/carts/{id}` (update cart: email, shipping/billing addresses)
  - `GET /store/shipping-options?cart_id={id}` (list eligible shipping options)
  - `POST /store/carts/{id}/shipping-methods` (add shipping method)
  - `POST /store/carts/{id}/payment-sessions` (create payment sessions)
  - `POST /store/carts/{id}/payment-sessions/{provider_id}` (select payment session)
  - `POST /store/carts/{id}/complete` (complete cart to create order)

### Frontend State Management
- Existing `CartContext` continues to manage cart id and items
- New checkout orchestration layer (hooks/utils) to sequence steps
- API client extended for checkout-specific methods with retries and metrics

### Component Structure
```
CartProvider (Context + basic cart ops)
└── CheckoutPage (Orchestrator)
    ├── AddressForm (collects email + shipping address)
    ├── ShippingStep (derives cheapest eligible from backend)
    ├── PaymentStep (manual payment session init/select)
    └── Submission (complete cart → order)

OrderConfirmationPage
└── Displays real order (id/number/items/totals/shipping)
```

## Interfaces and Data Flow

### Update Cart Payload (v2)
```typescript
interface UpdateCartPayload {
  email?: string
  shipping_address?: {
    first_name?: string
    last_name?: string
    address_1: string
    address_2?: string
    city: string
    postal_code: string
    province?: string
    country_code: string // e.g., 'in'
    phone?: string
  }
  billing_address?: UpdateCartPayload["shipping_address"]
}
```

### Shipping Option Selection
1. Fetch options via `GET /store/shipping-options?cart_id={id}`
2. Choose the cheapest by comparing price amounts in the cart currency
3. Add the selection via `POST /store/carts/{id}/shipping-methods` with the option id

### Payment Session (Manual)
1. Create sessions: `POST /store/carts/{id}/payment-sessions`
2. Select provider: `POST /store/carts/{id}/payment-sessions/{provider_id}` where provider id is manual

### Completion
1. `POST /store/carts/{id}/complete`
2. Expect `{ order }` in response on success
3. Navigate to confirmation with `order.id` or `order.display_id` (number)

## Error Handling Strategy
- Normalize API errors to user-friendly messages
- Specific branches for 404 cart expiration → clear session and guide restart
- Guard against “no eligible shipping options” and block until resolved
- Defensive checks before each step (require cart id, required fields)

## Performance and Resilience
- Reuse API client’s retry/backoff and performance logging
- Minimize redundant cart fetches by using returned cart after each mutation
- Ensure idempotency on user re-submits by disabling the submit button while in-flight

## Security and Compliance
- Use publishable API key for store routes
- Avoid persisting PII beyond what Medusa stores in the cart/order
- Keep payment manual (no card details handled)

## Testing Scope (Manual)
- Address validation scenarios
- Shipping options available/unavailable
- Payment session creation or selection failure
- Cart expiration during any step
- Successful end-to-end flow creates an order and clears cart


