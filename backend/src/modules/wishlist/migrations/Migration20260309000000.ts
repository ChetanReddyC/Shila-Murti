import { Migration } from '@mikro-orm/migrations';

export class Migration20260309000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "wishlist_item" ("id" text not null, "customer_id" text not null, "product_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wishlist_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_item_customer_id" ON "wishlist_item" ("customer_id");`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_item_unique" ON "wishlist_item" ("customer_id", "product_id") WHERE "deleted_at" IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wishlist_item" cascade;`);
  }

}
