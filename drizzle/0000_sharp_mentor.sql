CREATE TYPE "user_role" AS ENUM ('user', 'admin');
CREATE TYPE "local_role" AS ENUM ('administrator', 'manager', 'attendant');
CREATE TYPE "table_status" AS ENUM ('free', 'occupied', 'partial');
CREATE TYPE "tab_status" AS ENUM ('open', 'closed');
CREATE TYPE "payment_method" AS ENUM ('pix', 'cash', 'debit', 'credit', 'other');
CREATE TYPE "stock_direction" AS ENUM ('in', 'out');
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"action" varchar(80) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" integer,
	"description" varchar(500) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" varchar(240) NOT NULL,
	"category" varchar(100) NOT NULL,
	"amountCents" integer NOT NULL,
	"method" "payment_method" DEFAULT 'pix' NOT NULL,
	"notes" text,
	"occurredAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"username" varchar(64) NOT NULL,
	"passwordHash" varchar(180) NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lounge_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"status" "table_status" DEFAULT 'free' NOT NULL,
	"activeTabId" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tabId" integer NOT NULL,
	"amountCents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"requestKey" varchar(80) NOT NULL,
	"receivedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_price_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"name" varchar(140) NOT NULL,
	"startTime" varchar(5) NOT NULL,
	"endTime" varchar(5) NOT NULL,
	"priceCents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(64) NOT NULL,
	"categoryId" integer,
	"unit" varchar(24) DEFAULT 'un' NOT NULL,
	"costCents" integer DEFAULT 0 NOT NULL,
	"priceCents" integer DEFAULT 0 NOT NULL,
	"stockQuantity" integer DEFAULT 0 NOT NULL,
	"minimumStock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"preventNegativeStock" boolean DEFAULT true NOT NULL,
	"allowManualDiscount" boolean DEFAULT true NOT NULL,
	"defaultDiscountPercent" integer DEFAULT 10 NOT NULL,
	"happyHourEnabled" boolean DEFAULT false NOT NULL,
	"happyHourStart" varchar(5) DEFAULT '17:00' NOT NULL,
	"happyHourEnd" varchar(5) DEFAULT '19:00' NOT NULL,
	"happyHourDiscountPercent" integer DEFAULT 10 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"direction" "stock_direction" NOT NULL,
	"reason" varchar(120) NOT NULL,
	"referenceType" varchar(60),
	"referenceId" integer,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tabId" integer NOT NULL,
	"productId" integer NOT NULL,
	"productName" varchar(160) NOT NULL,
	"quantity" integer NOT NULL,
	"baseUnitPriceCents" integer DEFAULT 0 NOT NULL,
	"unitPriceCents" integer NOT NULL,
	"unitCostCents" integer NOT NULL,
	"discountPercent" integer DEFAULT 0 NOT NULL,
	"discountReason" varchar(120),
	"note" varchar(500),
	"addedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tableId" integer NOT NULL,
	"tabCode" varchar(24) NOT NULL,
	"status" "tab_status" DEFAULT 'open' NOT NULL,
	"openedBy" integer NOT NULL,
	"openedAt" timestamp DEFAULT now() NOT NULL,
	"closedAt" timestamp,
	"closedBy" integer,
	"discountPercent" integer DEFAULT 0 NOT NULL,
	"discountCents" integer DEFAULT 0 NOT NULL,
	"tipPercent" integer DEFAULT 0 NOT NULL,
	"tipCents" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"localRole" "local_role" DEFAULT 'attendant' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_credentials" ADD CONSTRAINT "local_credentials_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_sessions" ADD CONSTRAINT "local_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tabId_tabs_id_fk" FOREIGN KEY ("tabId") REFERENCES "public"."tabs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedBy_users_id_fk" FOREIGN KEY ("receivedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_rules" ADD CONSTRAINT "product_price_rules_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_rules" ADD CONSTRAINT "product_price_rules_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_product_categories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_items" ADD CONSTRAINT "tab_items_tabId_tabs_id_fk" FOREIGN KEY ("tabId") REFERENCES "public"."tabs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_items" ADD CONSTRAINT "tab_items_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_items" ADD CONSTRAINT "tab_items_addedBy_users_id_fk" FOREIGN KEY ("addedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_tableId_lounge_tables_id_fk" FOREIGN KEY ("tableId") REFERENCES "public"."lounge_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_openedBy_users_id_fk" FOREIGN KEY ("openedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabs" ADD CONSTRAINT "tabs_closedBy_users_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "expenses_occurred_idx" ON "expenses" USING btree ("occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "local_credentials_user_id_unique" ON "local_credentials" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "local_credentials_username_unique" ON "local_credentials" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "local_sessions_token_unique" ON "local_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "local_sessions_user_idx" ON "local_sessions" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "lounge_tables_number_unique" ON "lounge_tables" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_request_key_unique" ON "payments" USING btree ("requestKey");--> statement-breakpoint
CREATE INDEX "payments_tab_idx" ON "payments" USING btree ("tabId");--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_unique" ON "product_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_price_rules_product_idx" ON "product_price_rules" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "product_price_rules_active_idx" ON "product_price_rules" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_unique" ON "products" USING btree ("code");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "products_active_idx" ON "products" USING btree ("active");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX "tab_items_tab_product_unique" ON "tab_items" USING btree ("tabId","productId");--> statement-breakpoint
CREATE INDEX "tab_items_tab_idx" ON "tab_items" USING btree ("tabId");--> statement-breakpoint
CREATE UNIQUE INDEX "tabs_code_unique" ON "tabs" USING btree ("tabCode");--> statement-breakpoint
CREATE INDEX "tabs_table_status_idx" ON "tabs" USING btree ("tableId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_user_id_unique" ON "user_profiles" USING btree ("userId");