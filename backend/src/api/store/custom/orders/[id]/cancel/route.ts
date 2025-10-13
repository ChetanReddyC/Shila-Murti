import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { extractBearerToken, verifyAccessToken } from "../../../../../../utils/jwt"
import { cancelCustomerOrderWorkflow } from "../../../../../../workflows/cancel-order"
import type { ILockingModule } from "@medusajs/framework/types"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bearer = extractBearerToken(req.headers.authorization as string | undefined)
    if (!bearer) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const claims = await verifyAccessToken(bearer)
    const customerId = claims.sub

    if (!customerId) {
      return res.status(401).json({ message: "Invalid token: missing customer ID" })
    }

    const orderId = req.params.id
    if (!orderId) {
      return res.status(400).json({ message: "Order ID required" })
    }

    // RACE CONDITION PREVENTION: Acquire distributed lock before any operations
    const lockingService = req.scope.resolve(Modules.LOCKING) as ILockingModule
    const lockKey = `order:cancel:${orderId}`
    const lockTimeout = 30000 // 30 seconds timeout
    
    let lockAcquired = false
    try {
      await lockingService.acquire(lockKey, lockTimeout)
      lockAcquired = true
      console.log('[ORDER_CANCEL][lock_acquired]', { orderId, lockKey })
    } catch (lockError) {
      console.warn('[ORDER_CANCEL][lock_failed]', {
        orderId,
        error: String(lockError),
        message: 'Another cancellation request is in progress'
      })
      return res.status(409).json({ 
        message: "Order cancellation already in progress",
        error: "Please wait a moment and try again"
      })
    }

    // Ensure lock is released even if errors occur
    try {
      const orderModuleService: any = req.scope.resolve(Modules.ORDER)
    
    // Retrieve order directly by ID with summary fields
    let order: any
    try {
      order = await orderModuleService.retrieveOrder(orderId, {
        select: ["id", "status", "customer_id", "metadata", "summary"],
      })
    } catch (error) {
      console.error('[ORDER_CANCEL][retrieve_error]', {
        orderId,
        error: String(error)
      })
      return res.status(404).json({ message: "Order not found" })
    }
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }
    
    console.log('[ORDER_CANCEL][order_retrieved]', {
      orderId,
      hasTotal: 'total' in order,
      hasSummary: 'summary' in order,
      total: order.total,
      summary: order.summary,
      orderKeys: Object.keys(order)
    })
    
    // Verify order belongs to customer
    if (order.customer_id !== customerId) {
      return res.status(403).json({ message: "Unauthorized access to order" })
    }

    if (order.status === 'canceled') {
      return res.status(400).json({ 
        message: "Order is already cancelled"
      })
    }

    // Extract Cashfree order ID from metadata for refund processing
    const cashfreeOrderId = order.metadata?.cashfree_order_id as string | undefined
    
    // SECURITY: Check for existing refund to prevent double refund
    if (order.metadata?.refund_initiated || order.metadata?.refund_id || order.metadata?.cf_refund_id) {
      const existingRefundStatus = order.metadata?.refund_status || 'unknown'
      console.warn('[ORDER_CANCEL][duplicate_refund_blocked]', {
        orderId,
        existingRefundId: order.metadata?.refund_id,
        existingCfRefundId: order.metadata?.cf_refund_id,
        refundStatus: existingRefundStatus
      })
      
      return res.status(400).json({ 
        message: "Refund already initiated for this order",
        refund: {
          refund_id: order.metadata?.refund_id,
          cf_refund_id: order.metadata?.cf_refund_id,
          status: existingRefundStatus
        }
      })
    }

    // Check payment status from order metadata or summary
    let paymentCaptured = false
    let paymentStatus = 'unknown'
    let paymentQueryFailed = false
    let actualPaymentAmount: number | undefined
    
    try {
      const remoteQuery = req.scope.resolve("remoteQuery")
      
      const orderWithPayments = await remoteQuery({
        entryPoint: "order",
        fields: ["id", "payment_collections.id", "payment_collections.status", "payment_collections.amount", "payment_collections.payments.id", "payment_collections.payments.captured_at", "payment_collections.payments.amount"],
        variables: { id: orderId }
      })
      
      if (orderWithPayments && orderWithPayments.length > 0) {
        const orderData = orderWithPayments[0]
        if (orderData.payment_collections && orderData.payment_collections.length > 0) {
          const paymentCollection = orderData.payment_collections[0]
          paymentStatus = paymentCollection.status
          
          // Store the actual payment amount for validation
          actualPaymentAmount = paymentCollection.amount
          
          // Check if any payment is captured
          if (paymentCollection.payments && paymentCollection.payments.length > 0) {
            paymentCaptured = paymentCollection.payments.some((p: any) => Boolean(p.captured_at))
            if (paymentCaptured) {
              paymentStatus = 'captured'
              // Use the captured payment amount if available
              const capturedPayment = paymentCollection.payments.find((p: any) => Boolean(p.captured_at))
              if (capturedPayment?.amount) {
                actualPaymentAmount = capturedPayment.amount
              }
            }
          }
        }
      }
    } catch (paymentError) {
      paymentQueryFailed = true
      console.error('[ORDER_CANCEL][payment_fetch_error]', {
        orderId,
        error: String(paymentError)
      })
      
      // CRITICAL: Don't proceed if we can't determine payment status
      // Safer to fail than risk incorrect refund handling
      return res.status(500).json({
        message: "Unable to verify payment status. Please try again.",
        error: "payment_status_query_failed"
      })
    }
    
    console.log('[ORDER_CANCEL][metadata_check]', {
      orderId,
      hasCashfreeOrderId: Boolean(cashfreeOrderId),
      cashfreeOrderId,
      paymentStatus: paymentStatus,
      paymentCaptured
    })

    // Initiate Cashfree refund if payment was captured
    let refundInitiated = false
    let refundError: string | null = null
    
    if (paymentCaptured && cashfreeOrderId) {
      // IDEMPOTENT: Use deterministic refund ID (no timestamp) to prevent duplicate refunds
      // If API call fails and user retries, Cashfree will recognize duplicate and return existing refund
      const refundId = `refund_${orderId}`
      
      try {
        // TRANSACTION SAFETY: Mark refund_initiated=true BEFORE API call to prevent race conditions
        await orderModuleService.updateOrders(orderId, {
          metadata: {
            ...order.metadata,
            refund_initiated: true,
            refund_id: refundId,
            refund_attempt_at: new Date().toISOString(),
          }
        })
        console.log('[ORDER_CANCEL][refund_lock_acquired]', { orderId, refundId })
        
        // Get order total from summary (Medusa v2 stores in base currency units)
        // current_order_total is the actual total to charge/refund (9600 = ₹9,600)
        const orderTotal = order.summary?.current_order_total || 
                           order.summary?.original_order_total || 
                           order.total || 0
        
        // Use amount directly - already in correct format for Cashfree
        const refundAmount = Number(orderTotal.toFixed(2))
        
        if (refundAmount <= 0) {
          console.error('[ORDER_CANCEL][invalid_amount]', {
            orderId,
            orderTotal,
            refundAmount,
            summary: order.summary,
            total: order.total
          })
          throw new Error('Invalid refund amount: order total is zero or undefined')
        }
        
        // SECURITY: Validate refund amount matches payment amount (with 1% tolerance for rounding)
        if (actualPaymentAmount !== undefined) {
          const amountDifference = Math.abs(refundAmount - actualPaymentAmount)
          const tolerance = actualPaymentAmount * 0.01 // 1% tolerance
          
          if (amountDifference > tolerance) {
            console.error('[ORDER_CANCEL][amount_mismatch]', {
              orderId,
              refundAmount,
              actualPaymentAmount,
              difference: amountDifference,
              tolerance,
              message: 'Refund amount does not match payment amount'
            })
            throw new Error(`Amount mismatch: Refund ${refundAmount} differs from payment ${actualPaymentAmount}`)
          }
          
          console.log('[ORDER_CANCEL][amount_validated]', {
            orderId,
            refundAmount,
            actualPaymentAmount,
            difference: amountDifference
          })
        } else {
          console.warn('[ORDER_CANCEL][amount_validation_skipped]', {
            orderId,
            refundAmount,
            message: 'Could not retrieve payment amount for validation'
          })
        }
        
        console.log('[ORDER_CANCEL][refund_initiate]', {
          orderId,
          cashfreeOrderId,
          refundId,
          refundAmount,
          orderTotal
        })

        // Call Cashfree refund API
        const CF_BASE = process.env.CASHFREE_ENV === 'production'
          ? 'https://api.cashfree.com/pg'
          : 'https://sandbox.cashfree.com/pg'

        const refundResponse = await fetch(`${CF_BASE}/orders/${encodeURIComponent(cashfreeOrderId)}/refunds`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': process.env.CASHFREE_API_VERSION || '2023-08-01',
            'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
            'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || '',
          },
          body: JSON.stringify({
            refund_id: refundId,
            refund_amount: refundAmount,
            refund_note: 'Order cancellation - customer requested',
            refund_speed: 'STANDARD'
          })
        })

        const refundData = await refundResponse.json()

        if (refundResponse.ok) {
          console.log('[ORDER_CANCEL][refund_success]', {
            orderId,
            cashfreeOrderId,
            refundId,
            cfRefundId: refundData.cf_refund_id,
            status: refundData.refund_status
          })
          
          refundInitiated = true
          
          // Update order metadata with refund information
          try {
            await orderModuleService.updateOrders(orderId, {
              metadata: {
                ...order.metadata,
                refund_id: refundId,
                cf_refund_id: refundData.cf_refund_id,
                refund_status: refundData.refund_status || 'processing',
                refund_amount: refundAmount,
                refund_initiated_at: new Date().toISOString(),
              }
            })
          } catch (metadataError) {
            console.error('[ORDER_CANCEL][metadata_update_error]', {
              orderId,
              error: String(metadataError)
            })
          }
        } else {
          console.error('[ORDER_CANCEL][refund_failed]', {
            orderId,
            cashfreeOrderId,
            status: refundResponse.status,
            error: refundData
          })
          
          refundError = refundData.message || refundData.error || 'Refund initiation failed'
          
          // TRANSACTION SAFETY: Clear refund lock and store failure
          try {
            await orderModuleService.updateOrders(orderId, {
              metadata: {
                ...order.metadata,
                refund_initiated: false,
                refund_error: refundError,
                refund_failed_at: new Date().toISOString(),
              }
            })
          } catch (metadataError) {
            console.error('[ORDER_CANCEL][metadata_update_error]', {
              orderId,
              error: String(metadataError)
            })
          }
          
          // CRITICAL: Return error - do NOT proceed with order cancellation
          return res.status(400).json({
            message: "Order cancellation failed: Unable to process refund",
            error: refundError,
            note: "Your order has NOT been cancelled. Payment will not be refunded. Please contact support."
          })
        }
      } catch (refundException: any) {
        console.error('[ORDER_CANCEL][refund_exception]', {
          orderId,
          cashfreeOrderId,
          error: refundException?.message || String(refundException)
        })
        
        refundError = refundException?.message || 'Refund request exception'
        
        // TRANSACTION SAFETY: Clear refund lock and store exception
        try {
          await orderModuleService.updateOrders(orderId, {
            metadata: {
              ...order.metadata,
              refund_initiated: false,
              refund_error: refundError,
              refund_failed_at: new Date().toISOString(),
            }
          })
        } catch (metadataError) {
          console.error('[ORDER_CANCEL][metadata_update_error]', {
            orderId,
            error: String(metadataError)
          })
        }
        
        // CRITICAL: Return error - do NOT proceed with order cancellation
        return res.status(500).json({
          message: "Order cancellation failed: Refund processing error",
          error: refundError,
          note: "Your order has NOT been cancelled. Payment status unchanged. Please contact support."
        })
      }
    } else if (paymentCaptured && !cashfreeOrderId) {
      console.error('[ORDER_CANCEL][missing_cashfree_id]', {
        orderId,
        message: 'Payment was captured but cashfree_order_id not found in metadata. Cannot process refund.'
      })
      
      // CRITICAL: Block cancellation if payment captured but no refund possible
      return res.status(400).json({
        message: "Order cancellation blocked: Missing payment reference",
        error: "Cannot process refund without Cashfree order ID. Please contact support.",
        note: "Your order has NOT been cancelled to prevent payment issues."
      })
    }

    // TRANSACTION SAFETY: Only proceed with cancel workflow if refund succeeded OR no payment to refund
    try {
      const { result } = await cancelCustomerOrderWorkflow(req.scope).run({
        input: {
          order_id: orderId,
        },
      })

      const updatedOrder = await orderModuleService.retrieveOrder(orderId, {
        select: ["id", "status", "customer_id", "metadata", "summary"],
      })

      // Build response message based on refund status
      let responseMessage = "Order cancelled successfully"
      if (refundInitiated) {
        responseMessage += ". Refund has been initiated and will be processed within 5-7 business days."
      } else if (refundError) {
        responseMessage += `. Note: ${refundError}`
      } else if (!paymentCaptured) {
        responseMessage += ". No payment to refund."
      }

      return res.status(200).json({ 
        order: updatedOrder,
        message: responseMessage,
        refund: refundInitiated ? {
          initiated: true,
          status: 'processing',
          message: 'Refund will be processed within 5-7 business days'
        } : refundError ? {
          initiated: false,
          error: refundError
        } : null
      })
    } catch (workflowError: any) {
      console.error("[ORDER_CANCEL_WORKFLOW_ERROR]", workflowError)
      
      const errorMessage = workflowError?.message || String(workflowError)
      
      if (errorMessage.includes('fulfilled') || 
          errorMessage.includes('shipped') || 
          errorMessage.includes('delivered')) {
        return res.status(400).json({ 
          message: "Order cannot be cancelled",
          reason: "Order has been fulfilled or shipped"
        })
      }
      
      if (errorMessage.includes('paid') || errorMessage.includes('captured')) {
        return res.status(400).json({ 
          message: "Order cannot be cancelled",
          reason: "Payment has been processed. Please contact support for refund."
        })
      }

      return res.status(400).json({ 
        message: "Order cannot be cancelled",
        reason: errorMessage
      })
    }
    } catch (error: any) {
      console.error("[ORDER_CANCEL_ERROR]", error)
      return res.status(500).json({ 
        message: "Internal Server Error",
        error: error?.message
      })
    } finally {
      // CRITICAL: Always release the lock
      if (lockAcquired) {
        try {
          await lockingService.release(lockKey)
          console.log('[ORDER_CANCEL][lock_released]', { orderId, lockKey })
        } catch (releaseError) {
          console.error('[ORDER_CANCEL][lock_release_error]', {
            orderId,
            lockKey,
            error: String(releaseError)
          })
        }
      }
    }
  } catch (error: any) {
    console.error("[ORDER_CANCEL_ERROR]", error)
    return res.status(500).json({ 
      message: "Internal Server Error",
      error: error?.message
    })
  }
}
