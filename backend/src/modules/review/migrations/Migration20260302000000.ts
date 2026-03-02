import { Migration } from '@mikro-orm/migrations';

export class Migration20260302000000 extends Migration {

  override async up(): Promise<void> {
    // Index on product_id — primary query path for fetching reviews by product
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_product_id" ON "product_review" ("product_id");`);

    // Index on customer_id — used for duplicate checks and customer enrichment
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_customer_id" ON "product_review" ("customer_id");`);

    // Compound partial unique constraint — prevents duplicate reviews atomically
    // Only enforced on non-deleted rows (deleted_at IS NULL)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_review_unique_customer_product" ON "product_review" ("product_id", "customer_id") WHERE "deleted_at" IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_product_review_unique_customer_product";`);
    this.addSql(`DROP INDEX IF EXISTS "IDX_product_review_customer_id";`);
    this.addSql(`DROP INDEX IF EXISTS "IDX_product_review_product_id";`);
  }

}
