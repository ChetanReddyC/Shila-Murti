import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import PDFDocument from "pdfkit"
import { Modules } from "@medusajs/framework/utils"

interface GenerateInvoicePdfInput {
  order_id: string
}

interface GenerateInvoicePdfOutput {
  pdf_buffer: Uint8Array
}

const fetchOrderDataStep = createStep(
  "fetch-order-data",
  async ({ order_id }: GenerateInvoicePdfInput, { container }) => {
    try {
      const orderModuleService = container.resolve(Modules.ORDER)
      const remoteQuery = container.resolve("remoteQuery")

      // Fetch complete order data with all relations
      const orderData = await remoteQuery({
        entryPoint: "order",
        fields: [
          "id",
          "display_id",
          "status",
          "created_at",
          "currency_code",
          "email",
          "subtotal",
          "shipping_total",
          "tax_total",
          "total",
          "discount_total",
          "items.*",
          "items.variant.*",
          "items.variant.product.*",
          "shipping_address.*",
          "billing_address.*",
          "shipping_methods.*",
          "payment_collections.*",
          "payment_collections.payments.*",
          "customer.*",
        ],
        variables: {
          filters: { id: order_id },
        },
      })

      if (!orderData || orderData.length === 0) {
        throw new Error(`Order with ID ${order_id} not found`)
      }

      return new StepResponse(orderData[0])
    } catch (error) {
      console.error("[INVOICE_FETCH_ERROR]", error)
      throw error
    }
  }
)

const generatePdfStep = createStep(
  "generate-pdf",
  async (orderData: any) => {
    return new Promise<StepResponse<GenerateInvoicePdfOutput>>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 })
        const chunks: Buffer[] = []

        doc.on("data", (chunk: Buffer) => chunks.push(chunk))
        doc.on("end", () => {
          const buffer = Buffer.concat(chunks)
          resolve(new StepResponse({ pdf_buffer: new Uint8Array(buffer) }))
        })
        doc.on("error", (err) => {
          console.error("[INVOICE_PDF_ERROR]", err)
          reject(err)
        })

        // Helper function to convert BigNumber to regular number
        const toNumber = (value: any): number => {
          if (value && typeof value === "object" && "numeric_" in value) {
            return value.numeric_
          }
          return Number(value) || 0
        }

        // Helper function to format currency
        const formatCurrency = (amount: number, currencyCode: string = "INR"): string => {
          return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: currencyCode.toUpperCase(),
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(amount)
        }

        // Helper function to format date
        const formatDate = (dateString: string): string => {
          const date = new Date(dateString)
          return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        }

        // Convert financial values
        const subtotal = toNumber(orderData.subtotal)
        const shippingTotal = toNumber(orderData.shipping_total)
        const taxTotal = toNumber(orderData.tax_total)
        const discountTotal = toNumber(orderData.discount_total)
        const total = toNumber(orderData.total)

        // PDF Header
        doc.fontSize(28).font("Helvetica-Bold").text("INVOICE", 50, 50)
        doc.fontSize(10).font("Helvetica").text(`Invoice #${orderData.display_id || orderData.id}`, 50, 85)
        doc.text(`Date: ${formatDate(orderData.created_at)}`, 50, 100)

        // Company Info (right side)
        doc.fontSize(12).font("Helvetica-Bold").text("Project Shilamurthi", 400, 50, { align: "right" })
        doc.fontSize(10).font("Helvetica").text("Your Store Address", 400, 68, { align: "right" })
        doc.text("City, State, ZIP", 400, 82, { align: "right" })
        doc.text("Email: support@shilamurti.com", 400, 96, { align: "right" })

        // Line separator
        doc.moveTo(50, 130).lineTo(550, 130).stroke()

        // Customer Information
        let yPos = 150
        doc.fontSize(12).font("Helvetica-Bold").text("Bill To:", 50, yPos)
        doc.fontSize(10).font("Helvetica")

        const billingAddr = orderData.billing_address || orderData.shipping_address
        if (billingAddr) {
          const customerName = [billingAddr.first_name, billingAddr.last_name].filter(Boolean).join(" ")
          doc.text(customerName || "Customer", 50, yPos + 20)
          doc.text(billingAddr.address_1, 50, yPos + 35)
          if (billingAddr.address_2) doc.text(billingAddr.address_2, 50, yPos + 50)
          const cityLine = [billingAddr.city, billingAddr.province, billingAddr.postal_code].filter(Boolean).join(", ")
          doc.text(cityLine, 50, billingAddr.address_2 ? yPos + 65 : yPos + 50)
        }

        // Shipping Information
        if (orderData.shipping_address) {
          doc.fontSize(12).font("Helvetica-Bold").text("Ship To:", 320, yPos)
          doc.fontSize(10).font("Helvetica")
          const shippingAddr = orderData.shipping_address
          const customerName = [shippingAddr.first_name, shippingAddr.last_name].filter(Boolean).join(" ")
          doc.text(customerName || "Customer", 320, yPos + 20)
          doc.text(shippingAddr.address_1, 320, yPos + 35)
          if (shippingAddr.address_2) doc.text(shippingAddr.address_2, 320, yPos + 50)
          const cityLine = [shippingAddr.city, shippingAddr.province, shippingAddr.postal_code].filter(Boolean).join(", ")
          doc.text(cityLine, 320, shippingAddr.address_2 ? yPos + 65 : yPos + 50)
        }

        // Order Items Table
        yPos = 260
        doc.moveTo(50, yPos - 10).lineTo(550, yPos - 10).stroke()

        // Table Headers
        doc.fontSize(10).font("Helvetica-Bold")
        doc.text("Item", 50, yPos)
        doc.text("Qty", 320, yPos, { width: 40, align: "center" })
        doc.text("Price", 380, yPos, { width: 80, align: "right" })
        doc.text("Total", 480, yPos, { width: 70, align: "right" })

        yPos += 20
        doc.moveTo(50, yPos - 5).lineTo(550, yPos - 5).stroke()

        // Table Items
        doc.font("Helvetica")
        if (orderData.items && orderData.items.length > 0) {
          orderData.items.forEach((item: any) => {
            const itemTitle = item.title || item.variant?.product?.title || "Product"
            const quantity = item.quantity || 1
            const unitPrice = toNumber(item.unit_price)
            const itemTotal = toNumber(item.total)

            // Handle long product names
            const itemText = doc.widthOfString(itemTitle) > 260 ? itemTitle.substring(0, 40) + "..." : itemTitle

            doc.text(itemText, 50, yPos, { width: 260 })
            doc.text(quantity.toString(), 320, yPos, { width: 40, align: "center" })
            doc.text(formatCurrency(unitPrice, orderData.currency_code), 380, yPos, { width: 80, align: "right" })
            doc.text(formatCurrency(itemTotal, orderData.currency_code), 480, yPos, { width: 70, align: "right" })

            yPos += 25
          })
        }

        // Subtotal and totals section
        yPos += 10
        doc.moveTo(50, yPos).lineTo(550, yPos).stroke()
        yPos += 20

        const totalsX = 380
        const valuesX = 480

        doc.fontSize(10).font("Helvetica")
        doc.text("Subtotal:", totalsX, yPos)
        doc.text(formatCurrency(subtotal, orderData.currency_code), valuesX, yPos, { width: 70, align: "right" })
        yPos += 20

        doc.text("Shipping:", totalsX, yPos)
        doc.text(formatCurrency(shippingTotal, orderData.currency_code), valuesX, yPos, { width: 70, align: "right" })
        yPos += 20

        if (discountTotal > 0) {
          doc.text("Discount:", totalsX, yPos)
          doc.text(`-${formatCurrency(discountTotal, orderData.currency_code)}`, valuesX, yPos, { width: 70, align: "right" })
          yPos += 20
        }

        doc.text("Tax:", totalsX, yPos)
        doc.text(formatCurrency(taxTotal, orderData.currency_code), valuesX, yPos, { width: 70, align: "right" })
        yPos += 25

        doc.moveTo(380, yPos - 5).lineTo(550, yPos - 5).stroke()
        yPos += 10

        doc.fontSize(12).font("Helvetica-Bold")
        doc.text("Total:", totalsX, yPos)
        doc.text(formatCurrency(total, orderData.currency_code), valuesX, yPos, { width: 70, align: "right" })

        // Payment Information
        yPos += 40
        doc.fontSize(10).font("Helvetica-Bold").text("Payment Information:", 50, yPos)
        doc.fontSize(9).font("Helvetica")

        const paymentStatus = orderData.payment_collections?.[0]?.status || "pending"
        const paymentMethod = orderData.payment_collections?.[0]?.payments?.[0]?.provider_id || "N/A"

        doc.text(`Payment Status: ${paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}`, 50, yPos + 15)
        doc.text(`Payment Method: ${paymentMethod}`, 50, yPos + 28)

        // Footer
        doc.fontSize(8).font("Helvetica").fillColor("#666666")
        doc.text("Thank you for your business!", 50, 720, { align: "center", width: 500 })
        doc.text("For questions about this invoice, please contact support@shilamurthi.com", 50, 735, { align: "center", width: 500 })

        doc.end()
      } catch (error) {
        console.error("[INVOICE_PDF_ERROR]", error)
        reject(error)
      }
    })
  }
)

export const generateInvoicePdfWorkflow = createWorkflow(
  "generate-invoice-pdf",
  function (input: GenerateInvoicePdfInput) {
    const orderData = fetchOrderDataStep(input)
    const result = generatePdfStep(orderData)
    return new WorkflowResponse(result)
  }
)
