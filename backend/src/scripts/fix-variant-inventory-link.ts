import { MedusaContainer, Modules } from "@medusajs/framework/utils"

/**
 * Script to fix variant-inventory item associations
 * 
 * Run with: npx medusa exec ./src/scripts/fix-variant-inventory-link.ts
 */
export default async function fixVariantInventoryLink({ container }: { container: MedusaContainer }) {
  const productModuleService = container.resolve(Modules.PRODUCT)
  const inventoryModuleService = container.resolve(Modules.INVENTORY)
  const query = container.resolve("query")

  const variantId = "variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1"
  const inventoryItemId = "iitem_01K7E93C5X154Y3PGC5X80PF7P"
  const locationId = "sloc_01K7EB91C00HF74G6YK24PEVCZ"

  console.log("\n🔍 Checking variant-inventory associations...")

  try {
    // Get variant
    const variants = await productModuleService.listProductVariants({ id: variantId })
    if (!variants || variants.length === 0) {
      console.error("❌ Variant not found")
      return
    }
    const variant = variants[0]
    console.log("✅ Variant found:", variant.sku)

    // Get inventory item
    const inventoryItems = await inventoryModuleService.listInventoryItems({ id: inventoryItemId })
    if (!inventoryItems || inventoryItems.length === 0) {
      console.error("❌ Inventory item not found")
      return
    }
    const inventoryItem = inventoryItems[0]
    console.log("✅ Inventory item found:", inventoryItem.sku)

    // Check current inventory levels
    const levels = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: locationId
    })
    
    if (levels && levels.length > 0) {
      console.log("📊 Current inventory level:")
      console.log("  - Stocked:", levels[0].stocked_quantity)
      console.log("  - Reserved:", levels[0].reserved_quantity)
      console.log("  - Available:", levels[0].available_quantity)
    }

    // Check existing links in database
    console.log("\n🔗 Checking variant-inventory links in database...")
    try {
      const result: any = await query.graph(`
        query {
          product_variant_inventory_item(
            where: {
              variant_id: {eq: "${variantId}"}
              inventory_item_id: {eq: "${inventoryItemId}"}
            }
          ) {
            variant_id
            inventory_item_id
            required_quantity
          }
        }
      `)
      
      if (result?.product_variant_inventory_item && result.product_variant_inventory_item.length > 0) {
        console.log("✅ Link exists in database")
        console.log("   Required quantity:", result.product_variant_inventory_item[0].required_quantity)
      } else {
        console.log("⚠️  Link NOT found in database")
        console.log("   This might be why Medusa returns 0 availability!")
      }

    } catch (linkError: any) {
      console.error("❌ Error checking links:", linkError.message)
    }

    // Try availability check
    console.log("\n🧪 Testing availability...")
    try {
      const available = await inventoryModuleService.retrieveAvailableQuantity(
        inventoryItemId,
        [locationId]
      )
      console.log("📊 Medusa availability check result:", available)
    } catch (availError: any) {
      console.error("❌ Availability check error:", availError.message)
    }

    console.log("\n✅ Script complete!")

  } catch (error: any) {
    console.error("\n❌ Error:", error.message)
    console.error(error.stack)
  }
}
