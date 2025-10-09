import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"

interface CancelOrderInput {
  order_id: string
}

export const cancelCustomerOrderWorkflow = createWorkflow(
  "cancel-customer-order",
  function (input: CancelOrderInput) {
    const result = cancelOrderWorkflow.runAsStep({ 
      input: { 
        order_id: input.order_id 
      } 
    })
    
    return new WorkflowResponse(result)
  }
)
