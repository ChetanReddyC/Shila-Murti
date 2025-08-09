#!/usr/bin/env node

/**
 * Inventory Audit Script (Medusa v2)
 *
 * Purpose:
 *  - Audits product variants and their inventory associations to explain large stock drops
 *  - Computes effective purchasable units based on required_quantity across inventory items
 *  - Flags likely misconfigurations and prints concrete recommendations
 *
 * Requirements:
 *  - Node.js 18+ (uses global fetch)
 *  - Environment variables:
 *      MEDUSA_BASE_URL            (default: http://localhost:9000)
 *      MEDUSA_PUBLISHABLE_KEY     (required for store endpoints)
 *      MEDUSA_ADMIN_TOKEN         (optional, for admin detail if you want to extend)
 *
 * Usage examples:
 *  - Audit all products:            node storefront/scripts/audit-inventory.mjs
 *  - JSON output:                   node storefront/scripts/audit-inventory.mjs --json
 *  - Filter by handle:              node storefront/scripts/audit-inventory.mjs --handle my-product-handle
 *  - Limit to first N products:     node storefront/scripts/audit-inventory.mjs --limit 50
 */

const BASE_URL = process.env.MEDUSA_BASE_URL || 'http://localhost:9000'
const PUBLISHABLE_KEY = process.env.MEDUSA_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const ADMIN_TOKEN = process.env.MEDUSA_ADMIN_TOKEN || ''

if (!PUBLISHABLE_KEY) {
  console.error('[audit] Missing MEDUSA_PUBLISHABLE_KEY (or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)')
  process.exit(1)
}

const args = process.argv.slice(2)
const flags = new Map()
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '')
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      flags.set(key, true)
    } else {
      flags.set(key, next)
      i++
    }
  }
}

const asJson = Boolean(flags.get('json'))
const handleFilter = flags.get('handle') || ''
const limitFlag = Number(flags.get('limit') || 0)

function headers(extra = {}) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'x-publishable-api-key': PUBLISHABLE_KEY,
    ...extra,
  }
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: headers(init.headers || {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url} :: ${text}`)
  }
  return res.json()
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0) }

function computeVariantAudit(variant) {
  const manageInventory = Boolean(variant.manage_inventory)
  const allowBackorder = Boolean(variant.allow_backorder)

  // v1 style fallback
  let rawAvailable = 0
  let effectiveUnits = 0
  let components = []

  if (typeof variant.inventory_quantity === 'number' && manageInventory) {
    rawAvailable = Math.max(0, Number(variant.inventory_quantity) || 0)
    effectiveUnits = rawAvailable
  }

  if (Array.isArray(variant.inventory_items) && variant.inventory_items.length > 0) {
    let minUnitsAcross = null
    for (const link of variant.inventory_items) {
      const required = Math.max(1, Number(link.required_quantity) || 1)
      const levels = link.inventory?.location_levels || []
      const available = sum(levels.map((lvl) => Math.max(0, Number(lvl?.available_quantity) || 0)))
      const reserved = sum(levels.map((lvl) => Math.max(0, Number(lvl?.reserved_quantity) || 0)))
      const stocked = sum(levels.map((lvl) => Math.max(0, Number(lvl?.stocked_quantity) || 0)))
      const unitsForComponent = Math.floor(available / required)

      rawAvailable += available
      minUnitsAcross = minUnitsAcross === null ? unitsForComponent : Math.min(minUnitsAcross, unitsForComponent)

      components.push({
        inventory_item_id: link.inventory_item_id,
        required_quantity: required,
        available_quantity: available,
        reserved_quantity: reserved,
        stocked_quantity: stocked,
        effective_units_for_component: unitsForComponent,
      })
    }
    effectiveUnits = Math.max(0, minUnitsAcross ?? 0)
  }

  const expectedDropPerUnit = components.length > 0
    ? sum(components.map((c) => c.required_quantity))
    : 1

  const issues = []
  if (components.length > 1) {
    issues.push('Multiple inventory items linked to variant (ensure this is intended, e.g., bundle/kit)')
  }
  for (const c of components) {
    if (c.required_quantity !== 1 && components.length === 1) {
      issues.push(`required_quantity = ${c.required_quantity} for single linked inventory item (likely should be 1 for standard SKUs)`) 
    }
  }
  if (manageInventory && effectiveUnits === 0 && allowBackorder) {
    issues.push('No effective units but backorder is enabled (UI should allow ordering; confirm policy)')
  }
  if (manageInventory && !allowBackorder && effectiveUnits === 0) {
    issues.push('No effective units available (consider restock or adjust associations)')
  }

  return {
    variant_id: variant.id,
    title: variant.title,
    manage_inventory: manageInventory,
    allow_backorder: allowBackorder,
    raw_available_sum: rawAvailable,
    effective_units: effectiveUnits,
    expected_drop_per_unit: expectedDropPerUnit,
    components,
    issues,
    recommendations: makeRecommendations(components)
  }
}

function makeRecommendations(components) {
  const recs = []
  if (components.length === 0) return recs
  if (components.length === 1) {
    const c = components[0]
    if (c.required_quantity !== 1) {
      recs.push('Set required_quantity to 1 if this is a standard one-to-one SKU (not a bundle)')
    }
  } else {
    // Multiple components
    recs.push('Verify variant represents a bundle/kit. If not, unlink extra inventory items so only one remains')
  }
  return recs
}

async function fetchAllProducts({ limit = 50, handle = '' } = {}) {
  const pageSize = 50
  const max = limit > 0 ? limit : Number.MAX_SAFE_INTEGER
  let collected = []
  let offset = 0

  while (collected.length < max) {
    const take = Math.min(pageSize, max - collected.length)
    const qs = new URLSearchParams()
    qs.set('limit', String(take))
    qs.set('offset', String(offset))
    if (handle) qs.set('handle', handle)
    qs.set('fields', '*variants,*variants.inventory_items,*variants.inventory_items.inventory,*variants.inventory_items.inventory.location_levels')

    const url = `${BASE_URL}/store/products?${qs.toString()}`
    const data = await fetchJson(url)
    const items = Array.isArray(data.products) ? data.products : []
    collected = collected.concat(items)
    offset += items.length

    if (items.length < take || offset >= (data.count || offset)) break
  }

  return collected
}

function formatReport(report) {
  const lines = []
  for (const p of report) {
    lines.push(`Product: ${p.title} (${p.id}) handle=${p.handle}`)
    for (const v of p.variant_audit) {
      lines.push(`  Variant: ${v.title} (${v.variant_id})`)
      lines.push(`    manage_inventory=${v.manage_inventory} allow_backorder=${v.allow_backorder}`)
      lines.push(`    effective_units=${v.effective_units} raw_available_sum=${v.raw_available_sum}`)
      lines.push(`    expected_drop_per_unit=${v.expected_drop_per_unit}`)
      if (v.components.length === 0) {
        lines.push('    components: []')
      } else {
        lines.push('    components:')
        v.components.forEach((c) => {
          lines.push(`      - inventory_item_id=${c.inventory_item_id} required_quantity=${c.required_quantity} available=${c.available_quantity} reserved=${c.reserved_quantity} stocked=${c.stocked_quantity} effective_units_for_component=${c.effective_units_for_component}`)
        })
      }
      if (v.issues.length > 0) {
        lines.push('    issues:')
        v.issues.forEach((i) => lines.push(`      - ${i}`))
      }
      if (v.recommendations.length > 0) {
        lines.push('    recommendations:')
        v.recommendations.forEach((r) => lines.push(`      - ${r}`))
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

;(async () => {
  try {
    console.log(`[audit] Base URL: ${BASE_URL}`)
    if (handleFilter) console.log(`[audit] Filtering by handle: ${handleFilter}`)
    if (limitFlag) console.log(`[audit] Limit: ${limitFlag}`)

    const products = await fetchAllProducts({ limit: limitFlag, handle: handleFilter })

    const report = products.map((p) => {
      const variant_audit = (p.variants || []).map(computeVariantAudit)
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        variant_audit,
      }
    })

    if (asJson) {
      console.log(JSON.stringify({ report }, null, 2))
    } else {
      console.log(formatReport(report))
    }

    // Quick summary of actionable items
    const actions = []
    for (const p of report) {
      for (const v of p.variant_audit) {
        if (v.recommendations.length > 0) {
          actions.push({ product: p.title, variant: v.title, variant_id: v.variant_id, recommendations: v.recommendations })
        }
      }
    }
    if (actions.length > 0) {
      console.log('[audit] Suggested changes:')
      actions.forEach((a) => {
        console.log(`- ${a.product} / ${a.variant} (${a.variant_id})`)
        a.recommendations.forEach((r) => console.log(`  * ${r}`))
      })
    } else {
      console.log('[audit] No obvious misconfigurations detected')
    }
  } catch (err) {
    console.error('[audit] Failed:', err)
    process.exit(1)
  }
})()

