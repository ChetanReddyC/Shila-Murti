import { MedusaContainer } from "@medusajs/framework/utils"

/**
 * Apply complete fix for inventory sync issue
 * 
 * Run with: npx medusa exec ./src/scripts/apply-inventory-fix.ts
 */
export default async function applyInventoryFix({ container }: { container: MedusaContainer }) {
  console.log("\n🔧 Applying complete inventory sync fix...")

  try {
    // Get database connection via pgConnection service
    const pgConnection = container.resolve("pg_connection")
    const manager = pgConnection.getManager()

    // Step 1: Fix current out-of-sync inventory_level
    console.log("\n📊 Step 1: Fixing current inventory_level...")
    await manager.query(`
      UPDATE inventory_level
      SET reserved_quantity = (
          SELECT COALESCE(SUM(ri.quantity), 0)
          FROM reservation_item ri
          WHERE ri.inventory_item_id = inventory_level.inventory_item_id
          AND ri.location_id = inventory_level.location_id
      )
      WHERE inventory_item_id = 'iitem_01K7E93C5X154Y3PGC5X80PF7P'
    `)
    console.log("✅ Inventory level synced!")

    // Step 2: Verify the fix
    console.log("\n🔍 Step 2: Verifying fix...")
    const result = await manager.query(`
      SELECT 
          ii.sku,
          il.stocked_quantity,
          il.reserved_quantity,
          (il.stocked_quantity - il.reserved_quantity) as available,
          (SELECT COUNT(*) FROM reservation_item WHERE inventory_item_id = ii.id) as reservation_count,
          (SELECT COALESCE(SUM(quantity), 0) FROM reservation_item WHERE inventory_item_id = ii.id) as actual_reserved_sum
      FROM inventory_item ii
      JOIN inventory_level il ON ii.id = il.inventory_item_id
      WHERE ii.sku = 'PURE-BLACK-ABSTRACT'
    `)

    if (result && result.length > 0) {
      const inv = result[0]
      console.log("📦 Current Inventory Status:")
      console.log(`  SKU: ${inv.sku}`)
      console.log(`  Stocked: ${inv.stocked_quantity}`)
      console.log(`  Reserved (in inventory_level): ${inv.reserved_quantity}`)
      console.log(`  Reserved (actual sum): ${inv.actual_reserved_sum}`)
      console.log(`  Available: ${inv.available}`)
      console.log(`  Reservation count: ${inv.reservation_count}`)

      if (inv.reserved_quantity === inv.actual_reserved_sum) {
        console.log("✅ Reserved quantities are IN SYNC!")
      } else {
        console.log("❌ Reserved quantities are STILL OUT OF SYNC!")
      }
    }

    // Step 3: Create auto-sync trigger
    console.log("\n🔧 Step 3: Creating auto-sync trigger...")

    // Drop existing trigger if exists
    await manager.query(`DROP TRIGGER IF EXISTS sync_inventory_level_on_reservation_change ON reservation_item`)
    await manager.query(`DROP FUNCTION IF EXISTS sync_inventory_level_reserved_quantity()`)

    // Create sync function
    await manager.query(`
      CREATE OR REPLACE FUNCTION sync_inventory_level_reserved_quantity()
      RETURNS TRIGGER AS $$
      DECLARE
          affected_inventory_id TEXT;
          affected_location_id TEXT;
      BEGIN
          -- Determine which inventory item and location were affected
          IF (TG_OP = 'DELETE') THEN
              affected_inventory_id := OLD.inventory_item_id;
              affected_location_id := OLD.location_id;
          ELSE
              affected_inventory_id := NEW.inventory_item_id;
              affected_location_id := NEW.location_id;
          END IF;

          -- Update the inventory_level.reserved_quantity to match the sum of all reservations
          UPDATE inventory_level
          SET 
              reserved_quantity = (
                  SELECT COALESCE(SUM(quantity), 0)
                  FROM reservation_item
                  WHERE inventory_item_id = affected_inventory_id
                  AND location_id = affected_location_id
              ),
              updated_at = NOW()
          WHERE inventory_item_id = affected_inventory_id
          AND location_id = affected_location_id;

          IF (TG_OP = 'DELETE') THEN
              RETURN OLD;
          ELSE
              RETURN NEW;
          END IF;
      END;
      $$ LANGUAGE plpgsql;
    `)

    // Create trigger
    await manager.query(`
      CREATE TRIGGER sync_inventory_level_on_reservation_change
      AFTER INSERT OR UPDATE OR DELETE ON reservation_item
      FOR EACH ROW
      EXECUTE FUNCTION sync_inventory_level_reserved_quantity();
    `)

    console.log("✅ Auto-sync trigger created!")

    // Step 4: Verify trigger exists
    console.log("\n🔍 Step 4: Verifying trigger...")
    const triggerCheck = await manager.query(`
      SELECT 
        tgname as trigger_name,
        CASE tgenabled 
          WHEN 'O' THEN 'Enabled'
          ELSE 'Disabled'
        END as status
      FROM pg_trigger 
      WHERE tgrelid = 'reservation_item'::regclass
        AND tgname = 'sync_inventory_level_on_reservation_change'
    `)

    if (triggerCheck && triggerCheck.length > 0) {
      console.log(`✅ Trigger '${triggerCheck[0].trigger_name}' is ${triggerCheck[0].status}`)
    } else {
      console.log("⚠️  Could not verify trigger existence")
    }

    console.log("\n" + "=".repeat(50))
    console.log("✅ COMPLETE FIX APPLIED!")
    console.log("=".repeat(50))
    console.log("\nWhat was fixed:")
    console.log("  1. ✅ Synced inventory_level.reserved_quantity with actual reservations")
    console.log("  2. ✅ Created trigger to auto-sync on future reservation changes")
    console.log("\nNow when orders are placed:")
    console.log("  - Reservation will be created with correct quantity")
    console.log("  - inventory_level.reserved_quantity will auto-update")
    console.log("  - Product will show correct availability")
    console.log("")

  } catch (error: any) {
    console.error("\n❌ Error:", error.message)
    console.error(error.stack)
  }
}
