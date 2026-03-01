import { model } from "@medusajs/framework/utils"

/**
 * ProductReview data model
 *
 * Stored as a standalone module table rather than a Medusa FK because
 * Medusa v2 product tables live in the framework-managed schema.
 * Using `product_id` as an indexed string avoids tight coupling while
 * still allowing fast lookups per product.
 */
const ProductReview = model.define("product_review", {
    id: model.id().primaryKey(),
    product_id: model.text(),
    customer_id: model.text(),
    author_name: model.text(),
    rating: model.number(),
    content: model.text(),
})

export default ProductReview
