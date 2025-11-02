import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"

interface CompleteOrderWithCustomerInput {
  cart_id: string
  customer_id: string
  customer_data?: {
    first_name: string
    last_name: string
    phone: string
    email?: string
    addresses?: any[]
  }
}

interface CompleteOrderWithCustomerOutput {
  order: any
  customer: any
}

/**
 * STEP 1: Validate Customer Exists
 * Ensures the customer account exists before proceeding
 */
const validateCustomerStep = createStep(
  "validate-customer-exists",
  async ({ customer_id }: { customer_id: string }, { container }) => {
    console.log('[WORKFLOW][validate-customer][start]', { customer_id })
    
    const customerModuleService = container.resolve(Modules.CUSTOMER)
    
    try {
      const [customer] = await customerModuleService.listCustomers(
        { id: customer_id },
        { take: 1 }
      )
      
      if (!customer) {
        throw new Error(`Customer with ID ${customer_id} not found`)
      }
      
      console.log('[WORKFLOW][validate-customer][success]', { 
        customer_id, 
        has_account: customer.has_account 
      })
      
      return new StepResponse({ customer })
    } catch (error: any) {
      console.error('[WORKFLOW][validate-customer][error]', { 
        customer_id, 
        error: error?.message || String(error) 
      })
      throw error
    }
  },
  async (stepData, { container }) => {
    // Compensation: No rollback needed for read-only operation
    console.log('[WORKFLOW][validate-customer][compensation] No action needed')
  }
)

/**
 * STEP 2: Link Customer to Cart
 * Associates customer_id with cart before completion
 */
const linkCustomerToCartStep = createStep(
  "link-customer-to-cart",
  async ({ cart_id, customer_id }: { cart_id: string; customer_id: string }, { container }) => {
    console.log('[WORKFLOW][link-cart][start]', { cart_id, customer_id })
    
    const cartModuleService = container.resolve(Modules.CART)
    
    try {
      // First, verify cart exists
      const [existingCart] = await cartModuleService.listCarts(
        { id: cart_id },
        { take: 1 }
      )
      
      if (!existingCart) {
        throw new Error(`Cart with ID ${cart_id} not found`)
      }
      
      // IDEMPOTENCY: If cart already completed with correct customer, skip update
      if (existingCart.completed_at) {
        if (existingCart.customer_id === customer_id) {
          console.log('[WORKFLOW][link-cart][already_linked]', { 
            cart_id, 
            customer_id,
            completed_at: existingCart.completed_at,
            message: 'Cart already completed with correct customer'
          })
          
          return new StepResponse(
            { cart_id, customer_id, linked: true, idempotent: true },
            { originalCustomerId: customer_id, idempotent: true }
          )
        } else {
          throw new Error(`Cart ${cart_id} already completed with different customer ${existingCart.customer_id}`)
        }
      }
      
      // Store original customer_id for compensation
      const originalCustomerId = existingCart.customer_id
      
      // Link customer to cart
      await cartModuleService.updateCarts([{ 
        id: cart_id, 
        customer_id: customer_id 
      }])
      
      console.log('[WORKFLOW][link-cart][success]', { 
        cart_id, 
        customer_id,
        previous_customer_id: originalCustomerId 
      })
      
      return new StepResponse(
        { cart_id, customer_id, linked: true },
        { originalCustomerId } // Store for compensation
      )
    } catch (error: any) {
      console.error('[WORKFLOW][link-cart][error]', { 
        cart_id, 
        customer_id,
        error: error?.message || String(error) 
      })
      throw error
    }
  },
  async ({ originalCustomerId, idempotent }, { container }) => {
    // Compensation: Restore original customer_id on rollback
    console.log('[WORKFLOW][link-cart][compensation][start]', { originalCustomerId, idempotent })
    
    // Skip compensation if this was an idempotent operation
    if (idempotent) {
      console.log('[WORKFLOW][link-cart][compensation] Skipped - idempotent operation')
      return
    }
    
    if (!originalCustomerId) {
      console.log('[WORKFLOW][link-cart][compensation] No original customer to restore')
      return
    }
    
    try {
      const cartModuleService = container.resolve(Modules.CART)
      const cart_id = (arguments[0] as any)?.cart_id
      
      if (cart_id) {
        await cartModuleService.updateCarts([{ 
          id: cart_id, 
          customer_id: originalCustomerId 
        }])
        console.log('[WORKFLOW][link-cart][compensation][success]', { 
          cart_id, 
          restored_customer_id: originalCustomerId 
        })
      }
    } catch (error: any) {
      console.error('[WORKFLOW][link-cart][compensation][error]', { 
        error: error?.message || String(error) 
      })
      // Don't throw - compensation failures should be logged but not block rollback
    }
  }
)

/**
 * STEP 3: Verify Cart Linkage
 * Confirms that cart.customer_id matches expected customer
 */
const verifyCartLinkStep = createStep(
  "verify-cart-customer-link",
  async ({ cart_id, customer_id }: { cart_id: string; customer_id: string }, { container }) => {
    console.log('[WORKFLOW][verify-link][start]', { cart_id, customer_id })
    
    const cartModuleService = container.resolve(Modules.CART)
    
    try {
      const [cart] = await cartModuleService.listCarts(
        { id: cart_id },
        { take: 1 }
      )
      
      if (!cart) {
        throw new Error(`Cart ${cart_id} not found during verification`)
      }
      
      if (cart.customer_id !== customer_id) {
        throw new Error(
          `Cart linkage verification failed. Expected customer_id: ${customer_id}, ` +
          `Got: ${cart.customer_id || 'null'}`
        )
      }
      
      console.log('[WORKFLOW][verify-link][success]', { 
        cart_id, 
        customer_id,
        verified: true 
      })
      
      return new StepResponse({ verified: true, cart_id, customer_id })
    } catch (error: any) {
      console.error('[WORKFLOW][verify-link][error]', { 
        cart_id, 
        customer_id,
        error: error?.message || String(error) 
      })
      throw error
    }
  },
  async (stepData, { container }) => {
    // Compensation: No action needed for read-only verification
    console.log('[WORKFLOW][verify-link][compensation] No action needed')
  }
)

/**
 * STEP 4: Complete Cart Using Medusa's Native API
 * Uses the standard cart completion endpoint which handles all data transfer
 */
const completeCartStep = createStep(
  "complete-cart-create-order",
  async ({ cart_id }: { cart_id: string }, { container }) => {
    console.log('[WORKFLOW][complete-cart][start]', { cart_id })
    
    const cartModuleService = container.resolve(Modules.CART)
    const orderModuleService = container.resolve(Modules.ORDER)
    
    try {
      // Fetch cart before completion to verify state
      const [cart] = await cartModuleService.listCarts(
        { id: cart_id },
        { take: 1 }
      )
      
      if (!cart) {
        throw new Error(`Cart ${cart_id} not found`)
      }
      
      if (!cart.customer_id) {
        throw new Error(`Cart ${cart_id} has no customer_id before completion`)
      }
      
      // IDEMPOTENCY: If cart already completed, find and return existing order
      if (cart.completed_at) {
        console.log('[WORKFLOW][complete-cart][already_completed]', { 
          cart_id,
          completed_at: cart.completed_at 
        })
        
        // Find order created from this cart - get recent orders by customer
        const orders = await orderModuleService.listOrders(
          { customer_id: cart.customer_id },
          { 
            take: 20,
            order: { created_at: 'DESC' },
            relations: ['metadata']
          }
        )
        
        // Find order matching this cart
        // Check metadata first, then fall back to time-based matching
        const completionTime = new Date(cart.completed_at).getTime()
        const existingOrder = orders.find((o: any) => {
          // Check if metadata has cart_id
          if (o.metadata?.cart_id === cart_id) {
            return true
          }
          // Fall back: order created within 2 minutes of cart completion
          const orderTime = new Date(o.created_at).getTime()
          return Math.abs(orderTime - completionTime) < 120000 // 2 min window
        })
        
        if (existingOrder) {
          console.log('[WORKFLOW][complete-cart][existing_order_found]', {
            cart_id,
            order_id: existingOrder.id,
            display_id: existingOrder.display_id
          })
          
          return new StepResponse(
            { order: existingOrder, cart_id },
            { order_id: existingOrder.id, cart_id, idempotent: true }
          )
        }
        
        // Cart completed but no order found - unusual, let workflow try anyway
        console.warn('[WORKFLOW][complete-cart][completed_no_order]', { cart_id })
      }
      
      const customer_id_before_completion = cart.customer_id
      
      console.log('[WORKFLOW][complete-cart][customer_verified]', { 
        cart_id,
        customer_id: customer_id_before_completion
      })
      
      // Use Medusa's native completeCartWorkflow
      // This properly handles items, addresses, shipping, payment, and totals
      const workflowResult = await completeCartWorkflow(container).run({
        input: { id: cart_id }
      })
      
      console.log('[WORKFLOW][complete-cart][workflow_result_type]', {
        cart_id,
        hasResult: !!workflowResult?.result,
        resultKeys: workflowResult?.result ? Object.keys(workflowResult.result) : [],
        resultType: typeof workflowResult?.result
      })
      
      // Extract order from result - handle different possible structures
      let order = workflowResult?.result?.order || workflowResult?.result
      
      // If result is the order itself, it should have an id
      if (order && !order.id && workflowResult?.result) {
        order = workflowResult.result
      }
      
      if (!order || !order.id) {
        console.error('[WORKFLOW][complete-cart][no_order_in_result]', {
          cart_id,
          workflowResult: JSON.stringify(workflowResult, null, 2)
        })
        throw new Error(`Cart completion workflow did not return an order`)
      }
      
      console.log('[WORKFLOW][complete-cart][order_created]', { 
        cart_id,
        order_id: order.id,
        display_id: order.display_id
      })
      
      console.log('[WORKFLOW][complete-cart][success]', { 
        cart_id, 
        order_id: order.id,
        customer_id: order.customer_id,
        display_id: order.display_id 
      })
      
      return new StepResponse(
        { order, cart_id },
        { order_id: order.id, cart_id } // Store for compensation
      )
    } catch (error: any) {
      console.error('[WORKFLOW][complete-cart][error]', { 
        cart_id,
        error: error?.message || String(error) 
      })
      throw error
    }
  },
  async ({ order_id, cart_id, idempotent }, { container }) => {
    // Compensation: Cancel the order and restore cart state
    console.log('[WORKFLOW][complete-cart][compensation][start]', { order_id, cart_id, idempotent })
    
    // Skip compensation if this was an idempotent return of existing order
    if (idempotent) {
      console.log('[WORKFLOW][complete-cart][compensation] Skipped - idempotent operation')
      return
    }
    
    if (!order_id) {
      console.log('[WORKFLOW][complete-cart][compensation] No order to cancel')
      return
    }
    
    try {
      const orderModuleService = container.resolve(Modules.ORDER)
      const cartModuleService = container.resolve(Modules.CART)
      
      // Cancel the order
      await orderModuleService.updateOrders(order_id, { 
        status: 'canceled',
        canceled_at: new Date(),
        metadata: {
          canceled_by: 'workflow_compensation',
          cancellation_reason: 'workflow_rollback',
          original_cart_id: cart_id
        }
      })
      
      // Restore cart to incomplete state
      if (cart_id) {
        await cartModuleService.updateCarts([{ 
          id: cart_id, 
          completed_at: null 
        }])
      }
      
      console.log('[WORKFLOW][complete-cart][compensation][success]', { 
        order_id, 
        cart_id,
        order_canceled: true,
        cart_restored: true 
      })
    } catch (error: any) {
      console.error('[WORKFLOW][complete-cart][compensation][error]', { 
        order_id,
        cart_id,
        error: error?.message || String(error) 
      })
      // Don't throw - log compensation failures
    }
  }
)

/**
 * STEP 5: Verify Order Has Customer
 * Final verification that order was created with correct customer_id
 */
const verifyOrderCustomerStep = createStep(
  "verify-order-customer",
  async ({ order_id, customer_id }: { order_id: string; customer_id: string }, { container }) => {
    console.log('[WORKFLOW][verify-order][start]', { order_id, customer_id })
    
    const orderModuleService = container.resolve(Modules.ORDER)
    
    try {
      const order = await orderModuleService.retrieveOrder(order_id)
      
      if (!order) {
        throw new Error(`Order ${order_id} not found during verification`)
      }
      
      if (order.customer_id !== customer_id) {
        throw new Error(
          `Order customer verification failed. Expected customer_id: ${customer_id}, ` +
          `Got: ${order.customer_id || 'null'}`
        )
      }
      
      console.log('[WORKFLOW][verify-order][success]', { 
        order_id, 
        customer_id,
        verified: true,
        display_id: order.display_id 
      })
      
      return new StepResponse({ verified: true, order })
    } catch (error: any) {
      console.error('[WORKFLOW][verify-order][error]', { 
        order_id, 
        customer_id,
        error: error?.message || String(error) 
      })
      throw error
    }
  },
  async (stepData, { container }) => {
    // Compensation: No action needed for read-only verification
    console.log('[WORKFLOW][verify-order][compensation] No action needed')
  }
)

/**
 * Main Workflow: Complete Order With Customer
 * Ensures atomic order creation with customer linkage
 */
export const completeOrderWithCustomerWorkflow = createWorkflow(
  "complete-order-with-customer",
  function (input: CompleteOrderWithCustomerInput) {
    console.log('[WORKFLOW][main][start]', { 
      cart_id: input.cart_id, 
      customer_id: input.customer_id 
    })
    
    // STEP 1: Validate customer exists
    const customerValidation = validateCustomerStep({ 
      customer_id: input.customer_id 
    })
    
    // STEP 2: Link customer to cart (BLOCKING)
    const cartLink = linkCustomerToCartStep({ 
      cart_id: input.cart_id, 
      customer_id: input.customer_id 
    })
    
    // STEP 3: Verify linkage succeeded (BLOCKING)
    const linkVerification = verifyCartLinkStep({ 
      cart_id: input.cart_id, 
      customer_id: input.customer_id 
    })
    
    // STEP 4: Complete cart and create order (ATOMIC)
    const orderCompletion = completeCartStep({ 
      cart_id: input.cart_id 
    })
    
    // STEP 5: Verify order has correct customer_id (BLOCKING)
    const orderVerification = verifyOrderCustomerStep({ 
      order_id: orderCompletion.order.id, 
      customer_id: input.customer_id 
    })
    
    console.log('[WORKFLOW][main][end]', { 
      cart_id: input.cart_id,
      order_id: orderCompletion.order.id,
      customer_id: input.customer_id,
      all_verifications_passed: true
    })
    
    return new WorkflowResponse<CompleteOrderWithCustomerOutput>({
      order: orderVerification.order,
      customer: customerValidation.customer
    })
  }
)
