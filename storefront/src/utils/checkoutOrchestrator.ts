import { medusaApiClient, MedusaApiClient, UpdateCartPayload, CompleteCartResponse, OrderMinimal, ShippingOption, ApiError } from './medusaApiClient'

export type ShippingSelectionStrategy = 'cheapest'

export interface CheckoutInput {
  cartId: string
  cartUpdate: UpdateCartPayload
  strategy?: ShippingSelectionStrategy
  useManualPayment?: boolean
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

export async function processCheckout(input: CheckoutInput, client: MedusaApiClient = medusaApiClient): Promise<CheckoutResult> {
  const logs: CheckoutProgressLog[] = []
  const { cartId, cartUpdate } = input
  const strategy: ShippingSelectionStrategy = input.strategy ?? 'cheapest'
  const useManual = input.useManualPayment ?? true
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
    // 1) Update cart with email and shipping/billing addresses
    currentStep = 'update-cart'
    console.log('[CheckoutOrchestrator] Updating cart with address/email', { cartId })
    const updatedCart = await client.updateCart(cartId, cartUpdate)
    logs.push({ step: 'update-cart', details: { cartId: updatedCart.id } })

    // 2) Fetch shipping options and select one
    currentStep = 'fetch-shipping-options'
    console.log('[CheckoutOrchestrator] Fetching shipping options', { cartId })
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
      const cheapest = strategy === 'cheapest' ? selectCheapestOption(opts) : opts[0]
      if (!cheapest) continue
      console.log('[CheckoutOrchestrator] Adding shipping method', { cartId, profileId, optionId: cheapest.id })
      await client.addShippingMethod(cartId, cheapest.id)
      added.push({ profile: profileId, optionId: cheapest.id })
    }
    logs.push({ step: 'add-shipping-method', details: { added } })

    // Validate coverage by comparing required item profiles vs added methods
    const cartAfterShipping = await client.getCart(cartId)
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
      const remainingOptions = await client.getShippingOptionsForCart(cartId)
      for (const target of missingProfiles) {
        const candidates = remainingOptions.filter((o: any) => String((o as any).shipping_profile_id || (o as any).profile_id) === String(target))
        const pick = selectCheapestOption(candidates as any)
        if (pick) {
          console.log('[CheckoutOrchestrator] Adding missing shipping method for item profile', { cartId, profileId: target, optionId: pick.id })
          await client.addShippingMethod(cartId, pick.id)
          added.push({ profile: target, optionId: pick.id })
        }
      }
      logs.push({ step: 'add-shipping-method', details: { reconciledMissingProfiles: missingProfiles, added } })
    }

    // 3) Initialize and select payment session (manual)
    currentStep = 'create-payment-sessions'
    console.log('[CheckoutOrchestrator] Creating payment sessions', { cartId, ts: new Date().toISOString() })
    const cartWithSessions = await client.createPaymentSessions(cartId)
    logs.push({ step: 'create-payment-sessions', details: { sessions: cartWithSessions.payment_sessions?.length ?? 0 } })

    if (useManual) {
      currentStep = 'select-payment-session'
      const providerId = MedusaApiClient.MANUAL_PAYMENT_PROVIDER_ID
      console.log('[CheckoutOrchestrator] Selecting payment session', { cartId, providerId, ts: new Date().toISOString() })
      const cartWithSelected = await client.selectPaymentSession(cartId, providerId)
      logs.push({ step: 'select-payment-session', details: { providerId, selected: true } })
    }

    // 4) Complete the cart
    currentStep = 'complete-cart'
    console.log('[CheckoutOrchestrator] Completing cart', { cartId, ts: new Date().toISOString() })
    const completion: CompleteCartResponse = await client.completeCart(cartId)
    logs.push({ step: 'complete-cart', details: { type: completion.type } })

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

    return { success: true, order, cartId, logs }
  } catch (err: any) {
    let message = err?.message || 'Unknown error during checkout'
    let step = currentStep || logs[logs.length - 1]?.step || 'unknown'

    // Error normalization for common cases
    if (err instanceof ApiError) {
      if (err.status === 404) {
        step = 'cart-expired'
        message = 'Your cart has expired or was not found. Please start checkout again.'
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


