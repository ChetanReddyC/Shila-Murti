import { Modules } from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { randomUUID } from "crypto"
import { buildAdminAuthHeaders } from "./adminAuthHeaders"
import { normalizePhoneNumber, generatePlaceholderEmail } from "./phoneNormalization"
import {
  createEnhancedCustomerService,
  CustomerLookupRequest,
  CustomerConsolidationInfo,
} from "./enhancedCustomerService"

type Scope = {
  resolve<T = any>(dependency: any): T
}

export interface CustomerAccountInput {
  scope: Scope
  phone: string
  first_name?: string
  last_name?: string
  email?: string
  password?: string
  addresses?: any[]
  whatsapp_authenticated?: boolean
  email_authenticated?: boolean
  identity_method?: "phone" | "email"
  cart_id?: string
  order_id?: string
  auth_subject?: string | null
  requireAuthSubjectMatch?: boolean
}

export interface AssociationResult {
  attempted: boolean
  linked: boolean
  method?: "module" | "admin"
  error?: string
  skipped?: boolean
}

export interface CustomerAccountSuccess {
  ok: true
  customer: any
  wasCreated: boolean
  statusCode: number
  lookupStrategy: string
  consolidationInfo: CustomerConsolidationInfo
  cartAssociation?: AssociationResult
  orderAssociation?: AssociationResult
}

export interface CustomerAccountConflict {
  ok: false
  reason: "auth_subject_mismatch"
  statusCode: number
  customerId: string
  storedSubject: string | null
}

export type CustomerAccountResult = CustomerAccountSuccess | CustomerAccountConflict

interface AssociationInput {
  scope: Scope
  cart_id?: string
  order_id?: string
  customer_id: string
}

const ADMIN_BASE_URL =
  process.env.MEDUSA_BASE_URL ||
  (process.env as any).NEXT_PUBLIC_MEDUSA_API_BASE_URL ||
  "http://localhost:9000"

const ADMIN_TOKEN = (process.env as any).MEDUSA_ADMIN_TOKEN || ""

export async function findOrCreateCustomerAccount(
  input: CustomerAccountInput
): Promise<CustomerAccountResult> {
  const {
    scope,
    phone,
    first_name,
    last_name,
    email,
    password,
    addresses = [],
    whatsapp_authenticated = false,
    email_authenticated = false,
    identity_method = "phone",
    cart_id,
    order_id,
    auth_subject,
    requireAuthSubjectMatch = false,
  } = input

  const normalizedPhone = normalizePhoneNumber(phone)

  const customerModuleService: any = scope.resolve(Modules.CUSTOMER)
  const enhancedCustomerService = createEnhancedCustomerService(customerModuleService)

  const effectiveEmail =
    email ||
    (identity_method === "phone" && whatsapp_authenticated
      ? generatePlaceholderEmail(phone)
      : undefined)

  const lookupRequest: CustomerLookupRequest = {
    phone,
    email: effectiveEmail,
    whatsapp_authenticated,
    email_authenticated,
    identity_method,
    first_name: first_name || "Customer",
    last_name: last_name || "",
  }

  const { customer: resultCustomer, consolidationInfo } =
    await enhancedCustomerService.findOrCreateCustomer(lookupRequest)

  const lookupStrategy = consolidationInfo.strategy_used

  if (consolidationInfo.existing_customer_found && resultCustomer) {
    const storedSubject = resultCustomer.metadata?.auth_subject || null

    if (
      requireAuthSubjectMatch &&
      storedSubject &&
      storedSubject !== auth_subject
    ) {
      return {
        ok: false,
        reason: "auth_subject_mismatch",
        statusCode: 409,
        customerId: resultCustomer.id,
        storedSubject,
      }
    }

    if (requireAuthSubjectMatch && storedSubject && !auth_subject) {
      return {
        ok: false,
        reason: "auth_subject_mismatch",
        statusCode: 409,
        customerId: resultCustomer.id,
        storedSubject,
      }
    }

    const updatePayload: Record<string, any> = {
      first_name: first_name || resultCustomer.first_name,
      last_name: last_name || resultCustomer.last_name,
      phone: phone || resultCustomer.phone,
      has_account: true,
    }

    if (addresses?.length) {
      updatePayload.addresses = transformAddresses(addresses, {
        first_name: first_name || resultCustomer.first_name,
        last_name: last_name || resultCustomer.last_name,
      })
    }

    updatePayload.metadata = {
      ...(resultCustomer.metadata || {}),
      phone,
      phone_normalized: normalizedPhone,
      last_updated: new Date().toISOString(),
      update_source: "enhanced_store_custom",
      whatsapp_authenticated,
      email_authenticated,
      identity_method,
      auth_timestamp:
        resultCustomer.metadata?.auth_timestamp || new Date().toISOString(),
      auth_source: "customer_update",
      unified_phone_lookup: true,
      consolidation_info: {
        strategy_used: consolidationInfo.strategy_used,
        phone_conflicts_resolved: consolidationInfo.phone_conflicts_resolved,
        timestamp: new Date().toISOString(),
      },
      duplicate_prevention: true,
    }

    if (auth_subject) {
      updatePayload.metadata.auth_subject = auth_subject
      updatePayload.metadata.auth_subject_last_verified_at = new Date().toISOString()
    }

    await customerModuleService.updateCustomers(resultCustomer.id, updatePayload)

    const [finalCustomer] = await customerModuleService.listCustomers(
      { id: resultCustomer.id },
      { take: 1, relations: ["addresses"] }
    )

    const associations = await associateCartAndOrder({
      scope,
      cart_id,
      order_id,
      customer_id: finalCustomer.id,
    })

    return {
      ok: true,
      customer: finalCustomer,
      wasCreated: false,
      statusCode: 200,
      lookupStrategy,
      consolidationInfo,
      cartAssociation: associations.cart,
      orderAssociation: associations.order,
    }
  }

  const safePassword = password || randomUUID()

  const customerCreateData = {
    ...resultCustomer,
    password: safePassword,
    has_account: true,
    addresses: addresses?.length
      ? transformAddresses(addresses, {
          first_name: first_name || resultCustomer?.first_name,
          last_name: last_name || resultCustomer?.last_name,
        })
      : [],
  }

  customerCreateData.metadata = {
    ...(customerCreateData.metadata || {}),
    phone,
    phone_normalized: normalizedPhone,
    whatsapp_authenticated,
    email_authenticated,
    identity_method,
    auth_timestamp: new Date().toISOString(),
    unified_phone_lookup: true,
    duplicate_prevention: true,
    auth_source: "customer_creation",
  }

  if (auth_subject) {
    customerCreateData.metadata.auth_subject = auth_subject
    customerCreateData.metadata.auth_subject_last_verified_at = new Date().toISOString()
  }

  const { result } = await createCustomersWorkflow(scope).run({
    input: {
      customersData: [customerCreateData],
    },
  })

  const customer = result?.[0]

  let finalCustomer = customer

  if (customer?.id) {
    try {
      const [fetched] = await customerModuleService.listCustomers(
        { id: customer.id },
        { take: 1, relations: ["addresses"] }
      )
      if (fetched) {
        finalCustomer = fetched
      }
    } catch {
      finalCustomer = customer
    }
  }

  const associations = finalCustomer?.id
    ? await associateCartAndOrder({
        scope,
        cart_id,
        order_id,
        customer_id: finalCustomer.id,
      })
    : { cart: undefined, order: undefined }

  return {
    ok: true,
    customer: finalCustomer,
    wasCreated: true,
    statusCode: 201,
    lookupStrategy,
    consolidationInfo,
    cartAssociation: associations.cart,
    orderAssociation: associations.order,
  }
}

function transformAddresses(addresses: any[], fallback: { first_name?: string; last_name?: string }) {
  return addresses.map((address: any) => ({
    first_name: address.first_name || fallback.first_name || "Customer",
    last_name: address.last_name || fallback.last_name || "",
    address_1: address.address_1?.trim(),
    address_2: address.address_2?.trim() || null,
    city: address.city?.trim(),
    postal_code: address.postal_code?.trim(),
    province: address.province?.trim() || null,
    country_code: (address.country_code || "IN").toUpperCase(),
    phone: address.phone?.trim() || null,
    metadata: {
      source: "checkout",
      created_from_sync: true,
      sync_timestamp: new Date().toISOString(),
      ...(address.metadata || {}),
    },
  }))
}

async function associateCartAndOrder({
  scope,
  cart_id,
  order_id,
  customer_id,
}: AssociationInput): Promise<{
  cart?: AssociationResult
  order?: AssociationResult
}> {
  const results: { cart?: AssociationResult; order?: AssociationResult } = {}

  if (cart_id && customer_id) {
    results.cart = await linkCart(scope, cart_id, customer_id)
  }

  if (order_id && customer_id) {
    results.order = await linkOrder(scope, order_id, customer_id)
  }

  return results
}

async function linkCart(scope: Scope, cartId: string, customerId: string): Promise<AssociationResult> {
  try {
    const cartModuleService = safeResolve(scope, Modules.CART)

    if (cartModuleService && typeof cartModuleService.updateCarts === "function") {
      await cartModuleService.updateCarts([{ id: cartId, customer_id: customerId }])
      return { attempted: true, linked: true, method: "module" }
    }
  } catch (error: any) {
    return await fallbackCartAssociation(cartId, customerId, error?.message)
  }

  return await fallbackCartAssociation(cartId, customerId)
}

async function linkOrder(scope: Scope, orderId: string, customerId: string): Promise<AssociationResult> {
  try {
    const orderModuleService = safeResolve(scope, Modules.ORDER)

    if (orderModuleService && typeof orderModuleService.updateOrders === "function") {
      await orderModuleService.updateOrders(orderId, { customer_id: customerId })
      return { attempted: true, linked: true, method: "module" }
    }
  } catch (error: any) {
    return await fallbackOrderAssociation(orderId, customerId, error?.message)
  }

  return await fallbackOrderAssociation(orderId, customerId)
}

function safeResolve(scope: Scope, token: any) {
  try {
    return scope.resolve(token)
  } catch {
    return null
  }
}

async function fallbackCartAssociation(
  cartId: string,
  customerId: string,
  moduleError?: string
): Promise<AssociationResult> {
  if (!ADMIN_TOKEN.trim()) {
    return {
      attempted: Boolean(moduleError),
      linked: false,
      skipped: true,
      error: moduleError,
    }
  }

  try {
    const response = await fetch(`${ADMIN_BASE_URL}/admin/carts/${cartId}` as any, {
      method: "POST",
      headers: buildAdminAuthHeaders(ADMIN_TOKEN, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ customer_id: customerId }),
    } as any)

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        attempted: true,
        linked: false,
        method: "admin",
        error: `status ${response.status}: ${body.slice(0, 500)}`,
      }
    }

    return { attempted: true, linked: true, method: "admin" }
  } catch (error: any) {
    return {
      attempted: true,
      linked: false,
      method: "admin",
      error: error?.message || String(error),
    }
  }
}

async function fallbackOrderAssociation(
  orderId: string,
  customerId: string,
  moduleError?: string
): Promise<AssociationResult> {
  if (!ADMIN_TOKEN.trim()) {
    return {
      attempted: Boolean(moduleError),
      linked: false,
      skipped: true,
      error: moduleError,
    }
  }

  try {
    const response = await fetch(`${ADMIN_BASE_URL}/admin/orders/${orderId}` as any, {
      method: "POST",
      headers: buildAdminAuthHeaders(ADMIN_TOKEN, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ customer_id: customerId }),
    } as any)

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        attempted: true,
        linked: false,
        method: "admin",
        error: `status ${response.status}: ${body.slice(0, 500)}`,
      }
    }

    return { attempted: true, linked: true, method: "admin" }
  } catch (error: any) {
    return {
      attempted: true,
      linked: false,
      method: "admin",
      error: error?.message || String(error),
    }
  }
}
