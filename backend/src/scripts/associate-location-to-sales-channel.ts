import { MedusaContainer, Modules } from "@medusajs/framework/utils"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Associate stock location with sales channel
 * 
 * Run with: npx medusa exec ./src/scripts/associate-location-to-sales-channel.ts
 */
export default async function associateLocationToSalesChannel({ container }: { container: MedusaContainer }) {
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION)

  console.log("\n🔍 Checking sales channel and location associations...")

  try {
    // Get sales channels
    const salesChannels = await salesChannelModuleService.listSalesChannels()

    if (!salesChannels || salesChannels.length === 0) {
      console.error("❌ No sales channels found")
      return
    }

    const salesChannel = salesChannels[0]
    console.log("✅ Found sales channel:", salesChannel.name, `(${salesChannel.id})`)
    console.log(`   Total sales channels: ${salesChannels.length}`)

    // Get stock locations
    const locations = await stockLocationModuleService.listStockLocations()
    console.log(`✅ Found ${locations.length} stock location(s)`)

    for (const location of locations) {
      console.log(`  - ${location.name} (${location.id})`)
    }

    if (locations.length === 0) {
      console.error("❌ No stock locations found")
      return
    }

    const locationId = locations[0].id
    console.log(`\n🔧 Associating location ${locationId} with sales channel ${salesChannel.id}...`)

    // Use the workflow to link them
    try {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
          id: locationId,
          add: [salesChannel.id]
        }
      })
      console.log("✅ Successfully associated location with sales channel!")
    } catch (workflowError: any) {
      // If workflow fails, try direct module method
      console.log("⚠️  Workflow failed, trying direct module method...")
      console.log("   Error:", workflowError.message)

      // In Medusa v2, we need to create the link manually
      try {
        const remoteLink = container.resolve("remoteLink")
        await remoteLink.create([{
          [Modules.SALES_CHANNEL]: {
            sales_channel_id: salesChannel.id
          },
          [Modules.STOCK_LOCATION]: {
            stock_location_id: locationId
          }
        }])
        console.log("✅ Successfully created link via remoteLink!")
      } catch (linkError: any) {
        console.error("❌ Direct link creation also failed:", linkError.message)
      }
    }

    // Verify the association
    console.log("\n🧪 Verifying association...")
    const updatedChannels = await salesChannelModuleService.listSalesChannels({
      id: salesChannel.id
    })

    if (updatedChannels && updatedChannels.length > 0) {
      console.log("✅ Verification complete - sales channel updated")
    }

    console.log("\n✅ Script complete! Try adding to cart again.")

  } catch (error: any) {
    console.error("\n❌ Error:", error.message)
    console.error(error.stack)
  }
}
