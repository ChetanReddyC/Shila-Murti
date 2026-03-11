'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { MedusaCart } from '../types/medusa';
import { medusaApiClient, ApiError } from '../utils/medusaApiClient';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { PriceCalculationService, CartTotals, ValidationResult } from '../services/PriceCalculationService';
import { PriceValidator, PriceConsistencyResult } from '../services/PriceValidator';
import { InventoryValidationService } from '../services/InventoryValidationService';
import { CartLimitService } from '../services/CartLimitService';

// Cart state interface
interface CartState {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  cartId: string | null;
  calculatedTotals: CartTotals | null;
  priceValidation: PriceConsistencyResult | null;
}

// Cart actions
type CartAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CART'; payload: MedusaCart }
  | { type: 'SET_CART_ID'; payload: string | null }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_CART_SILENTLY' }
  | { type: 'SET_CALCULATED_TOTALS'; payload: CartTotals | null }
  | { type: 'SET_PRICE_VALIDATION'; payload: PriceConsistencyResult | null }
  | { type: 'RESET_STATE' };

// Cart context interface
interface CartContextType {
  cart: MedusaCart | null;
  loading: boolean;
  error: string | null;
  calculatedTotals: CartTotals | null;
  priceValidation: PriceConsistencyResult | null;
  addToCart: (variantId: string, quantity: number, estimatedUnitPrice?: number) => Promise<void>;
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
  // Price calculation methods
  formatCurrency: (amount: number, currency?: string) => string;
  getFormattedTotal: () => string;
  getFormattedSubtotal: () => string;
  getFormattedShipping: () => string;
  validatePrices: () => PriceConsistencyResult | null;
  recalculatePrices: (selectedShippingOptionId?: string) => void;
}

// Initial state
const initialState: CartState = {
  cart: null,
  loading: true,
  error: null,
  cartId: null,
  calculatedTotals: null,
  priceValidation: null,
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
        return { ...state, loading: false };
      }
      if (!action.payload.id && (action.payload as any)?.items == null) {
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
        calculatedTotals: null,
        priceValidation: null,
      };
    case 'CLEAR_CART_SILENTLY':
      return {
        ...state,
        cart: null,
        cartId: null,
        calculatedTotals: null,
        priceValidation: null,
      };
    case 'SET_CALCULATED_TOTALS':
      return {
        ...state,
        calculatedTotals: action.payload,
      };
    case 'SET_PRICE_VALIDATION':
      return {
        ...state,
        priceValidation: action.payload,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Session API endpoint for secure cart management
// IMPORTANT: Must use backend API to set cookie on backend domain (localhost:9000)
// so that cookies are sent with subsequent cart requests to the backend
const CART_SESSION_API = `${process.env.NEXT_PUBLIC_MEDUSA_API_BASE_URL}/store/cart-session`;

const safeParseJSON = <T,>(payload: string | null): T | null => {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
};

// Create context
const CartContext = createContext<CartContextType | undefined>(undefined);

// Cart provider component
interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { errorState, handleApiError, clearError: clearErrorHandler, isRetryableError } = useErrorHandler();
  const { data: session, status: sessionStatus } = useSession();

  const sessionUserId = React.useMemo(() => {
    if (sessionStatus === 'authenticated') {
      return session?.user?.email || session?.user?.id || session?.user?.name || null;
    }
    return null;
  }, [sessionStatus, session?.user?.email, session?.user?.id, session?.user?.name]);



  // Track the last failed operation for retry functionality
  const [lastOperation, setLastOperation] = useState<{
    type: 'addToCart' | 'removeFromCart' | 'updateQuantity' | 'refreshCart' | 'createCart';
    params: any[];
  } | null>(null);

  // Performance Enhancement: Prevent concurrent refresh calls
  // Addresses Security Audit Issue #11A: N+1 Query Problem
  const refreshInProgressRef = useRef(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Secure session management using httpOnly cookies via API
  const saveCartIdToSession = React.useCallback(async (cartId: string): Promise<void> => {
    try {
      const response = await fetch(CART_SESSION_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
        },
        credentials: 'include', // Important: include cookies
        body: JSON.stringify({
          cartId,
          userId: sessionUserId
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save cart session: ${response.status}`);
      }

      const data = await response.json();
      console.log('[CART] Session saved securely', { cartId: cartId.substring(0, 8) + '...' });
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.warn('[CART] Session save skipped: Backend unreachable');
      } else {
        console.error('[CART] Failed to save session:', error);
      }
      // Don't throw - gracefully degrade but log the error
    }
  }, [sessionUserId]);

  // Guard to prevent concurrent silent clearing operations
  const silentClearInProgressRef = useRef(false);

  const getCartIdFromSession = React.useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(CART_SESSION_API, {
        method: 'GET',
        headers: {
          'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
        },
        credentials: 'include' // Important: include cookies
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // Security Enhancement: Detect if session needs rotation
      // Note: Actual rotation is handled separately to avoid circular dependencies
      if (data.requiresRotation && data.session?.cartId) {
        console.log('[CART] Session rotation recommended - will rotate in background');
        // Rotation will be triggered by the rotation check effect
      }

      if (data.session && data.session.cartId) {
        return data.session.cartId;
      }

      return null;
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.warn('[CART] Session retrieval skipped: Backend unreachable');
      } else {
        console.error('[CART] Failed to get session:', error);
      }
      return null;
    }
  }, []);

  const removeCartIdFromSession = React.useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(CART_SESSION_API, {
        method: 'DELETE',
        headers: {
          'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
        },
        credentials: 'include' // Important: include cookies
      });

      if (!response.ok) {
        console.error('[CART] Failed to clear session:', response.status);
      } else {
        console.log('[CART] Session cleared successfully');
      }
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.warn('[CART] Session clear skipped: Backend unreachable');
      } else {
        console.error('[CART] Failed to clear session:', error);
      }
    }
  }, []);

  /**
   * Security Enhancement: Rotate cart session
   * 
   * Addresses Security Audit Issue #9: Session Management Weaknesses
   * - Rotates session token for long-lived sessions
   * - Prevents session hijacking by limiting token lifetime
   * - Maintains cart continuity during rotation
   */
  const rotateCartSession = React.useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(CART_SESSION_API, {
        method: 'PUT',
        headers: {
          'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
        },
        credentials: 'include' // Important: include cookies
      });

      if (!response.ok) {
        console.error('[CART] Failed to rotate session:', response.status);
        return false;
      }

      const data = await response.json();
      console.log('[CART] Session rotated successfully', {
        rotationCount: data.rotationCount
      });

      return true;
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.warn('[CART] Session rotation skipped: Backend unreachable');
        return false;
      }
      console.error('[CART] Failed to rotate session:', error);
      return false;
    }
  }, []);

  // Price calculation and validation functions
  const recalculatePrices = React.useCallback((selectedShippingOptionId?: string): void => {
    if (!state.cart) {
      dispatch({ type: 'SET_CALCULATED_TOTALS', payload: null });
      dispatch({ type: 'SET_PRICE_VALIDATION', payload: null });
      return;
    }

    try {

      // Calculate totals using centralized service
      const calculatedTotals = PriceCalculationService.calculateCartTotals(
        state.cart,
        selectedShippingOptionId
      );

      // Validate price consistency
      const validation = PriceValidator.validatePriceConsistency(
        state.cart,
        calculatedTotals,
        { strictMode: false, toleranceAmount: 0.01 }
      );

      // Log validation warnings/errors
      if (validation.warnings.length > 0) {
      }
      if (validation.errors.length > 0) {
      }

      dispatch({ type: 'SET_CALCULATED_TOTALS', payload: calculatedTotals });
      dispatch({ type: 'SET_PRICE_VALIDATION', payload: validation });

    } catch (error) {
      dispatch({ type: 'SET_CALCULATED_TOTALS', payload: null });
      dispatch({
        type: 'SET_PRICE_VALIDATION', payload: {
          isValid: false,
          errors: [`Price calculation failed: ${error}`],
          warnings: []
        }
      });
    }
  }, [state.cart]);

  const formatCurrency = React.useCallback((amount: number, currency?: string): string => {
    const currencyCode = currency || state.cart?.currency_code || 'INR';
    return PriceCalculationService.formatCurrency(amount, currencyCode);
  }, [state.cart?.currency_code]);

  const getFormattedTotal = React.useCallback((): string => {
    if (!state.calculatedTotals) {
      return formatCurrency(0);
    }
    return formatCurrency(state.calculatedTotals.total, state.calculatedTotals.currency);
  }, [state.calculatedTotals, formatCurrency]);

  const getFormattedSubtotal = React.useCallback((): string => {
    if (!state.calculatedTotals) {
      return formatCurrency(0);
    }
    return formatCurrency(state.calculatedTotals.subtotal, state.calculatedTotals.currency);
  }, [state.calculatedTotals, formatCurrency]);

  const getFormattedShipping = React.useCallback((): string => {
    if (!state.calculatedTotals) {
      return 'Free';
    }
    return state.calculatedTotals.shipping > 0
      ? formatCurrency(state.calculatedTotals.shipping, state.calculatedTotals.currency)
      : 'Free';
  }, [state.calculatedTotals, formatCurrency]);

  const validatePrices = React.useCallback((): PriceConsistencyResult | null => {
    return state.priceValidation;
  }, [state.priceValidation]);

  // Recalculate prices whenever cart changes
  useEffect(() => {
    recalculatePrices();
  }, [state.cart, recalculatePrices]);

  // Create a new cart
  const createCart = React.useCallback(async (): Promise<void> => {
    // Lock removed - backend guard handles duplicate prevention
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'createCart', params: [] });

    try {
      const newCart = await medusaApiClient.createCart();

      dispatch({ type: 'SET_CART', payload: newCart });
      await saveCartIdToSession(newCart.id);
      setLastOperation(null); // Clear last operation on success

    } catch (error) {
      const errorMessage = handleApiError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error; // Re-throw so calling components can handle it
    }
  }, [handleApiError]);

  // Handle cart session expiration and recreation
  const handleCartExpiration = React.useCallback(async (): Promise<void> => {
    await removeCartIdFromSession();
    dispatch({ type: 'CLEAR_CART' });

    // Optionally create a new cart immediately
    // For now, we'll wait for the next add operation to create a new cart
  }, [removeCartIdFromSession]);

  // Load a specific cart by ID (for cross-device recovery)
  const loadSpecificCart = React.useCallback(async (cartId: string): Promise<void> => {
    // Lock removed - backend guard handles duplicate prevention
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const cart = await medusaApiClient.getCart(cartId);

      // If the cart is already completed, treat as expired
      if ((cart as any)?.completed_at) {
        dispatch({ type: 'SET_ERROR', payload: 'This cart has already been completed' });
        return;
      }

      // Update both state and storage
      dispatch({ type: 'SET_CART', payload: cart });
      await saveCartIdToSession(cart.id);
    } catch (error) {

      if (error instanceof ApiError && error.status === 404) {
        dispatch({ type: 'SET_ERROR', payload: 'Cart not found or has expired' });
      } else {
        const errorMessage = handleApiError(error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    }
  }, [handleApiError]);

  // Refresh cart from API with enhanced error handling
  const refreshCart = React.useCallback(async (): Promise<void> => {
    // Performance Enhancement: Prevent concurrent refresh calls
    if (refreshInProgressRef.current) {
      return;
    }

    const cartId = state.cartId || await getCartIdFromSession();

    if (!cartId) {
      return;
    }

    refreshInProgressRef.current = true;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'refreshCart', params: [] });

    try {
      const cart = await medusaApiClient.getCart(cartId);
      // If the cart is already completed, treat as expired and clear
      if ((cart as any)?.completed_at) {
        await handleCartExpiration();
        setLastOperation(null);
        return;
      }
      dispatch({ type: 'SET_CART', payload: cart });
      setLastOperation(null); // Clear last operation on success
    } catch (error) {

      // Handle cart expiration or not found (404)
      if (error instanceof ApiError && error.status === 404) {
        await handleCartExpiration();
        setLastOperation(null); // Clear operation since we handled expiration
      } else {
        const errorMessage = handleApiError(error);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [state.cartId, handleCartExpiration, handleApiError, getCartIdFromSession]);

  // Performance Enhancement: Debounced version of refreshCart for useEffect hooks
  // Addresses Security Audit Issue #11A: N+1 Query Problem
  const debouncedRefreshCart = React.useCallback(() => {
    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Schedule new refresh with 300ms debounce
    refreshTimeoutRef.current = setTimeout(() => {
      refreshCart();
    }, 300);
  }, [refreshCart]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Add item to cart with enhanced session management
  const addToCart = React.useCallback(async (variantId: string, quantity: number, estimatedUnitPrice?: number): Promise<void> => {
    console.log('[CartContext] addToCart called with:', { variantId, quantity, estimatedUnitPrice });

    // Lock removed - backend guard handles duplicate prevention
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'addToCart', params: [variantId, quantity] });

    try {
      // Validate quantity input (comprehensive validation)
      const quantityError = CartLimitService.validateQuantityInput(quantity);
      if (quantityError) {
        dispatch({ type: 'SET_ERROR', payload: quantityError });
        dispatch({ type: 'SET_LOADING', payload: false });
        setLastOperation(null);
        throw new Error(quantityError);
      }

      // Ensure we have a cart
      let currentCart = state.cart;
      let cartId = state.cartId || await getCartIdFromSession();

      // If we have a cart ID but no cart object, try to refresh first
      if (cartId && !currentCart) {
        try {
          currentCart = await medusaApiClient.getCart(cartId);
          if ((currentCart as any)?.completed_at) {
            await removeCartIdFromSession();
            dispatch({ type: 'CLEAR_CART' });
            currentCart = null as any;
            cartId = null;
          }
          if (currentCart) {
            dispatch({ type: 'SET_CART', payload: currentCart as MedusaCart });
          }
        } catch (refreshError) {
          await removeCartIdFromSession();
          currentCart = null;
          cartId = null;
        }
      }

      // If we still have a cart object but it's completed, discard it before creating a new one
      if (currentCart && (currentCart as any)?.completed_at) {
        await handleCartExpiration();
        currentCart = null as any;
        cartId = null;
      }

      // Create new cart if needed
      if (!currentCart) {
        console.log('[CartContext] Creating new cart...');
        try {
          currentCart = await medusaApiClient.createCart({}); // Pass empty object
          console.log('[CartContext] Cart created successfully:', currentCart.id);
          dispatch({ type: 'SET_CART', payload: currentCart });
          await saveCartIdToSession(currentCart.id);
        } catch (createError) {
          console.error('[CartContext] Cart creation failed:', createError);
          const errorMessage = handleApiError(createError);
          dispatch({ type: 'SET_ERROR', payload: errorMessage });
          throw createError;
        }
      }

      // Validate cart limits before adding (with estimated price for value check)
      // Use the estimatedUnitPrice passed from the caller (e.g., ProductDetailPage)
      // If not provided, validation will proceed without value check (fail open)

      const limitValidation = CartLimitService.validateAddToCart(
        currentCart,
        variantId,
        quantity,
        estimatedUnitPrice
      );

      if (!limitValidation.valid) {
        const errorMessage = limitValidation.errors.join(' ');
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        dispatch({ type: 'SET_LOADING', payload: false });
        setLastOperation(null);
        throw new Error(errorMessage);
      }

      // Show warnings if any (don't block the operation)
      if (limitValidation.warnings.length > 0) {
        // Log warnings for user awareness (could show as toast in future)
        console.warn('[CART] Cart limit warnings:', limitValidation.warnings);
      }

      console.log('[CartContext] Adding line item to cart:', {
        cartId: currentCart.id,
        variantId,
        quantity
      });

      const updatedCart = await medusaApiClient.addLineItem(currentCart.id, {
        variant_id: variantId,
        quantity,
      });

      console.log('[CartContext] Line item added successfully');
      dispatch({ type: 'SET_CART', payload: updatedCart });
      setLastOperation(null); // Clear last operation on success
    } catch (error) {
      const errorMessage = handleApiError(error);

      // Handle cart expiration during add operation
      if (error instanceof ApiError && error.status === 404) {
        await handleCartExpiration();
        setLastOperation(null); // Clear operation since we handled expiration
      } else {
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }

      throw error; // Re-throw so calling components can handle it
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.cart, state.cartId, handleApiError, handleCartExpiration, getCartIdFromSession, saveCartIdToSession, removeCartIdFromSession]);

  // Remove item from cart
  const removeFromCart = React.useCallback(async (lineItemId: string): Promise<void> => {
    // Lock removed - backend guard handles duplicate prevention
    if (!state.cart) {
      throw new Error('No cart available');
    }
    // Defensive: verify the line item exists before calling API to avoid undefined states
    const exists = state.cart.items?.some((it) => it.id === lineItemId);
    if (!exists) {
      return;
    }

    const cartId = state.cart.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'removeFromCart', params: [lineItemId] });

    try {
      const updatedCart = await medusaApiClient.removeLineItem(cartId, lineItemId);

      // Normalize: only clear the cart if the backend explicitly indicates the cart no longer exists (missing id AND no items array).
      // Otherwise, if the response is missing id but has items, keep local cart state filtered as a fallback to avoid nuking other items.
      if (!updatedCart || (!updatedCart.id && (updatedCart as any)?.items == null)) {
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
    } catch (error) {
      const errorMessage = handleApiError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  }, [state.cart, handleApiError]);

  // Update item quantity in cart
  const updateQuantity = React.useCallback(async (lineItemId: string, quantity: number): Promise<void> => {
    // Lock removed - backend guard handles duplicate prevention
    if (!state.cart) {
      throw new Error('No cart available');
    }

    // Find the cart item to get variant information
    const cartItem = state.cart.items?.find((item) => item.id === lineItemId);
    if (!cartItem) {
      throw new Error('Item not found in cart');
    }

    // If quantity is 0 or negative, remove the item
    if (quantity <= 0) {
      // Ensure the id exists before attempting removal
      const exists = state.cart.items?.some((it) => it.id === lineItemId);
      if (exists) {
        await removeFromCart(lineItemId);
      }
      return;
    }

    const cartId = state.cart.id;
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    setLastOperation({ type: 'updateQuantity', params: [lineItemId, quantity] });

    try {
      // Validate cart limits before updating quantity
      const limitValidation = CartLimitService.validateUpdateQuantity(
        state.cart,
        lineItemId,
        quantity
      );

      if (!limitValidation.valid) {
        const errorMessage = limitValidation.errors.join(' ');
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        dispatch({ type: 'SET_LOADING', payload: false });
        setLastOperation(null);
        return; // Don't proceed with update
      }

      // Validate inventory before updating
      const validation = await InventoryValidationService.validateCartItemUpdate(
        cartItem.variant_id,
        cartItem.quantity,
        quantity,
        cartItem.variant?.product?.id
      );

      if (!validation.valid) {
        // Show validation error to user
        const errorMessage = validation.error || 'Cannot update quantity';
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
        dispatch({ type: 'SET_LOADING', payload: false });
        setLastOperation(null);
        return; // Don't proceed with update
      }

      // Proceed with update if validation passes
      const updatedCart = await medusaApiClient.updateLineItem(cartId, lineItemId, {
        quantity,
      });

      dispatch({ type: 'SET_CART', payload: updatedCart });
      setLastOperation(null); // Clear last operation on success
    } catch (error) {
      const errorMessage = handleApiError(error);
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  }, [state.cart, removeFromCart, handleApiError]);

  // Clear cart (reset state and remove from session)
  const clearCart = React.useCallback(async (): Promise<void> => {
    // Do not force route changes here. Just clear state and id.
    dispatch({ type: 'CLEAR_CART' });
    await removeCartIdFromSession();
    setLastOperation(null);
    clearErrorHandler();
  }, [clearErrorHandler, removeCartIdFromSession]);

  // Clear cart silently: reset state and session without touching loading/error
  const clearCartSilently = React.useCallback(async (): Promise<void> => {
    if (silentClearInProgressRef.current) {
      return;
    }
    silentClearInProgressRef.current = true;
    try {
      dispatch({ type: 'CLEAR_CART_SILENTLY' });
      await removeCartIdFromSession();
    } catch (error) {
      // Graceful degradation: log and attempt a best-effort non-silent clear without surfacing UI states
      try {
        dispatch({ type: 'CLEAR_CART' });
        await removeCartIdFromSession();
      } catch { }
    } finally {
      silentClearInProgressRef.current = false;
    }
  }, [removeCartIdFromSession]);

  // Clear error state
  const clearError = React.useCallback((): void => {
    dispatch({ type: 'SET_ERROR', payload: null });
    clearErrorHandler();
  }, [clearErrorHandler]);

  // Retry the last failed operation
  const retryLastOperation = React.useCallback(async (): Promise<void> => {
    if (!lastOperation) {
      return;
    }


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
      }
    } catch (error) {
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

  // Validate cart session integrity and return cart data
  // Performance Enhancement: Return cart data to avoid redundant fetch
  const validateCartSession = React.useCallback(async (cartId: string): Promise<{ valid: boolean; cart?: MedusaCart }> => {
    try {
      const cart = await medusaApiClient.getCart(cartId);
      if ((cart as any)?.completed_at) {
        return { valid: false };
      }
      return { valid: true, cart };
    } catch (error) {
      return { valid: false };
    }
  }, []);

  // Initialize cart on mount and handle session management
  useEffect(() => {
    const initializeCart = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        // Lock removed - immediate cart recovery after order completion
        const savedCartId = await getCartIdFromSession();

        // On order-confirmation page, do not recover cart to avoid interference
        const path = typeof window !== 'undefined' ? window.location.pathname : ''
        if (path && path.startsWith('/order-confirmation')) {
          return
        }

        if (savedCartId) {
          // Performance Enhancement: Validate and load cart in single API call
          // Previously: validateCartSession fetched cart, then refreshCart fetched again (N+1 problem)
          const validation = await validateCartSession(savedCartId);
          if (validation.valid && validation.cart) {
            dispatch({ type: 'SET_CART_ID', payload: savedCartId });
            dispatch({ type: 'SET_CART', payload: validation.cart });
          } else {
            await removeCartIdFromSession();
            dispatch({ type: 'CLEAR_CART' });
          }
        } else {
          console.log('[CART] No saved cart session found');
        }
      } catch (error) {
        console.error('[CART] Initialization failed:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Note: refreshCart is intentionally not in deps - initialization should only run once on mount
    // to prevent N+1 query problem. The function is stable enough for this use case.
  }, [getCartIdFromSession, removeCartIdFromSession, validateCartSession]);

  // Protection lock removed - browser back/forward handler no longer needed

  // Cross-tab synchronization is now handled automatically via httpOnly cookies
  // No need for localStorage events as the server manages the session

  // Handle browser session end - cleanup on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Note: localStorage persists across browser sessions
      // This is just for logging purposes and any final cleanup if needed
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Handle page visibility changes to refresh cart when user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && state.cartId) {
        // Do not auto-refresh on order confirmation page to avoid flicker/redirects
        const path = typeof window !== 'undefined' ? window.location.pathname : ''
        if (path && path.startsWith('/order-confirmation')) return
        // Use debounced refresh to prevent rapid visibility changes from causing multiple API calls
        debouncedRefreshCart();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.cartId, debouncedRefreshCart]);

  // Handle network connectivity changes to ensure cart persistence
  useEffect(() => {
    const handleOnline = () => {
      // If we have a cart ID but no cart data, try to refresh
      // Use debounced refresh to prevent rapid network flickers from causing multiple API calls
      if (state.cartId && !state.cart) {
        debouncedRefreshCart();
      }
    };

    const handleOffline = () => {
      // Note: Cart operations will fail gracefully and can be retried when online
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [state.cartId, state.cart, debouncedRefreshCart]);

  // Security Enhancement: Periodic session rotation check
  // Addresses Issue #9: Session Management Weaknesses
  useEffect(() => {
    if (!state.cartId) {
      return;
    }

    // Check for session rotation requirement every 30 minutes
    const rotationCheckInterval = setInterval(async () => {
      try {
        const response = await fetch(CART_SESSION_API, {
          method: 'GET',
          headers: {
            'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ''
          },
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.requiresRotation) {
            console.log('[CART] Session rotation required - rotating now');
            await rotateCartSession();
          }
        }
      } catch (error) {
        console.error('[CART] Rotation check failed:', error);
      }
    }, 30 * 60 * 1000); // Check every 30 minutes

    return () => clearInterval(rotationCheckInterval);
  }, [state.cartId, rotateCartSession]);

  // Periodic cart session validation to ensure persistence
  useEffect(() => {
    if (!state.cartId || !state.cart) {
      return;
    }

    // Validate cart session every 5 minutes to ensure it's still active
    const validationInterval = setInterval(async () => {

      try {
        await medusaApiClient.getCart(state.cartId!);
      } catch (error) {
        await handleCartExpiration();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearInterval(validationInterval);
    };
  }, [state.cartId, state.cart, handleCartExpiration]);

  // Context value
  const contextValue: CartContextType = React.useMemo(() => ({
    cart: state.cart,
    loading: state.loading,
    error: state.error || errorState.error,
    calculatedTotals: state.calculatedTotals,
    priceValidation: state.priceValidation,
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
    // Price calculation methods
    formatCurrency,
    getFormattedTotal,
    getFormattedSubtotal,
    getFormattedShipping,
    validatePrices,
    recalculatePrices,
  }), [
    state.cart,
    state.loading,
    state.error,
    state.calculatedTotals,
    state.priceValidation,
    errorState.error,
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
    errorState.isRetryable,
    lastOperation,
    isRetryableError,
    errorState.originalError,
    formatCurrency,
    getFormattedTotal,
    getFormattedSubtotal,
    getFormattedShipping,
    validatePrices,
    recalculatePrices
  ]);

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
