# Cart Context Usage

The CartContext provides a complete cart management solution integrated with Medusa's cart API.

## Basic Usage

```tsx
import { useCart } from '../contexts';

function MyComponent() {
  const {
    cart,
    loading,
    error,
    addToCart,
    removeFromCart,
    updateQuantity,
    getTotalItems,
    clearCart
  } = useCart();

  // Add item to cart
  const handleAddToCart = async (variantId: string, quantity: number) => {
    try {
      await addToCart(variantId, quantity);
      console.log('Item added successfully!');
    } catch (error) {
      console.error('Failed to add item:', error);
    }
  };

  // Update quantity
  const handleUpdateQuantity = async (lineItemId: string, newQuantity: number) => {
    try {
      await updateQuantity(lineItemId, newQuantity);
    } catch (error) {
      console.error('Failed to update quantity:', error);
    }
  };

  // Remove item
  const handleRemoveItem = async (lineItemId: string) => {
    try {
      await removeFromCart(lineItemId);
    } catch (error) {
      console.error('Failed to remove item:', error);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Cart ({getTotalItems()} items)</h2>
      {cart?.items.map(item => (
        <div key={item.id}>
          <span>{item.title} - Quantity: {item.quantity}</span>
          <button onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}>
            +
          </button>
          <button onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}>
            -
          </button>
          <button onClick={() => handleRemoveItem(item.id)}>
            Remove
          </button>
        </div>
      ))}
      <p>Total: {cart?.currency_code} {cart?.total}</p>
    </div>
  );
}
```

## Features

- **Session Persistence**: Cart ID is stored in sessionStorage and persists across page refreshes
- **Automatic Cart Creation**: Creates a new cart automatically when needed
- **Error Handling**: Comprehensive error handling for all cart operations
- **Loading States**: Loading indicators for all async operations
- **Medusa Integration**: Full integration with Medusa v2 cart API
- **Quantity Management**: Handles quantity updates and automatic item removal when quantity reaches 0
- **Cart Recovery**: Automatically recovers cart from session or creates new one if expired

## State Management

The context uses useReducer for complex state management with the following actions:
- `SET_LOADING`: Manages loading states
- `SET_ERROR`: Handles error states
- `SET_CART`: Updates cart data
- `SET_CART_ID`: Manages cart ID
- `CLEAR_CART`: Clears cart state
- `RESET_STATE`: Resets to initial state

## Session Storage

Cart ID is automatically saved to sessionStorage with key `medusa_cart_id` and is used for cart recovery across browser sessions.