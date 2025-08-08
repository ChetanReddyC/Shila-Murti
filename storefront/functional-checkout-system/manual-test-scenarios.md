# Manual Test Scenarios – Functional Checkout System

This guide documents high-signal manual checks to validate the full checkout flow using Medusa v2 Store routes, manual payment, and cheapest shipping selection.

## Preconditions
- Backend is running and reachable by the storefront (`NEXT_PUBLIC_MEDUSA_API_BASE_URL` configured).
- A publishable API key is configured as `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- Regions/Shipping options seeded (India & International; Standard/Express) per seed script.
- Storefront dev server is running.

## 1) Happy Path – End-to-End Checkout Creates Order
1. Navigate to `/products`.
2. Open a product detail page and click “Add to Cart”.
3. Go to `/cart` and verify the item is shown with correct price/quantity.
4. Navigate to `/checkout`.
5. Fill shipping fields: Name, Address, City, State, Postal Code, Contact Number.
6. Submit “Place Order”.

Expected:
- Console shows logs for each checkpoint (update cart, fetch shipping options, add shipping, create/select payment, complete cart).
- Browser navigates to `/order-confirmation?order_id=...`.
- Confirmation page shows a real order number (or fallback), items, and totals.
- Cart is cleared after the confirmation page loads.
- Medusa Admin shows the new Order with matching totals/items.

Notes:
- If Admin doesn’t show the order, check network tab for `/store/carts/:id/complete` and backend logs.

## 2) Address Validation Errors Block Progression
1. Go to `/checkout` with items in cart.
2. Leave one or more required fields empty (e.g., Address or Postal Code).
3. Click “Place Order”.

Expected:
- The form should prevent submission (native `required` enforcement) or the backend should reject update with a descriptive error surfaced via alert.
- No order is created; user remains on checkout.

## 3) Cheapest Shipping Option is Selected
1. Ensure backend has multiple options (e.g., Standard = 500, Express = 1000).
2. Go through checkout normally.

Expected:
- Console log indicates chosen option id; totals reflect the cheaper option amount.
- Admin order’s shipping total matches the cheapest eligible option.

## 4) Cart Expiration Mid-Flow
1. Start checkout, then invalidate the cart (e.g., delete via Admin or let it expire in dev).
2. Click “Place Order”.

Expected:
- Flow fails gracefully, showing: “Your cart has expired or was not found. Please start checkout again.”
- Cart context clears id; user can start a new cart by adding an item.

## 5) Network Failure
1. Temporarily stop the backend or block requests (e.g., devtools throttling/denylist).
2. Click “Place Order”.

Expected:
- Flow fails with a network message: “Network issue prevented checkout. Check your connection and try again.”
- After restoring connectivity, retry succeeds without re-filling data (if the page state is preserved) or after minimal inputs.

## 6) Payment Session Errors
1. Simulate a failure during payment session creation/selection (e.g., temporarily misconfigure provider or inject failure).
2. Submit checkout.

Expected:
- Flow stops with a descriptive message (“Failed to initialize payment” or “Failed to select payment”).
- User can retry from checkout.

## 7) Confirmation Page Data Integrity
1. After success, reload `/order-confirmation?order_id=<id>`.

Expected:
- Page loads real order data; items and totals match Admin.
- Session snapshots are cleared after a minute; cart already cleared.

## Troubleshooting Checklist
- Verify environment variables in the storefront: `NEXT_PUBLIC_MEDUSA_API_BASE_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- Confirm CORS setup in backend for store URL.
- Check network tab for:
  - `POST /store/carts` (on first add)
  - `POST /store/carts/:id` (update)
  - `GET /store/shipping-options?cart_id=:id`
  - `POST /store/carts/:id/shipping-methods`
  - `POST /store/carts/:id/payment-sessions`
  - `POST /store/carts/:id/payment-sessions/manual`
  - `POST /store/carts/:id/complete`
- Inspect console logs for orchestrator checkpoints and API client performance metrics lines.

