import {
  boolean,
  index,
  serial,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";


const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
const localRoleEnum = pgEnum("local_role", ["administrator", "manager", "attendant"]);
const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "partial"]);
const tabStatusEnum = pgEnum("tab_status", ["open", "closed"]);
const paymentMethodEnum = pgEnum("payment_method", ["pix", "cash", "debit", "credit", "other"]);
const stockDirectionEnum = pgEnum("stock_direction", ["in", "out"]);

/** Core OAuth identity table managed by the template. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    localRole: localRoleEnum("localRole")
      .default("attendant")
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_profiles_user_id_unique").on(table.userId)],
);

export const localCredentials = pgTable(
  "local_credentials",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    username: varchar("username", { length: 64 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 180 }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("local_credentials_user_id_unique").on(table.userId),
    uniqueIndex("local_credentials_username_unique").on(table.username),
  ],
);

export const localSessions = pgTable(
  "local_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("local_sessions_token_unique").on(table.token),
    index("local_sessions_user_idx").on(table.userId),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("product_categories_name_unique").on(table.name)],
);

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    categoryId: integer("categoryId").references(() => productCategories.id),
    unit: varchar("unit", { length: 24 }).default("un").notNull(),
    costCents: integer("costCents").default(0).notNull(),
    priceCents: integer("priceCents").default(0).notNull(),
    stockQuantity: integer("stockQuantity").default(0).notNull(),
    minimumStock: integer("minimumStock").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("products_code_unique").on(table.code),
    index("products_category_idx").on(table.categoryId),
    index("products_active_idx").on(table.active),
  ],
);

export const productPriceRules = pgTable(
  "product_price_rules",
  {
    id: serial("id").primaryKey(),
    productId: integer("productId").notNull().references(() => products.id),
    name: varchar("name", { length: 140 }).notNull(),
    startTime: varchar("startTime", { length: 5 }).notNull(),
    endTime: varchar("endTime", { length: 5 }).notNull(),
    priceCents: integer("priceCents").notNull(),
    active: boolean("active").default(true).notNull(),
    createdBy: integer("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("product_price_rules_product_idx").on(table.productId), index("product_price_rules_active_idx").on(table.active)],
);

export const loungeTables = pgTable(
  "lounge_tables",
  {
    id: serial("id").primaryKey(),
    number: integer("number").notNull(),
    status: tableStatusEnum("status").default("free").notNull(),
    activeTabId: integer("activeTabId"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("lounge_tables_number_unique").on(table.number)],
);

export const tabs = pgTable(
  "tabs",
  {
    id: serial("id").primaryKey(),
    tableId: integer("tableId").notNull().references(() => loungeTables.id),
    tabCode: varchar("tabCode", { length: 24 }).notNull(),
    customerName: varchar("customerName", { length: 120 }),
    status: tabStatusEnum("status").default("open").notNull(),
    openedBy: integer("openedBy").notNull().references(() => users.id),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    closedBy: integer("closedBy").references(() => users.id),
    discountPercent: integer("discountPercent").default(0).notNull(),
    discountCents: integer("discountCents").default(0).notNull(),
    tipPercent: integer("tipPercent").default(0).notNull(),
    tipCents: integer("tipCents").default(0).notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("tabs_code_unique").on(table.tabCode),
    index("tabs_table_status_idx").on(table.tableId, table.status),
  ],
);

export const tabItems = pgTable(
  "tab_items",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tabId").notNull().references(() => tabs.id),
    productId: integer("productId").notNull().references(() => products.id),
    productName: varchar("productName", { length: 160 }).notNull(),
    quantity: integer("quantity").notNull(),
    baseUnitPriceCents: integer("baseUnitPriceCents").default(0).notNull(),
    unitPriceCents: integer("unitPriceCents").notNull(),
    unitCostCents: integer("unitCostCents").notNull(),
    discountPercent: integer("discountPercent").default(0).notNull(),
    discountReason: varchar("discountReason", { length: 120 }),
    note: varchar("note", { length: 500 }),
    addedBy: integer("addedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tab_items_tab_product_unique").on(table.tabId, table.productId),
    index("tab_items_tab_idx").on(table.tabId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tabId").notNull().references(() => tabs.id),
    amountCents: integer("amountCents").notNull(),
    method: paymentMethodEnum("method").notNull(),
    requestKey: varchar("requestKey", { length: 80 }).notNull(),
    receivedBy: integer("receivedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payments_request_key_unique").on(table.requestKey),
    index("payments_tab_idx").on(table.tabId),
    index("payments_created_idx").on(table.createdAt),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("productId").notNull().references(() => products.id),
    quantity: integer("quantity").notNull(),
    direction: stockDirectionEnum("direction").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    referenceType: varchar("referenceType", { length: 60 }),
    referenceId: integer("referenceId"),
    createdBy: integer("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("stock_movements_product_idx").on(table.productId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    description: varchar("description", { length: 240 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    amountCents: integer("amountCents").notNull(),
    method: paymentMethodEnum("method").default("pix").notNull(),
    notes: text("notes"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdBy: integer("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("expenses_occurred_idx").on(table.occurredAt)],
);

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  preventNegativeStock: boolean("preventNegativeStock").default(true).notNull(),
  maxTables: integer("maxTables").default(20).notNull(),
  allowManualDiscount: boolean("allowManualDiscount").default(true).notNull(),
  defaultDiscountPercent: integer("defaultDiscountPercent").default(10).notNull(),
  happyHourEnabled: boolean("happyHourEnabled").default(false).notNull(),
  happyHourStart: varchar("happyHourStart", { length: 5 }).default("17:00").notNull(),
  happyHourEnd: varchar("happyHourEnd", { length: 5 }).default("19:00").notNull(),
  happyHourDiscountPercent: integer("happyHourDiscountPercent").default(10).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: integer("entityId"),
    description: varchar("description", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("audit_logs_created_idx").on(table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
