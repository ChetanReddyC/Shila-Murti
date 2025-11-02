import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { completeOrderWithCustomerWorkflow } from "../../../../workflows/complete-order-with-customer"

/**
 * Atomic Order Completion Endpoint
 * 
 * This endpoint provides ACID transaction guarantees for order creation:
 * 1. Customer validation
 * 2. Cart-to-customer linkage
 * 3. Linkage verification
 * 4. Cart completion (order creation)
 * 5. Order-customer verification
 * 
 * If any step fails, all previous steps are automatically rolled back via compensation logic.
 * 
 * @route POST /store/custom/complete-order-atomic
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const startTime = Date.now()
  
  try {
    const { cart_id, customer_id, customer_data } = req.body as {
      cart_id?: string
      customer_id?: string
      customer_data?: {
        first_name: string
        last_name: string
        phone: string
        email?: string
        addresses?: any[]
      }
    }
    
    console.log('[ATOMIC_COMPLETE][request]', { 
      cart_id, 
      customer_id,
      has_customer_data: !!customer_data,
      timestamp: new Date().toISOString()
    })
    
    // Validate required parameters
    if (!cart_id || typeof cart_id !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'cart_id is required and must be a string',
        field: 'cart_id'
      })
    }
    
    if (!customer_id || typeof customer_id !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'customer_id is required and must be a string',
        field: 'customer_id'
      })
    }
    
    // Execute atomic workflow
    console.log('[ATOMIC_COMPLETE][workflow_start]', { cart_id, customer_id })
    
    const { result } = await completeOrderWithCustomerWorkflow(req.scope).run({
      input: {
        cart_id,
        customer_id,
        customer_data
      }
    })
    
    const duration = Date.now() - startTime
    
    console.log('[ATOMIC_COMPLETE][workflow_success]', { 
      cart_id, 
      customer_id,
      order_id: result?.order?.id,
      display_id: result?.order?.display_id,
      duration_ms: duration
    })
    
    // Return success response
    return res.status(200).json({
      ok: true,
      order: result.order,
      customer: result.customer,
      metadata: {
        workflow_used: true,
        workflow_name: 'complete-order-with-customer',
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error: any) {
    const duration = Date.now() - startTime
    
    console.error('[ATOMIC_COMPLETE][workflow_error]', {
      error: error?.message || String(error),
      stack: error?.stack,
      duration_ms: duration
    })
    
    // Categorize error types for better client handling
    const errorType = categorizeError(error)
    
    return res.status(getErrorStatusCode(errorType)).json({
      ok: false,
      error: errorType,
      message: error?.message || 'Order completion failed',
      details: {
        workflow_used: true,
        workflow_name: 'complete-order-with-customer',
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    })
  }
}

/**
 * Categorize errors for better client-side handling
 */
function categorizeError(error: any): string {
  const message = error?.message || String(error)
  
  if (message.includes('not found')) {
    return 'resource_not_found'
  }
  
  if (message.includes('already completed')) {
    return 'cart_already_completed'
  }
  
  if (message.includes('verification failed')) {
    return 'verification_failed'
  }
  
  if (message.includes('customer_id') && message.includes('null')) {
    return 'customer_link_failed'
  }
  
  if (message.includes('timeout')) {
    return 'operation_timeout'
  }
  
  return 'workflow_execution_failed'
}

/**
 * Map error types to HTTP status codes
 */
function getErrorStatusCode(errorType: string): number {
  switch (errorType) {
    case 'resource_not_found':
      return 404
    case 'cart_already_completed':
      return 409
    case 'verification_failed':
    case 'customer_link_failed':
      return 422
    case 'operation_timeout':
      return 504
    default:
      return 500
  }
}
