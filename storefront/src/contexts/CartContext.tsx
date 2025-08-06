'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useState } from 'react';
import { MedusaCart } from '../types/medusa';
import { medusaApiClient, ApiError } from '../utils/medusaApiClient';
import { useErrorHandler } from '../hooks/useErrorHandler';

// Cart state interface
interface CartState {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  cartId: string | null;
}

// Cart actions
type CartAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CART'; payload: MedusaCart }
  | { type: 'SET_CART_ID'; payload: string | null }
  | { type: 'CLEAR_CART' }
  | { type: 'RESET_STATE' };

// Cart context interface
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
  clearError: () => void;
  retryLastOperation: () => Promise<void>;
  isRetryable: boolean;
}

// Initial state
const initialState: CartState = {
  cart: null,
  loading: false,
  error: null,
  cartId: null,
};

// Cart reducer
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    case 'SET_CART':
      return {
        ...state,
        cart: action.payload,
        cartId: action.payload.id,
        loading: false,
        error: null,
      };
    case 'SET_CART_ID':
      return {
        ...state,
        cartId: action.payload,
      };
    case 'CLEAR_CART':
      return {
        ...state,
        cart: null,
        cartId: null,
        error: null,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Session storage keys
const CART_ID_KEY = 'medusa_cart_id';

// Create context
const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider component
interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { errorState, handleApiError, clearError: clearErrorHandler, isRetryableError } = useErrorHandler();

  useEffect(() => {
    console.log('[CartContext] Initializing cart from session');
    refreshCart();
  }, []);
  
  // Track the last failed operation for retry functionality
  const [lastOperation, setLastOperation] = useState<{
    type: 'addToCart' | 'removeFromCart' | 'updateQuantity' | 'refreshCart' | 'createCart';
    params: any[];
  } | null>(null);

  // Session storage helpers with enhanced error handling
  const saveCartIdToSession = (cartId: string) => {
    try {
      sessionStorage.setItem(CART_ID_KEY, cartId);
      console.log('[CartContext] Cart ID saved to session:', cartId);
    } catch (error) {
      console.warn('[CartContext] Failed to save cart ID to sessionStorage:', error);
      
      // Handle quota exceeded error by clearing old data and retrying
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        try {
          console.log('[CartContext] Storage quota exceeded, clearing and retrying...');
          sessionStorage.clear();
          sessionStorage.setItem(CART_ID_KEY, cartId);
          console.log('[CartContext] Cart ID saved after clearing storage');
        } catch (retryError) {
          console.error('[CartContext] Failed to save cart ID even after clearing storage:', retryError);
        }
      }
    }
  };

  const getCartIdFromSession = (): string | null => {
    try {
      const cartId = sessionStorage.getItem(CART_ID_KEY);
      if (cartId) {
        console.log('[CartContext] Retrieved cart ID from session:', cartId);
      }
      return cartId;
    } catch (error) {
      console.warn('[CartContext] Failed to get cart ID from sessionStorage:', error);
      return null;
    }
  };

  const removeCartIdFromSession = () => {
    try {
      const existingCartId = sessionStorage.getItem(CART_ID_KEY);
      sessionStorage.removeItem(CART_ID_KEY);
      if (existingCartId) {
        console.log('[CartContext] Removed cart ID from session:', existingCartId);
      }
    } catch (error) {
      console.warn('[CartContext] Failed to remove cart ID from sessionStorage:', error);
    }
  };

  // Create a new cart
  const createCart = async (): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'createCart', params: [] });

    try {
      console.log('[CartContext] Creating new cart...');
      const newCart = await medusaApiClient.createCart();
      
      dispatch({ type: 'SET_CART', payload: newCart });
      saveCartIdToSession(newCart.id);
      setLastOperation(null); // Clear last operation on success
      
      console.log('[CartContext] Cart created successfully:', newCart.id);
    } catch (error) {
      const errorMessage = handleApiError(error);
      console.error('[CartContext] Failed to create cart:', error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error; // Re-throw so calling components can handle it
    }
  };

  // Handle cart session expiration and recreation
  const handleCartExpiration = async (): Promise<void> => {
    console.log('[CartContext] Handling cart expiration - clearing session and preparing for new cart');
    removeCartIdFromSession();
    dispatch({ type: 'CLEAR_CART' });
    
    // Optionally create a new cart immediately
    // For now, we'll wait for the next add operation to create a new cart
    console.log('[CartContext] Cart session cleared, new cart will be created on next operation');
  };

  // Refresh cart from API with enhanced error handling
  const refreshCart = async (): Promise<void> => {
    const cartId = state.cartId || getCartIdFromSession();
    
    if (!cartId) {
      console.log('[CartContext] No cart ID found, will create on first add');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'refreshCart', params: [] });

    try {
      console.log('[CartContext] Refreshing cart:', cartId);
      const cart = await medusaApiClient.getCart(cartId);
      
      dispatch({ type: 'SET_CART', payload: cart });
      setLastOperation(null); // Clear last operation on success
      console.log('[CartContext] Cart refreshed successfully, items:', cart.items?.length || 0);
    } catch (error) {
      console.error('[CartContext] Failed to refresh cart:', error);
      
      // Handle cart expiration or not found (404)
      if (error instanceof ApiError && error.status === 404) {
        console.log('[CartContext] Cart expired or not found, handling expiration');
        await handleCartExpiration();
        setLastOperation(null); // Clear operation since we handled expiration
      } else {
        const errorMessage = handleApiError(error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  };

  // Add item to cart with enhanced session management
  const addToCart = async (variantId: string, quantity: number): Promise<void> => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'addToCart', params: [variantId, quantity] });

    try {
      // Ensure we have a cart
      let currentCart = state.cart;
      let cartId = state.cartId || getCartIdFromSession();
      
      // If we have a cart ID but no cart object, try to refresh first
      if (cartId && !currentCart) {
        try {
          console.log('[CartContext] Found cart ID but no cart object, refreshing...');
          currentCart = await medusaApiClient.getCart(cartId);
          dispatch({ type: 'SET_CART', payload: currentCart });
        } catch (refreshError) {
          console.log('[CartContext] Failed to refresh existing cart, will create new one');
          removeCartIdFromSession();
          currentCart = null;
          cartId = null;
        }
      }
      
      // Create new cart if needed
      if (!currentCart) {
        try {
          currentCart = await medusaApiClient.createCart({}); // Pass empty object
          dispatch({ type: 'SET_CART', payload: currentCart });
          saveCartIdToSession(currentCart.id);
        } catch (createError) {
            const errorMessage = handleApiError(createError);
            dispatch({ type: 'SET_ERROR', payload: errorMessage });
            throw createError;
        }
      }

      console.log('[CartContext] Adding item to cart:', { cartId: currentCart.id, variantId, quantity });
      const updatedCart = await medusaApiClient.addLineItem(currentCart.id, {
        variant_id: variantId,
        quantity,
      });
      
      dispatch({ type: 'SET_CART', payload: updatedCart });
      setLastOperation(null); // Clear last operation on success
      console.log('[CartContext] Item added to cart successfully, total items:', updatedCart.items?.length || 0);
    } catch (error) {
      const errorMessage = handleApiError(error);
      console.error('[CartContext] Failed to add item to cart:', error);
      
      // Handle cart expiration during add operation
      if (error instanceof ApiError && error.status === 404) {
        console.log('[CartContext] Cart expired during add operation');
        await handleCartExpiration();
        setLastOperation(null); // Clear operation since we handled expiration
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
      
      throw error; // Re-throw so calling components can handle it
    }
  };

  // Remove item from cart
  const removeFromCart = async (lineItemId: string): Promise<void> => {
    if (!state.cart) {
      throw new Error('No cart available');
    }

    const cartId = state.cart.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'removeFromCart', params: [lineItemId] });

    try {
      console.log('[CartContext] Removing item from cart:', { cartId, lineItemId });
      const updatedCart = await medusaApiClient.removeLineItem(cartId, lineItemId);
      
      dispatch({ type: 'SET_CART', payload: updatedCart });
      setLastOperation(null); // Clear last operation on success
      console.log('[CartContext] Item removed from cart successfully');
    } catch (error) {
      const errorMessage = handleApiError(error);
      console.error('[CartContext] Failed to remove item from cart:', error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Update item quantity in cart
  const updateQuantity = async (lineItemId: string, quantity: number): Promise<void> => {
    if (!state.cart) {
      throw new Error('No cart available');
    }

    // If quantity is 0 or negative, remove the item
    if (quantity <= 0) {
      await removeFromCart(lineItemId);
      return;
    }

    const cartId = state.cart.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'updateQuantity', params: [lineItemId, quantity] });

    try {
      console.log('[CartContext] Updating item quantity:', { cartId, lineItemId, quantity });
      const updatedCart = await medusaApiClient.updateLineItem(cartId, lineItemId, {
        quantity,
      });
      
      dispatch({ type: 'SET_CART', payload: updatedCart });
      setLastOperation(null); // Clear last operation on success
      console.log('[CartContext] Item quantity updated successfully');
    } catch (error) {
      const errorMessage = handleApiError(error);
      console.error('[CartContext] Failed to update item quantity:', error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Clear cart (reset state and remove from session)
  const clearCart = async (): Promise<void> => {
    dispatch({ type: 'CLEAR_CART' });
    removeCartIdFromSession();
    setLastOperation(null);
    clearErrorHandler();
    console.log('[CartContext] Cart cleared');
  };

  // Clear error state
  const clearError = (): void => {
    dispatch({ type: 'SET_ERROR', payload: null });
    clearErrorHandler();
  };

  // Retry the last failed operation
  const retryLastOperation = async (): Promise<void> => {
    if (!lastOperation) {
      console.warn('[CartContext] No operation to retry');
      return;
    }

    console.log('[CartContext] Retrying last operation:', lastOperation);

    try {
      switch (lastOperation.type) {
        case 'addToCart':
          await addToCart(lastOperation.params[0], lastOperation.params[1]);
          break;
        case 'removeFromCart':
          await removeFromCart(lastOperation.params[0]);
          break;
        case 'updateQuantity':
          await updateQuantity(lastOperation.params[0], lastOperation.params[1]);
          break;
        case 'refreshCart':
          await refreshCart();
          break;
        case 'createCart':
          await createCart();
          break;
        default:
          console.warn('[CartContext] Unknown operation type:', lastOperation.type);
      }
    } catch (error) {
      console.error('[CartContext] Retry failed:', error);
      // Error is already handled by the individual operation functions
    }
  };

  // Get total number of items in cart
  const getTotalItems = (): number => {
    if (!state.cart || !state.cart.items) {
      return 0;
    }
    
    return state.cart.items.reduce((total, item) => total + item.quantity, 0);
  };

  // Validate cart session integrity
  const validateCartSession = async (cartId: string): Promise<boolean> => {
    try {
      console.log('[CartContext] Validating cart session:', cartId);
      await medusaApiClient.getCart(cartId);
      console.log('[CartContext] Cart session is valid');
      return true;
    } catch (error) {
      console.log('[CartContext] Cart session is invalid or expired:', error);
      return false;
    }
  };

  // Initialize cart on mount and handle session management
  useEffect(() => {
    const initializeCart = async () => {
      const savedCartId = getCartIdFromSession();
      
      if (savedCartId) {
        console.log('[CartContext] Found saved cart ID, attempting to recover:', savedCartId);
        
        // Validate the cart session before using it
        const isValidSession = await validateCartSession(savedCartId);
        
        if (isValidSession) {
          dispatch({ type: 'SET_CART_ID', payload: savedCartId });
          await refreshCart();
        } else {
          console.log('[CartContext] Invalid cart session, clearing and will create new cart on first add');
          removeCartIdFromSession();
          dispatch({ type: 'CLEAR_CART' });
        }
      } else {
        console.log('[CartContext] No saved cart found, will create on first add');
      }
    };

    initializeCart();
  }, []);

  // Handle browser session end - cleanup on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Note: sessionStorage automatically clears when the browser session ends
      // This is just for logging purposes and any final cleanup if needed
      console.log('[CartContext] Browser session ending, cart will be cleared automatically');
      
      // Optional: Perform any final cart state synchronization if needed
      // The sessionStorage will be automatically cleared when the browser session ends
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Handle page visibility changes to refresh cart when user returns
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden && state.cartId) {
        console.log('[CartContext] Page became visible, refreshing cart state');
        await refreshCart();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.cartId]);

  // Handle network connectivity changes to ensure cart persistence
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[CartContext] Network connection restored');
      
      // If we have a cart ID but no cart data, try to refresh
      if (state.cartId && !state.cart) {
        console.log('[CartContext] Attempting to restore cart after reconnection');
        await refreshCart();
      }
    };

    const handleOffline = () => {
      console.log('[CartContext] Network connection lost - cart operations will be queued');
      // Note: Cart operations will fail gracefully and can be retried when online
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [state.cartId, state.cart]);

  // Periodic cart session validation to ensure persistence
  useEffect(() => {
    if (!state.cartId || !state.cart) {
      return;
    }

    // Validate cart session every 5 minutes to ensure it's still active
    const validationInterval = setInterval(async () => {
      console.log('[CartContext] Performing periodic cart session validation');
      
      try {
        await medusaApiClient.getCart(state.cartId!);
        console.log('[CartContext] Cart session validation successful');
      } catch (error) {
        console.log('[CartContext] Cart session validation failed, handling expiration');
        await handleCartExpiration();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(validationInterval);
    };
  }, [state.cartId, state.cart]);

  // Context value
  const contextValue: CartContextType = {
    cart: state.cart,
    loading: state.loading,
    error: state.error || errorState.error,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalItems,
    refreshCart,
    createCart,
    clearError,
    retryLastOperation,
    isRetryable: errorState.isRetryable || (lastOperation !== null && isRetryableError(errorState.originalError)),
  };

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
}

// Custom hook to use cart context
export function useCart(): CartContextType {
  const context = useContext(CartContext);
  
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  
  return context;
}

// Export context for testing purposes
export { CartContext };