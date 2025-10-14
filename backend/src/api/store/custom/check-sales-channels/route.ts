import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /store/custom/check-sales-channels
 * 
 * Check sales channel associations for troubleshooting inventory issues
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const salesChannelModuleService = req.scope.resolve(Modules.SALES_CHANNEL)
    const query = req.scope.resolve("query")

    // Get all sales channels
    const salesChannels = await salesChannelModuleService.listSalesChannels()

    const result: any = {
      sales_channels: [],
      location_id: "sloc_01K7EB91C00HF74G6YK24PEVCZ",
      variant_id: "variant_01K7E9CYW5C5NDZZ0WDQHCZ4M1"
    }

    // For each sales channel, get its locations
    for (const channel of salesChannels) {
      const channelInfo: any = {
        id: channel.id,
        name: channel.name,
        is_default: channel.is_default,
        locations: []
      }

      // Query for locations associated with this sales channel
      try {
        const locations: any = await query.graph(`
          query {
            sales_channel_location(where: {sales_channel_id: {eq: "${channel.id}"}}) {
              sales_channel_id
              location_id
            }
          }
        `)

        if (locations?.sales_channel_location) {
          channelInfo.locations = locations.sales_channel_location.map((l: any) => l.location_id)
          channelInfo.has_problem_location = channelInfo.locations.includes(result.location_id)
        }
      } catch (locError: any) {
        channelInfo.location_error = locError.message
      }

      result.sales_channels.push(channelInfo)
    }

    // Check what sales channel the publishable key is associated with
    const publishableKey = req.headers["x-publishable-api-key"] as string
    if (publishableKey) {
      try {
        const keyInfo: any = await query.graph(`
          query {
            api_key(where: {token: {eq: "${publishableKey}"}}) {
              id
              type
              title
            }
          }
        `)
        result.publishable_key_info = keyInfo?.api_key?.[0]

        if (result.publishable_key_info?.id) {
          // Get sales channels for this key
          const keyChannels: any = await query.graph(`
            query {
              api_key_sales_channel(where: {api_key_id: {eq: "${result.publishable_key_info.id}"}}) {
                api_key_id
                sales_channel_id
              }
            }
          `)
          result.publishable_key_sales_channels = keyChannels?.api_key_sales_channel?.map((kc: any) => kc.sales_channel_id) || []
        }
      } catch (keyError: any) {
        result.publishable_key_error = keyError.message
      }
    }

    res.json(result)
  } catch (error: any) {
    console.error("Error checking sales channels:", error)
    res.status(500).json({
      error: "Failed to check sales channels",
      message: error.message
    })
  }
}
