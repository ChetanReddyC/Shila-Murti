import { MedusaService } from "@medusajs/framework/utils"
import WishlistItem from "./models/wishlist"

class WishlistModuleService extends MedusaService({
    WishlistItem,
}) { }

export default WishlistModuleService
