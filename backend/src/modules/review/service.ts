import { MedusaService } from "@medusajs/framework/utils"
import ProductReview from "./models/review"

/**
 * ReviewModuleService
 *
 * Extends MedusaService to automatically generate standard CRUD
 * operations (listProductReviews, createProductReviews, etc.)
 * for the ProductReview entity.
 */
class ReviewModuleService extends MedusaService({
    ProductReview,
}) { }

export default ReviewModuleService
