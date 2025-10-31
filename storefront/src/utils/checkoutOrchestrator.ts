import { medusaApiClient, MedusaApiClient, UpdateCartPayload, CompleteCartResponse, OrderMinimal, ShippingOption, ApiError } from './medusaApiClient'
import { PriceValidationService } from '../services/PriceValidationService'

export type ShippingSelectionStrategy = 'cheapest'

export interface CheckoutInput {
  cartId: string
  cartUpdate: UpdateCartPayload
  strategy?: ShippingSelectionStrategy
  useManualPayment?: boolean
  /** Explicit shipping amount selected by the user (INR as stored in backend). If provided, we will try to match shipping options by this amount. */
  selectedShippingAmount?: number
  /** UI-selected key used to identify option by name when amounts differ by currency factor (e.g., paise vs rupees). */
  selectedShippingKey?: 'standard' | 'expedited' | 'express'
  /** Exact shipping option ids chosen by the user (supports multi-profile carts). These take precedence when present. */
  selectedOptionIds?: string[]
  // NEW: Customer sync data
  customerId?: string
  checkoutFormData?: {
    first_name: string
    last_name: string
    phone: string
    address: {
      address_1: string
      city: string
      postal_code: string
      province: string
      country_code: string
      phone?: string
    }
  }
  // Authentication method used during checkout
  identityMethod?: 'phone' | 'email'
}

export interface CheckoutProgressLog {
  step: string
  details?: Record<string, any>
}

export interface CheckoutResult {
  success: boolean
  order?: OrderMinimal
  cartId: string
  logs: CheckoutProgressLog[]
  error?: {
    step: string
    message: string
  }
}

function selectCheapestOption(options: ShippingOption[]): ShippingOption | null {
  if (!options || options.length === 0) return null
  return options.slice().sort((a, b) => Number(a.amount ?? 0) - Number(b.amount ?? 0))[0]
}

function groupOptionsByProfile(options: ShippingOption[]): Map<string, ShippingOption[]> {
  const map = new Map<string, ShippingOption[]>()
  for (const opt of options) {
    // Some backends may omit profile_id; treat as a single default bucket
    const key = opt.profile_id || 'default'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(opt)
  }
  return map
}

function normalizeName(value: string | undefined): string {
  return String(value || '').toLowerCase()
}

function matchesKeyByName(option: ShippingOption, key?: 'standard' | 'expedited' | 'express'): boolean {
  if (!key) return false
  const name = normalizeName(option.name)
  if (!name) return false
  const aliases: Record<string, string[]> = {
    standard: ['standard', 'regular', 'economy', 'free', 'ground'],
    expedited: ['expedited', 'priority', 'fast'],
    express: ['express', 'overnight', 'one-day', '1-2', 'same day', 'same-day'],
  }
  return aliases[key].some((kw) => name.includes(kw))
}

function matchesByAmount(option: ShippingOption, targetAmount?: number): boolean {
  if (typeof targetAmount !== 'number') return false
  const amt = Number((option as any).amount ?? 0)
  if (amt === targetAmount) return true
  // Handle currency factor mismatch (e.g., paise vs rupees)
  if (amt === targetAmount * 100) return true
  if (amt * 100 === targetAmount) return true
  return false
}

/**
 * Helper function to retry an async operation with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number
    baseDelay: number
    operationName: string
  }
): Promise<T> {
  const { maxRetries, baseDelay, operationName } = options
  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`[CHECKOUT][${operationName}][retry]`, {
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: error?.message || String(error)
        })
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

export async function processCheckout(input: CheckoutInput, client: MedusaApiClient = medusaApiClient): Promise<CheckoutResult> {
  const logs: CheckoutProgressLog[] = []
  const { cartId, cartUpdate } = input
  const strategy: ShippingSelectionStrategy = input.strategy ?? 'cheapest'
  const useManual = input.useManualPayment ?? true
  const targetAmount = typeof input.selectedShippingAmount === 'number' ? Number(input.selectedShippingAmount) : undefined
  const selectedKey = input.selectedShippingKey
  const selectedIds = new Set<string>((input.selectedOptionIds || []).filter(Boolean))
  let currentStep = 'initialize'

  if (!cartId) {
    return {
      success: false,
      cartId: '',
      logs,
      error: { step: 'validate', message: 'Missing cart id' },
    }
  }

  try {
    // GATE 1: Validate customer ID is provided (BLOCKING)
    if (!input.customerId) {
      currentStep = 'validate-customer'
      const errorMessage = 'Customer ID is required for checkout. Please complete authentication first.'
      console.error('[CHECKOUT][GATE_1_FAILED]', { cartId, reason: 'no_customer_id' })
      return {
        success: false,
        cartId,
        logs,
        error: { step: 'validate-customer', message: errorMessage },
      }
    }
    
    logs.push({ step: 'validate-customer', details: { customerId: input.customerId, passed: true } })
    console.log('[CHECKOUT][GATE_1_PASSED]', { cartId, customerId: input.customerId })

    // 1) Update cart with email and shipping/billing addresses
    currentStep = 'update-cart'
    const updatedCart = await client.updateCart(cartId, cartUpdate)
    try { console.log('[CHECKOUT][update-cart]', { cartId, email: (cartUpdate as any)?.email, shipping_first_name: (cartUpdate as any)?.shipping_address?.first_name }) } catch {}
    logs.push({ step: 'update-cart', details: { 
      cartId: updatedCart.id,
      customerId: input.customerId
    } })
    
    // GATE 2: Associate customer with cart (BLOCKING with retries)
    currentStep = 'associate-customer'
    console.log('[CHECKOUT][GATE_2_START]', { cartId, customerId: input.customerId })
    
    try {
      await retryWithBackoff(
        async () => {
          const response = await fetch('/api/checkout/customer/associate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartId, customerId: input.customerId }),
          })
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'unknown' }))
            throw new Error(`Association failed: ${errorData.error || response.statusText}`)
          }
          
          const data = await response.json()
          // CRITICAL FIX: Check if response indicates fallback (which means actual failure)
          if (data.fallback === true) {
            throw new Error(`Association not completed: ${data.adminError || 'Backend association failed'}`)
          }
          
          return data
        },
        {
          maxRetries: 3,
          baseDelay: 500,
          operationName: 'associate-customer'
        }
      )
      
      console.log('[CHECKOUT][GATE_2_PASSED]', { cartId, customerId: input.customerId })
      logs.push({ step: 'associate-customer', details: { customerId: input.customerId, success: true, blocking: true } })
    } catch (error: any) {
      const errorMessage = `Failed to link customer to cart after multiple attempts: ${error?.message || String(error)}`
      console.error('[CHECKOUT][GATE_2_FAILED]', { 
        cartId, 
        customerId: input.customerId, 
        error: error?.message || String(error)
      })
      
      // BLOCKING ERROR - Stop checkout process
      return {
        success: false,
        cartId,
        logs,
        error: { 
          step: 'associate-customer', 
          message: errorMessage
        },
      }
    }
    
    // GATE 3: Verify customer association succeeded (BLOCKING)
    currentStep = 'verify-association'
    console.log('[CHECKOUT][GATE_3_START]', { cartId, expectedCustomerId: input.customerId })
    
    try {
      const cartAfterAssociation = await client.getCart(cartId)
      const actualCustomerId = (cartAfterAssociation as any).customer_id
      
      if (actualCustomerId !== input.customerId) {
        const errorMessage = `Cart customer verification failed. Expected: ${input.customerId}, Got: ${actualCustomerId || 'null'}`
        console.error('[CHECKOUT][GATE_3_FAILED]', { 
          cartId, 
          expectedCustomerId: input.customerId,
          actualCustomerId: actualCustomerId || 'null'
        })
        
        return {
          success: false,
          cartId,
          logs,
          error: { step: 'verify-association', message: errorMessage },
        }
      }
      
      console.log('[CHECKOUT][GATE_3_PASSED]', { cartId, customerId: actualCustomerId })
      logs.push({ step: 'verify-association', details: { 
        customerId: actualCustomerId, 
        verified: true 
      } })
    } catch (error: any) {
      const errorMessage = `Failed to verify cart customer association: ${error?.message || String(error)}`
      console.error('[CHECKOUT][GATE_3_FAILED]', { 
        cartId, 
        error: error?.message || String(error)
      })
      
      return {
        success: false,
        cartId,
        logs,
        error: { step: 'verify-association', message: errorMessage },
      }
    }

    // 2) Fetch shipping options and select one (per profile)
    currentStep = 'fetch-shipping-options'
    
    const options = await client.getShippingOptionsForCart(cartId)
    logs.push({ step: 'fetch-shipping-options', details: { count: options.length } })

    // v2 requirement: add one shipping method per shipping profile in the cart
    const grouped = groupOptionsByProfile(options)
    if (grouped.size === 0) {
      return {
        success: false,
        cartId,
        logs,
        error: { step: 'select-shipping', message: 'No eligible shipping options found' },
      }
    }

    currentStep = 'add-shipping-method'
    const added: Array<{ profile: string; optionId: string }> = []
    for (const [profileId, opts] of grouped.entries()) {
      let chosen = null as ShippingOption | null

      // Highest priority: exact id match provided by UI
      if (!chosen && selectedIds.size > 0) {
        chosen = opts.find((o) => selectedIds.has(o.id)) || null
      }

      // Prefer explicit match by name key
      if (!chosen && selectedKey) {
        chosen = opts.find((o) => matchesKeyByName(o, selectedKey)) || null
      }

      // Next: match by amount with currency factor tolerance
      if (!chosen && typeof targetAmount === 'number') {
        chosen = opts.find((o) => matchesByAmount(o, targetAmount)) || null
      }

      // Fallback: strategy
      if (!chosen) {
        chosen = strategy === 'cheapest' ? selectCheapestOption(opts) : opts[0]
      }

      if (!chosen) continue
      
      await client.addShippingMethod(cartId, chosen.id)
      added.push({ profile: profileId, optionId: chosen.id })
    }
    logs.push({ step: 'add-shipping-method', details: { added } })

    // Validate coverage by comparing required item profiles vs added methods.
    // Fetch updated cart and a fresh options list in parallel to reduce round trips.
    const [cartAfterShipping, remainingOptions] = await Promise.all([
      client.getCart(cartId),
      client.getShippingOptionsForCart(cartId),
    ])
    const itemProfiles = new Set<string>()
    ;(cartAfterShipping.items as any[])?.forEach((it: any) => {
      const pid = it?.variant?.product?.shipping_profile_id || it?.variant?.product?.profile_id
      if (pid) itemProfiles.add(String(pid))
    })
    const hasMethods = Array.isArray((cartAfterShipping as any).shipping_methods) ? (cartAfterShipping as any).shipping_methods : []
    const methodProfiles = new Set<string>()
    hasMethods.forEach((sm: any) => {
      const pid = sm?.shipping_profile_id || sm?.profile_id || sm?.shipping_option?.shipping_profile_id
      if (pid) methodProfiles.add(String(pid))
    })

    const missingProfiles: string[] = []
    itemProfiles.forEach((pid) => { if (!methodProfiles.has(pid)) missingProfiles.push(pid) })

    if (missingProfiles.length > 0) {
      for (const target of missingProfiles) {
        const candidates = remainingOptions.filter((o: any) => String((o as any).shipping_profile_id || (o as any).profile_id) === String(target))
        const pick = selectCheapestOption(candidates as any)
        if (pick) {
          
          await client.addShippingMethod(cartId, pick.id)
          added.push({ profile: target, optionId: pick.id })
        }
      }
      logs.push({ step: 'add-shipping-method', details: { reconciledMissingProfiles: missingProfiles, added } })
    }

    // 3) Initialize and select payment session (manual)
    currentStep = 'create-payment-sessions'
    
    const cartWithSessions = await client.createPaymentSessions(cartId)
    logs.push({ step: 'create-payment-sessions', details: { sessions: cartWithSessions.payment_sessions?.length ?? 0 } })

    if (useManual) {
      currentStep = 'select-payment-session'
      const providerId = MedusaApiClient.MANUAL_PAYMENT_PROVIDER_ID
      
      const cartWithSelected = await client.selectPaymentSession(cartId, providerId)
      logs.push({ step: 'select-payment-session', details: { providerId, selected: true } })
    }

    // GATE 4: Validate prices before completing cart (BLOCKING)
    currentStep = 'validate-pricing'
    console.log('[CHECKOUT][GATE_4_START]', { cartId })
    
    try {
      // Fetch fresh cart to get accurate totals with shipping methods applied
      const cartForValidation = await client.getCart(cartId)
      
      // Calculate server-side prices (source of truth)
      const serverPrices = PriceValidationService.calculateServerPrices(
        cartForValidation,
        selectedIds.size > 0 ? Array.from(selectedIds)[0] : undefined
      )
      
      // If client provided explicit amounts, validate them
      if (targetAmount !== undefined) {
        const shippingDiff = Math.abs(serverPrices.shipping - targetAmount)
        
        if (shippingDiff > 0.01) {
          console.error('[CHECKOUT][GATE_4_FAILED][PRICE_MISMATCH]', {
            cartId,
            serverShipping: serverPrices.shipping,
            clientShipping: targetAmount,
            difference: shippingDiff,
            severity: shippingDiff > 1 ? 'high' : 'medium'
          })
          
          // Log as potential fraud attempt
          logs.push({
            step: 'price-validation-failed',
            details: {
              field: 'shipping',
              serverValue: serverPrices.shipping,
              clientValue: targetAmount,
              difference: shippingDiff
            }
          })
          
          return {
            success: false,
            cartId,
            logs,
            error: {
              step: 'validate-pricing',
              message: 'Price validation failed. Shipping amount mismatch detected. Please refresh and try again.'
            }
          }
        }
      }
      
      console.log('[CHECKOUT][GATE_4_PASSED]', {
        cartId,
        serverTotal: serverPrices.total,
        serverShipping: serverPrices.shipping
      })
      
      logs.push({
        step: 'validate-pricing',
        details: {
          valid: true,
          serverPrices: {
            subtotal: serverPrices.subtotal,
            shipping: serverPrices.shipping,
            tax: serverPrices.tax,
            total: serverPrices.total
          }
        }
      })
      
    } catch (validationError: any) {
      console.error('[CHECKOUT][GATE_4_FAILED][EXCEPTION]', {
        cartId,
        error: validationError?.message || String(validationError)
      })
      
      // BLOCKING ERROR - Price validation is critical for security
      return {
        success: false,
        cartId,
        logs,
        error: {
          step: 'validate-pricing',
          message: `Price validation failed: ${validationError?.message || 'Unknown error'}. Please refresh and try again.`
        }
      }
    }

    // GATE 5: Complete the cart (customer already verified and linked)
    currentStep = 'complete-cart'
    console.log('[CHECKOUT][GATE_5_START]', { cartId, customerId: input.customerId })
    
    const completion: CompleteCartResponse = await client.completeCart(cartId)
    console.log('[CHECKOUT][GATE_5_COMPLETED]', { 
      cartId, 
      hasOrder: Boolean((completion as any)?.order), 
      orderId: (completion as any)?.order?.id
    })
    logs.push({ step: 'complete-cart', details: { type: completion.type, customerLinked: true } })

    if (!completion.order) {
      return {
        success: false,
        cartId,
        logs,
        error: { step: 'complete-cart', message: 'Cart completion did not return an order' },
      }
    }

    const order = completion.order
    logs.push({ step: 'order-ready', details: { orderId: order.id, display_id: order.display_id } })

    // NEW: Customer profile sync after successful order creation
    if (order && input.customerId && input.checkoutFormData) {
      try {
        
        
        // Enhanced sync with timeout and retry logic
        const syncController = new AbortController()
        const syncTimeout = setTimeout(() => syncController.abort(), 10000) // 10 second timeout
        
        const syncResult = await fetch('/api/checkout/customer/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: input.customerId,
            cartId: input.cartId,
            orderId: order.id,
            formData: input.checkoutFormData,
            orderCreated: true,
            whatsapp_authenticated: input.identityMethod === 'phone', // Only WhatsApp/phone authentication
            email_authenticated: input.identityMethod === 'email', // Email authentication flag
            identityMethod: input.identityMethod || 'phone', // Pass the actual authentication method
          }),
          signal: syncController.signal
        })
        
        clearTimeout(syncTimeout)
        try { console.log('[CHECKOUT][sync][status]', { status: syncResult.status }) } catch {}
        
        const syncResponse = await syncResult.text()
        let parsedResponse = null
        
        try {
          parsedResponse = JSON.parse(syncResponse)
        } catch {
          parsedResponse = { error: 'invalid_response', rawResponse: syncResponse }
        }
        
        
        
        if (syncResult.ok && parsedResponse?.ok) {
          logs.push({ 
            step: 'customer-profile-sync', 
            details: { 
              customerId: input.customerId, 
              success: true,
              attempts: parsedResponse.attempts || 1
            } 
          })
          try { console.log('[CHECKOUT][sync][ok]', { customerId: input.customerId, attempts: parsedResponse.attempts || 1 }) } catch {}
        } else {
          // Enhanced error categorization
          const errorType = parsedResponse?.error || 'unknown_error'
          const errorMessage = parsedResponse?.message || syncResponse || 'Unknown sync error'
          
          
          
          logs.push({ 
            step: 'customer-profile-sync-failed', 
            details: { 
              customerId: input.customerId,
              status: syncResult.status,
              errorType,
              errorMessage,
              recoverable: errorType !== 'customer_not_found' && errorType !== 'invalid_request'
            } 
          })
          try { console.log('[CHECKOUT][sync][fail]', { customerId: input.customerId, status: syncResult.status, errorType, errorMessage }) } catch {}
        }
        
      } catch (error: any) {
        // Handle network errors, timeouts, etc.
        const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout')
        const errorType = isTimeout ? 'network_timeout' : 'network_error'
        
        
        
        logs.push({ 
          step: 'customer-profile-sync-error', 
          details: { 
            customerId: input.customerId,
            errorType,
            errorMessage: error.message || String(error),
            recoverable: true // Network errors are generally recoverable
          } 
        })
        
        
      }
    } else {
      // Log why sync was skipped
      const skipReason = !order ? 'no_order' : 
                        !input.customerId ? 'no_customer_id' : 
                        !input.checkoutFormData ? 'no_form_data' : 'unknown'
      
      
      
      logs.push({ 
        step: 'customer-profile-sync-skipped', 
        details: { reason: skipReason } 
      })
    }

    return { success: true, order, cartId, logs }
  } catch (err: any) {
    let message = err?.message || 'Unknown error during checkout'
    let step = currentStep || logs[logs.length - 1]?.step || 'unknown'

    // Error normalization for common cases
    if (err instanceof ApiError) {
      if (err.status === 404) {
        step = 'cart-expired'
        message = 'Your cart has expired or was not found. Please start checkout again.'
      } else if (err.status === 400 && /already completed/i.test(err.message || '')) {
        step = 'cart-completed'
        message = 'This cart was already completed. We will clear it so you can try again.'
      } else if (err.type === 'network') {
        message = 'Network issue prevented checkout. Check your connection and try again.'
      } else if (err.type === 'timeout') {
        message = 'The request timed out. Please try again.'
      } else if (step === 'select-payment-session') {
        message = 'Failed to select payment. Please retry.'
      } else if (step === 'create-payment-sessions') {
        message = 'Failed to initialize payment. Please retry.'
      }
    }
    return {
      success: false,
      cartId,
      logs,
      error: { step, message },
    }
  }
}


