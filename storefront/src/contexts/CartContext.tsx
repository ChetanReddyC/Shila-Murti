'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useState, useRef } from 'react';
import { MedusaCart } from '../types/medusa';
import { medusaApiClient, ApiError } from '../utils/medusaApiClient';
import { useErrorHandler } from '../hooks/useErrorHandler';

// Cart state interface
interface CartState {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  cartId: string | null;
  orderConfirmationProtection: boolean;
}

// Cart actions
type CartAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CART'; payload: MedusaCart }
  | { type: 'SET_CART_ID'; payload: string | null }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_CART_SILENTLY' }
  | { type: 'SET_ORDER_CONFIRMATION_PROTECTION'; payload: boolean }
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
  clearCartSilently: () => Promise<void>;
  getTotalItems: () => number;
  refreshCart: () => Promise<void>;
  loadSpecificCart: (cartId: string) => Promise<void>;
  createCart: () => Promise<void>;
  clearError: () => void;
  retryLastOperation: () => Promise<void>;
  isRetryable: boolean;
  isOrderConfirmationActive: () => boolean;
  setOrderConfirmationProtection: (active: boolean) => void;
}

// Initial state
const initialState: CartState = {
  cart: null,
  loading: false,
  error: null,
  cartId: null,
  orderConfirmationProtection: false,
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
      // Guard against unexpected undefined/null payloads from API responses.
      // Do NOT eagerly clear the entire cart if items still exist; prefer preserving items for consistency.
      if (!action.payload) {
        console.warn('[CartContext] SET_CART received undefined payload, ignoring to preserve current state');
        return { ...state, loading: false };
      }
      if (!action.payload.id && (action.payload as any)?.items == null) {
        console.warn('[CartContext] SET_CART payload missing id and items; ignoring to preserve current state');
        return { ...state, loading: false };
      }
      return {
        ...state,
        cart: action.payload,
        cartId: action.payload.id ?? state.cartId ?? null,
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
    case 'CLEAR_CART_SILENTLY':
      return {
        ...state,
        cart: null,
        cartId: null,
      };
    case 'SET_ORDER_CONFIRMATION_PROTECTION':
      return {
        ...state,
        orderConfirmationProtection: action.payload,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Storage keys - use localStorage for cross-tab cart sharing
const CART_ID_KEY = 'medusa_cart_id';
import {
  ORDER_CONFIRMATION_ACTIVE_KEY,
  DEFAULT_TTL_MS as ORDER_CONFIRMATION_TTL_MS,
  getOrderConfirmationProtectionExpiry,
  isOrderConfirmationProtectionActive as extIsActive,
  setOrderConfirmationProtection as extSetActive,
} from '../utils/orderConfirmationProtection';

// Create context
const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider component
interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { errorState, handleApiError, clearError: clearErrorHandler, isRetryableError } = useErrorHandler();



  // Track the last failed operation for retry functionality
  const [lastOperation, setLastOperation] = useState<{
    type: 'addToCart' | 'removeFromCart' | 'updateQuantity' | 'refreshCart' | 'createCart';
    params: any[];
  } | null>(null);

  // Storage helpers with enhanced error handling - using localStorage for cross-tab sharing
  const saveCartIdToSession = (cartId: string) => {
    try {
      localStorage.setItem(CART_ID_KEY, cartId);
      console.log('[CartContext] Cart ID saved to localStorage:', cartId);
    } catch (error) {
      console.warn('[CartContext] Failed to save cart ID to localStorage:', error);

      // Handle quota exceeded error by clearing old data and retrying
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        try {
          console.log('[CartContext] Storage quota exceeded, clearing and retrying...');
          localStorage.clear();
          localStorage.setItem(CART_ID_KEY, cartId);
          console.log('[CartContext] Cart ID saved after clearing storage');
        } catch (retryError) {
          console.error('[CartContext] Failed to save cart ID even after clearing storage:', retryError);
        }
      }
    }
  };

  // Guard to prevent concurrent silent clearing operations
  const silentClearInProgressRef = useRef(false);

  const getCartIdFromSession = (): string | null => {
    try {
      const cartId = localStorage.getItem(CART_ID_KEY);
      if (cartId) {
        console.log('[CartContext] Retrieved cart ID from localStorage:', cartId);
      }
      return cartId;
    } catch (error) {
      console.warn('[CartContext] Failed to get cart ID from localStorage:', error);
      return null;
    }
  };

  const removeCartIdFromSession = () => {
    try {
      const existingCartId = localStorage.getItem(CART_ID_KEY);
      localStorage.removeItem(CART_ID_KEY);
      if (existingCartId) {
        console.log('[CartContext] Removed cart ID from localStorage:', existingCartId);
      }
    } catch (error) {
      console.warn('[CartContext] Failed to remove cart ID from localStorage:', error);
    }
  };

  // Order confirmation protection helpers (sessionStorage-backed with TTL)
  const getOrderConfirmationActive = React.useCallback((): boolean => {
    return extIsActive();
  }, []);

  const setOrderConfirmationProtection = React.useCallback((active: boolean): void => {
    try {
      extSetActive(active, ORDER_CONFIRMATION_TTL_MS);
    } catch (error) {
      console.warn('[CartContext] Failed to persist protection flag; falling back to in-memory state only', error);
    }
    dispatch({ type: 'SET_ORDER_CONFIRMATION_PROTECTION', payload: active });
  }, []);

  const isOrderConfirmationActive = React.useCallback((): boolean => {
    const expiry = getOrderConfirmationProtectionExpiry();
    return typeof expiry === 'number' ? expiry > Date.now() : false;
  }, []);

  // Keep in-memory state in sync with persisted flag without dispatching during render
  useEffect(() => {
    const derivedActive = isOrderConfirmationActive();
    if (derivedActive !== state.orderConfirmationProtection) {
      dispatch({ type: 'SET_ORDER_CONFIRMATION_PROTECTION', payload: derivedActive });
    }
  }, [isOrderConfirmationActive, state.orderConfirmationProtection]);

  // Create a new cart
  const createCart = React.useCallback(async (): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping createCart');
      return;
    }
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
  }, [isOrderConfirmationActive]);

  // Handle cart session expiration and recreation
  const handleCartExpiration = React.useCallback(async (): Promise<void> => {
    console.log('[CartContext] Handling cart expiration - clearing session and preparing for new cart');
    removeCartIdFromSession();
    dispatch({ type: 'CLEAR_CART' });

    // Optionally create a new cart immediately
    // For now, we'll wait for the next add operation to create a new cart
    console.log('[CartContext] Cart session cleared, new cart will be created on next operation');
  }, []);

  // Load a specific cart by ID (for cross-device recovery)
  const loadSpecificCart = React.useCallback(async (cartId: string): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping loadSpecificCart');
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      console.log('[CartContext] Loading specific cart:', cartId);
      const cart = await medusaApiClient.getCart(cartId);

      // If the cart is already completed, treat as expired
      if ((cart as any)?.completed_at) {
        console.log('[CartContext] Specific cart is completed; cannot load');
        dispatch({ type: 'SET_ERROR', payload: 'This cart has already been completed' });
        return;
      }

      // Update both state and storage
      dispatch({ type: 'SET_CART', payload: cart });
      saveCartIdToSession(cart.id);
      console.log('[CartContext] Specific cart loaded successfully, items:', cart.items?.length || 0);
    } catch (error) {
      console.error('[CartContext] Failed to load specific cart:', error);

      if (error instanceof ApiError && error.status === 404) {
        dispatch({ type: 'SET_ERROR', payload: 'Cart not found or has expired' });
      } else {
        const errorMessage = handleApiError(error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [handleApiError, isOrderConfirmationActive]);

  // Refresh cart from API with enhanced error handling
  const refreshCart = React.useCallback(async (): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping refreshCart');
      return;
    }
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
      // If the cart is already completed, treat as expired and clear
      if ((cart as any)?.completed_at) {
        console.log('[CartContext] Retrieved completed cart on refresh; clearing session');
        await handleCartExpiration();
        setLastOperation(null);
        return;
      }
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
  }, [state.cartId, handleCartExpiration, handleApiError, isOrderConfirmationActive]);

  // Add item to cart with enhanced session management
  const addToCart = React.useCallback(async (variantId: string, quantity: number): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping addToCart');
      return;
    }
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
          if ((currentCart as any)?.completed_at) {
            console.log('[CartContext] Refreshed cart is completed; clearing and creating a new cart');
            removeCartIdFromSession();
            dispatch({ type: 'CLEAR_CART' });
            currentCart = null as any;
            cartId = null;
          }
          if (currentCart) {
            dispatch({ type: 'SET_CART', payload: currentCart as MedusaCart });
          }
        } catch (refreshError) {
          console.log('[CartContext] Failed to refresh existing cart, will create new one');
          removeCartIdFromSession();
          currentCart = null;
          cartId = null;
        }
      }

      // If we still have a cart object but it's completed, discard it before creating a new one
      if (currentCart && (currentCart as any)?.completed_at) {
        console.log('[CartContext] Current cart is completed; discarding before add');
        await handleCartExpiration();
        currentCart = null as any;
        cartId = null;
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
  }, [state.cart, state.cartId, handleApiError, isOrderConfirmationActive]);

  // Remove item from cart
  const removeFromCart = React.useCallback(async (lineItemId: string): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping removeFromCart');
      return;
    }
    if (!state.cart) {
      throw new Error('No cart available');
    }
    // Defensive: verify the line item exists before calling API to avoid undefined states
    const exists = state.cart.items?.some((it) => it.id === lineItemId);
    if (!exists) {
      console.warn('[CartContext] removeFromCart called for non-existent lineItemId, ignoring:', lineItemId);
      return;
    }

    const cartId = state.cart.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'removeFromCart', params: [lineItemId] });

    try {
      console.log('[CartContext] Removing item from cart:', { cartId, lineItemId });
      const updatedCart = await medusaApiClient.removeLineItem(cartId, lineItemId);

      // Normalize: only clear the cart if the backend explicitly indicates the cart no longer exists (missing id AND no items array).
      // Otherwise, if the response is missing id but has items, keep local cart state filtered as a fallback to avoid nuking other items.
      if (!updatedCart || (!updatedCart.id && (updatedCart as any)?.items == null)) {
        console.warn('[CartContext] No valid cart returned after removal; preserving existing cart items except removed one');
        const remainingItems = state.cart.items?.filter((it) => it.id !== lineItemId) ?? [];
        // If remaining items exist, update local state minimally to avoid losing the rest
        if (remainingItems.length > 0) {
          const localCart: MedusaCart = {
            ...(state.cart as MedusaCart),
            items: remainingItems,
          };
          dispatch({ type: 'SET_CART', payload: localCart });
        } else {
          // No items left, clear cart
          dispatch({ type: 'CLEAR_CART' });
        }
      } else {
        dispatch({ type: 'SET_CART', payload: updatedCart });
      }
      setLastOperation(null); // Clear last operation on success
      console.log('[CartContext] Item removed from cart successfully');
    } catch (error) {
      const errorMessage = handleApiError(error);
      console.error('[CartContext] Failed to remove item from cart:', error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  }, [state.cart, handleApiError, isOrderConfirmationActive]);

  // Update item quantity in cart
  const updateQuantity = React.useCallback(async (lineItemId: string, quantity: number): Promise<void> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; skipping updateQuantity');
      return;
    }
    if (!state.cart) {
      throw new Error('No cart available');
    }

    // If quantity is 0 or negative, remove the item
    if (quantity <= 0) {
      // Ensure the id exists before attempting removal
      const exists = state.cart.items?.some((it) => it.id === lineItemId);
      if (exists) {
        await removeFromCart(lineItemId);
      } else {
        console.warn('[CartContext] updateQuantity to 0 for non-existent line item, ignoring:', lineItemId);
      }
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
  }, [state.cart, removeFromCart, handleApiError, isOrderConfirmationActive]);

  // Clear cart (reset state and remove from session)
  const clearCart = React.useCallback(async (): Promise<void> => {
    // Do not force route changes here. Just clear state and id.
    dispatch({ type: 'CLEAR_CART' });
    removeCartIdFromSession();
    setLastOperation(null);
    clearErrorHandler();
    console.log('[CartContext] Cart cleared');
  }, [clearErrorHandler]);

  // Clear cart silently: reset state and session without touching loading/error
  const clearCartSilently = React.useCallback(async (): Promise<void> => {
    if (silentClearInProgressRef.current) {
      return;
    }
    silentClearInProgressRef.current = true;
    try {
      dispatch({ type: 'CLEAR_CART_SILENTLY' });
      removeCartIdFromSession();
      console.log('[CartContext] Cart cleared silently');
    } catch (error) {
      // Graceful degradation: log and attempt a best-effort non-silent clear without surfacing UI states
      console.warn('[CartContext] Silent clear encountered an error; applying fallback clear', error);
      try {
        dispatch({ type: 'CLEAR_CART' });
        removeCartIdFromSession();
      } catch { }
    } finally {
      silentClearInProgressRef.current = false;
    }
  }, []);

  // Clear error state
  const clearError = React.useCallback((): void => {
    dispatch({ type: 'SET_ERROR', payload: null });
    clearErrorHandler();
  }, [clearErrorHandler]);

  // Retry the last failed operation
  const retryLastOperation = React.useCallback(async (): Promise<void> => {
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
  }, [lastOperation, addToCart, removeFromCart, updateQuantity, refreshCart, createCart]);

  // Get total number of items in cart
  const getTotalItems = React.useCallback((): number => {
    if (!state.cart || !state.cart.items) {
      return 0;
    }

    return state.cart.items.reduce((total, item) => total + item.quantity, 0);
  }, [state.cart]);

  // Validate cart session integrity
  const validateCartSession = React.useCallback(async (cartId: string): Promise<boolean> => {
    if (isOrderConfirmationActive()) {
      console.log('[CartContext] Order confirmation protection active; validateCartSession -> false');
      return false;
    }
    try {
      console.log('[CartContext] Validating cart session:', cartId);
      const cart = await medusaApiClient.getCart(cartId);
      if ((cart as any)?.completed_at) {
        console.log('[CartContext] Cart session points to a completed cart; invalid');
        return false;
      }
      console.log('[CartContext] Cart session is valid');
      return true;
    } catch (error) {
      console.log('[CartContext] Cart session is invalid or expired:', error);
      return false;
    }
  }, [isOrderConfirmationActive]);

  // Initialize cart on mount and handle session management
  useEffect(() => {
    const initializeCart = async () => {
      // Check if we're in a post-order state where cart recovery should be blocked
      if (typeof window !== 'undefined') {
        const active = isOrderConfirmationActive();
        if (active) {
          dispatch({ type: 'SET_ORDER_CONFIRMATION_PROTECTION', payload: true });
          console.log('[CartContext] Order confirmation active; skipping cart recovery');
          return;
        }
      }

      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      const savedCartId = getCartIdFromSession();

      // On order-confirmation page, do not recover cart to avoid any interference; user just placed an order.
      if (path && path.startsWith('/order-confirmation')) {
        console.log('[CartContext] On order confirmation; skipping cart recovery');
        // Set a marker to prevent any cart-related redirects for the next 30 seconds
        setOrderConfirmationProtection(true);
        return
      }

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
  }, [isOrderConfirmationActive, setOrderConfirmationProtection]);

  // Handle browser back/forward: if user navigates to order confirmation, refresh protection TTL
  useEffect(() => {
    const handlePopState = () => {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (path && path.startsWith('/order-confirmation')) {
        setOrderConfirmationProtection(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [setOrderConfirmationProtection]);

  // Handle cross-tab cart synchronization via localStorage events
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Only respond to cart ID changes from other tabs
      if (e.key === CART_ID_KEY && e.newValue !== e.oldValue) {
        const newCartId = e.newValue;
        console.log('[CartContext] Cart ID changed in another tab:', { old: e.oldValue, new: newCartId });

        if (newCartId && newCartId !== state.cartId) {
          // Another tab updated the cart ID, refresh our cart
          dispatch({ type: 'SET_CART_ID', payload: newCartId });
          refreshCart();
        } else if (!newCartId && state.cart) {
          // Another tab cleared the cart
          dispatch({ type: 'CLEAR_CART' });
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [state.cartId, state.cart, refreshCart]);

  // Handle browser session end - cleanup on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Note: localStorage persists across browser sessions
      // This is just for logging purposes and any final cleanup if needed
      console.log('[CartContext] Browser session ending, cart ID will persist in localStorage');
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
        // Do not auto-refresh on order confirmation page to avoid flicker/redirects
        const path = typeof window !== 'undefined' ? window.location.pathname : ''
        if (path && path.startsWith('/order-confirmation')) return
        if (isOrderConfirmationActive()) return
        console.log('[CartContext] Page became visible, refreshing cart state');
        await refreshCart();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.cartId, isOrderConfirmationActive, refreshCart]);

  // Handle network connectivity changes to ensure cart persistence
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[CartContext] Network connection restored');

      // If we have a cart ID but no cart data, try to refresh
      if (state.cartId && !state.cart) {
        if (isOrderConfirmationActive()) return
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
  }, [state.cartId, state.cart, isOrderConfirmationActive, refreshCart]);

  // Periodic cart session validation to ensure persistence
  useEffect(() => {
    if (!state.cartId || !state.cart) {
      return;
    }
    if (isOrderConfirmationActive()) {
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
  }, [state.cartId, state.cart, isOrderConfirmationActive, handleCartExpiration]);

  // Context value
  const contextValue: CartContextType = React.useMemo(() => ({
    cart: state.cart,
    loading: state.loading,
    error: state.error || errorState.error,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    clearCartSilently,
    getTotalItems,
    refreshCart,
    loadSpecificCart,
    createCart,
    clearError,
    retryLastOperation,
    isRetryable: errorState.isRetryable || (lastOperation !== null && isRetryableError(errorState.originalError)),
    isOrderConfirmationActive,
    setOrderConfirmationProtection,
  }), [state.cart, state.loading, state.error, errorState.error, addToCart, removeFromCart, updateQuantity, clearCart, clearCartSilently, getTotalItems, refreshCart, loadSpecificCart, createCart, clearError, retryLastOperation, errorState.isRetryable, lastOperation, isRetryableError, errorState.originalError, isOrderConfirmationActive, setOrderConfirmationProtection]);

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
