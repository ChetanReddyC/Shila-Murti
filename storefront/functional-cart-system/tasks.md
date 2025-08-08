# Implementation Plan

- [x] 1. Extend Medusa API Client with cart operations

  - Add cart-specific methods to existing MedusaApiClient class
  - Implement createCart, getCart, addLineItem, updateLineItem, removeLineItem methods
  - Handle region selection for "India & International" region with INR currency
  - Add proper error handling for Medusa v2 API responses
  - _Requirements: 1.1, 5.1, 5.2_

- [x] 2. Create cart context with Medusa integration


  - Create CartContext and CartProvider components using React Context
  - Implement cart state management with useReducer for complex state updates
  - Add cart session persistence using sessionStorage for cart ID
  - Integrate with extended MedusaApiClient for all cart operations
  - Handle loading states and error states for cart operations
  - dont create any fucking tests for this!
  - _Requirements: 1.1, 1.2, 5.1, 5.3_

- [x] 3. Update product detail page for cart integration

  - Modify handleAddToCart function to use Medusa cart API via context
  - Map product variants to cart line items using variant_id
  - Add proper success feedback when items are added to cart
  - Handle edge cases like out of stock products and API errors
  - Maintain existing UI and user experience
  - dont create any fucking tests files for this!
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Remove mock data and connect cart page to Medusa

  - Remove all hardcoded mock cart data from cartPage.tsx
  - Connect cart page to CartContext to display real cart items
  - Display cart items with product name, image, price, and quantity from Medusa
  - Handle empty cart state with appropriate messaging
  - Show loading states while cart data is being fetched
  - dont create any fucking tests files for this!
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Implement dynamic quantity controls in cart page

  - Add quantity increase/decrease controls for each cart line item
  - Connect quantity controls to Medusa API via updateLineItem method
  - Update cart totals immediately when quantities change
  - Prevent negative quantities and handle quantity validation
  - Remove items from cart when quantity is reduced to zero
  - dont create any fucking tests files for this!
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Implement dynamic price calculations


  - Display accurate line item subtotals (price × quantity) from Medusa
  - Show cart subtotal, tax total, shipping total from Medusa calculations
  - Display overall cart total with proper INR currency formatting
  - Update all calculations automatically when cart contents change
  - Handle currency display consistently across the cart page
  - dont create any fucking tests files for this!
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Add cart session management and persistence

  - Implement cart ID storage in sessionStorage for session persistence
  - Handle cart recovery across page refreshes and navigation
  - Manage cart creation when no existing cart is found
  - Handle cart expiration and automatic recreation via Medusa API
  - Ensure cart state persists during user session
  - dont create any fucking tests for this!
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 8. Add error handling and user feedback


  - Implement comprehensive error handling for all cart operations
  - Show user-friendly error messages for API failures
  - Handle network failures with appropriate fallback UI
  - Add loading indicators during cart operations
  - Provide success feedback for cart actions (add, update, remove)
  - dont create any fucking tests files for this!
  - _Requirements: 1.4, 2.4, 4.1, 4.2_