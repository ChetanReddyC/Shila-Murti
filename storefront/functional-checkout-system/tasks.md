# Implementation Plan

- [X] 1. Extend Medusa API Client for Checkout Ops

  - Add methods: `updateCart`, `getShippingOptionsForCart`, `addShippingMethod`, `createPaymentSessions`, `selectPaymentSession`, `completeCart`
  - Use Medusa v2 Store endpoints only; handle 404 (cart expired) and map errors to friendly messages
  - Ensure requests include publishable key and leverage existing retry/perf logging

- [X] 2. Checkout Orchestration Hook/Utility

  - Implement a function (or hook) that sequences: update cart → fetch shipping options → select cheapest → init/select manual payment → complete cart
  - Return structured results and errors for UI to consume
  - Provide guards for missing cart id, invalid addresses, and missing options

- [X] 3. Checkout Page Integration (Non-visual changes minimal)

  - Wire the submit handler to call the orchestration function
  - Disable the submit button during async flow; surface progress and errors
  - On success, route to confirmation with real `order.id`/`display_id`
  - Remove client-only snapshot reliance once the real order exists

- [X] 4. Order Confirmation Page Update

  - Accept `order_id` (or similar) from navigation; fetch order details if needed
  - Display order number, items, totals, shipping summary
  - Clear cart state only after successful completion

- [X] 5. Error & Edge Case Handling

  - Graceful handling of: no eligible shipping options, failed payment session creation/selection, cart expiration, network downtime
  - Provide retry guidance and preserve form inputs across attempts

- [X] 6. Observability and Diagnostics

  - Add concise logs at each checkpoint (address set, shipping chosen, payment sessions, completion)
  - Confirm performance metrics are recorded by the API client

- [X] 7. Manual Test Scenarios

  - Valid checkout end-to-end creates a persisted order in Medusa Admin
  - Address validation errors block progression
  - Cheapest shipping selection verified against backend options
  - Cart expiration mid-flow handled without data loss
  - Network failure displays retryable errors


