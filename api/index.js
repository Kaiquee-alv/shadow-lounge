// server/app.ts
import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto.map(String) : forwardedProto.split(",");
  return protoList.some(
    (proto) => proto.trim().toLowerCase() === "https"
  );
}
function getSessionCookieOptions(req) {
  return {
    domain: void 0,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/db.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// drizzle/schema.ts
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
  varchar
} from "drizzle-orm/pg-core";
var userRoleEnum = pgEnum("user_role", ["user", "admin"]);
var localRoleEnum = pgEnum("local_role", ["administrator", "manager", "attendant"]);
var tableStatusEnum = pgEnum("table_status", ["free", "occupied", "partial"]);
var tabStatusEnum = pgEnum("tab_status", ["open", "closed"]);
var paymentMethodEnum = pgEnum("payment_method", ["pix", "cash", "debit", "credit", "other"]);
var stockDirectionEnum = pgEnum("stock_direction", ["in", "out"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var userProfiles = pgTable(
  "user_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    localRole: localRoleEnum("localRole").default("attendant").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("user_profiles_user_id_unique").on(table.userId)]
);
var localCredentials = pgTable(
  "local_credentials",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    username: varchar("username", { length: 64 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 180 }).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("local_credentials_user_id_unique").on(table.userId),
    uniqueIndex("local_credentials_username_unique").on(table.username)
  ]
);
var localSessions = pgTable(
  "local_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("local_sessions_token_unique").on(table.token),
    index("local_sessions_user_idx").on(table.userId)
  ]
);
var productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("product_categories_name_unique").on(table.name)]
);
var products = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("products_code_unique").on(table.code),
    index("products_category_idx").on(table.categoryId),
    index("products_active_idx").on(table.active)
  ]
);
var productPriceRules = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("product_price_rules_product_idx").on(table.productId), index("product_price_rules_active_idx").on(table.active)]
);
var loungeTables = pgTable(
  "lounge_tables",
  {
    id: serial("id").primaryKey(),
    number: integer("number").notNull(),
    status: tableStatusEnum("status").default("free").notNull(),
    activeTabId: integer("activeTabId"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("lounge_tables_number_unique").on(table.number)]
);
var tabs = pgTable(
  "tabs",
  {
    id: serial("id").primaryKey(),
    tableId: integer("tableId").notNull().references(() => loungeTables.id),
    tabCode: varchar("tabCode", { length: 24 }).notNull(),
    status: tabStatusEnum("status").default("open").notNull(),
    openedBy: integer("openedBy").notNull().references(() => users.id),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    closedBy: integer("closedBy").references(() => users.id),
    discountPercent: integer("discountPercent").default(0).notNull(),
    discountCents: integer("discountCents").default(0).notNull(),
    tipPercent: integer("tipPercent").default(0).notNull(),
    tipCents: integer("tipCents").default(0).notNull(),
    version: integer("version").default(1).notNull()
  },
  (table) => [
    uniqueIndex("tabs_code_unique").on(table.tabCode),
    index("tabs_table_status_idx").on(table.tableId, table.status)
  ]
);
var tabItems = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("tab_items_tab_product_unique").on(table.tabId, table.productId),
    index("tab_items_tab_idx").on(table.tabId)
  ]
);
var payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tabId").notNull().references(() => tabs.id),
    amountCents: integer("amountCents").notNull(),
    method: paymentMethodEnum("method").notNull(),
    requestKey: varchar("requestKey", { length: 80 }).notNull(),
    receivedBy: integer("receivedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("payments_request_key_unique").on(table.requestKey),
    index("payments_tab_idx").on(table.tabId),
    index("payments_created_idx").on(table.createdAt)
  ]
);
var stockMovements = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("stock_movements_product_idx").on(table.productId)]
);
var expenses = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("expenses_occurred_idx").on(table.occurredAt)]
);
var settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  preventNegativeStock: boolean("preventNegativeStock").default(true).notNull(),
  allowManualDiscount: boolean("allowManualDiscount").default(true).notNull(),
  defaultDiscountPercent: integer("defaultDiscountPercent").default(10).notNull(),
  happyHourEnabled: boolean("happyHourEnabled").default(false).notNull(),
  happyHourStart: varchar("happyHourStart", { length: 5 }).default("17:00").notNull(),
  happyHourEnd: varchar("happyHourEnd", { length: 5 }).default("19:00").notNull(),
  happyHourDiscountPercent: integer("happyHourDiscountPercent").default(10).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: integer("entityId"),
    description: varchar("description", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("audit_logs_created_idx").on(table.createdAt)]
);

// server/db.ts
var _db = null;
var _pool = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const connectionString = process.env.DATABASE_URL;
      const useSsl = /neon\.tech|sslmode=require/i.test(connectionString);
      _pool = new Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : void 0, max: 5 });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  for (const field of ["name", "email", "loginMethod"]) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? /* @__PURE__ */ new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
var categoriesSeed = [
  "Cervejas",
  "Bebidas",
  "Destilados",
  "Refrigerantes",
  "Energ\xE9ticos",
  "Narguil\xE9",
  "Ess\xEAncias",
  "Carv\xF5es",
  "Petiscos",
  "Outros"
];
var productsSeed = [
  { name: "Heineken Long Neck", code: "HEI-330", category: "Cervejas", cost: 850, price: 1500, stock: 48, minimum: 12 },
  { name: "Budweiser Long Neck", code: "BUD-330", category: "Cervejas", cost: 650, price: 1200, stock: 36, minimum: 10 },
  { name: "Red Bull", code: "RED-250", category: "Energ\xE9ticos", cost: 900, price: 1800, stock: 17, minimum: 12 },
  { name: "Coca-Cola Lata", code: "COCA-350", category: "Refrigerantes", cost: 380, price: 700, stock: 62, minimum: 15 },
  { name: "Narguil\xE9 Premium", code: "NARG-PRM", category: "Narguil\xE9", cost: 1100, price: 4500, stock: 20, minimum: 4 },
  { name: "Ess\xEAncia Mint Ice", code: "ESS-MINT", category: "Ess\xEAncias", cost: 900, price: 2200, stock: 8, minimum: 10 },
  { name: "Carv\xE3o C\xFAbico", code: "CARV-1", category: "Carv\xF5es", cost: 450, price: 1200, stock: 28, minimum: 8 },
  { name: "Por\xE7\xE3o da Casa", code: "PET-001", category: "Petiscos", cost: 1500, price: 3900, stock: 14, minimum: 5 }
];
async function ensureInitialData() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(loungeTables).values(Array.from({ length: 20 }, (_, index2) => ({ number: index2 + 1 }))).onConflictDoNothing({ target: loungeTables.number });
  await db.insert(productCategories).values(categoriesSeed.map((name) => ({ name }))).onConflictDoUpdate({
    target: productCategories.name,
    set: { active: true }
  });
  await db.insert(settings).values({ id: 1, preventNegativeStock: true }).onConflictDoNothing({ target: settings.id });
  const categories = await db.select().from(productCategories);
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));
  for (const product of productsSeed) {
    await db.insert(products).values({
      name: product.name,
      code: product.code,
      categoryId: categoryByName.get(product.category),
      costCents: product.cost,
      priceCents: product.price,
      stockQuantity: product.stock,
      minimumStock: product.minimum
    }).onConflictDoUpdate({ target: products.code, set: { code: product.code } });
  }
}
async function getLocalRole(userId, systemRole) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (profile[0]) {
    if (systemRole === "admin" && (profile[0].localRole !== "administrator" || !profile[0].active)) {
      await db.update(userProfiles).set({ localRole: "administrator", active: true }).where(eq(userProfiles.id, profile[0].id));
      return { ...profile[0], localRole: "administrator", active: true };
    }
    return profile[0];
  }
  const localRole2 = systemRole === "admin" ? "administrator" : "attendant";
  await db.insert(userProfiles).values({ userId, localRole: localRole2 });
  const created = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return created[0];
}
async function writeAudit(userId, action, entityType, entityId, description) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ userId, action, entityType, entityId, description });
}
function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}
function validatePassword(password, storedHash) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
async function getLocalUserFromSession(token) {
  const db = await getDb();
  if (!db || !token) return null;
  const result = await db.select({
    id: users.id,
    openId: users.openId,
    name: users.name,
    email: users.email,
    loginMethod: users.loginMethod,
    role: users.role,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    lastSignedIn: users.lastSignedIn,
    expiresAt: localSessions.expiresAt
  }).from(localSessions).innerJoin(users, eq(localSessions.userId, users.id)).where(eq(localSessions.token, token)).limit(1);
  if (!result[0] || result[0].expiresAt.getTime() < Date.now()) return null;
  const { expiresAt: _expiresAt, ...user } = result[0];
  return user;
}
function normalizeUsername(username) {
  return username.trim().toLowerCase();
}
var FIXED_USERS = [
  {
    username: "atendente",
    name: "Atendente",
    password: process.env.FIXED_ATTENDANT_PASSWORD ?? "v7Xc6Rbc64dVgmZtPhR7NCt_",
    localRole: "attendant"
  },
  {
    username: "gerente",
    name: "Gerente",
    password: process.env.FIXED_MANAGER_PASSWORD ?? "UZlNDUD8YPkacwEvCB2eQnpZ",
    localRole: "manager"
  }
];
async function ensureFixedUsers() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  for (const fixedUser of FIXED_USERS) {
    const openId = `fixed-${fixedUser.username}`;
    const passwordHash = hashPassword(fixedUser.password);
    await db.insert(users).values({
      openId,
      name: fixedUser.name,
      loginMethod: "local-fixed",
      role: "user"
    }).onConflictDoUpdate({
      target: users.openId,
      set: { name: fixedUser.name, loginMethod: "local-fixed", updatedAt: /* @__PURE__ */ new Date() }
    });
    const user = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    const userId = user[0]?.id;
    if (!userId) throw new Error(`N\xE3o foi poss\xEDvel criar o usu\xE1rio fixo ${fixedUser.username}`);
    await db.insert(userProfiles).values({ userId, localRole: fixedUser.localRole, active: true }).onConflictDoUpdate({
      target: userProfiles.userId,
      set: { localRole: fixedUser.localRole, active: true, updatedAt: /* @__PURE__ */ new Date() }
    });
    await db.insert(localCredentials).values({
      userId,
      username: fixedUser.username,
      passwordHash
    }).onConflictDoUpdate({
      target: localCredentials.username,
      set: { userId, passwordHash, updatedAt: /* @__PURE__ */ new Date() }
    });
  }
}
async function createLocalSession(userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 1e3 * 60 * 60 * 12);
  await db.insert(localSessions).values({ userId, token, expiresAt });
  return { token, expiresAt };
}
async function registerLocally(input) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const username = normalizeUsername(input.username);
  const existing = await db.select({ id: localCredentials.id }).from(localCredentials).where(eq(localCredentials.username, username)).limit(1);
  if (existing[0]) return null;
  const result = await db.transaction(async (tx) => {
    const insertedUser = await tx.insert(users).values({
      openId: `local-${randomBytes(24).toString("hex")}`,
      name: input.name.trim(),
      loginMethod: "local",
      role: "user"
    }).returning({ id: users.id });
    const userId = Number(insertedUser[0].id);
    await tx.insert(userProfiles).values({ userId, localRole: "attendant", active: true });
    await tx.insert(localCredentials).values({
      userId,
      username,
      passwordHash: hashPassword(input.password)
    });
    return userId;
  });
  return createLocalSession(result);
}
async function loginLocally(username, password) {
  await ensureInitialData();
  await ensureFixedUsers();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const credential = await db.select({
    userId: localCredentials.userId,
    passwordHash: localCredentials.passwordHash
  }).from(localCredentials).where(eq(localCredentials.username, normalizeUsername(username))).limit(1);
  if (!credential[0] || !validatePassword(password, credential[0].passwordHash)) return null;
  return createLocalSession(credential[0].userId);
}
function centsOf(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}
function tabTotals(items, tab) {
  const subtotalCents = centsOf(items);
  const discountCents = 0;
  const tipCents = tab.tipCents ?? Math.round(subtotalCents * (tab.tipPercent ?? 0) / 100);
  return { subtotalCents, discountCents, tipCents, totalCents: subtotalCents + tipCents };
}
function timeInWindow(currentMinutes, startTime, endTime) {
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return start <= end ? currentMinutes >= start && currentMinutes <= end : currentMinutes >= start || currentMinutes <= end;
}
async function listTables() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const tableRows = await db.select().from(loungeTables).orderBy(asc(loungeTables.number));
  const openTabs = await db.select().from(tabs).where(eq(tabs.status, "open"));
  const tabIds = openTabs.map((tab) => tab.id);
  const [allItems, allPayments] = tabIds.length ? await Promise.all([
    db.select().from(tabItems).where(inArray(tabItems.tabId, tabIds)),
    db.select().from(payments).where(inArray(payments.tabId, tabIds))
  ]) : [[], []];
  const tabsByTable = new Map(openTabs.map((tab) => [tab.tableId, tab]));
  return tableRows.map((table) => {
    const tab = tabsByTable.get(table.id);
    const items = tab ? allItems.filter((item) => item.tabId === tab.id) : [];
    const paid = tab ? allPayments.filter((payment) => payment.tabId === tab.id).reduce((sum, payment) => sum + payment.amountCents, 0) : 0;
    const total = tab ? tabTotals(items, tab).totalCents : 0;
    const balance = Math.max(total - paid, 0);
    const computedStatus = !tab ? "free" : paid > 0 && balance > 0 ? "partial" : "occupied";
    return {
      id: table.id,
      number: table.number,
      status: computedStatus,
      tabId: tab?.id ?? null,
      tabCode: tab?.tabCode ?? null,
      openedAt: tab?.openedAt ?? null,
      totalCents: total,
      paidCents: paid,
      balanceCents: balance
    };
  });
}
async function getTabDetails(tabId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const tab = await db.select({
    id: tabs.id,
    tabCode: tabs.tabCode,
    status: tabs.status,
    openedAt: tabs.openedAt,
    closedAt: tabs.closedAt,
    discountPercent: tabs.discountPercent,
    discountCents: tabs.discountCents,
    tipPercent: tabs.tipPercent,
    tipCents: tabs.tipCents,
    tableNumber: loungeTables.number,
    tableId: loungeTables.id,
    openedByName: users.name
  }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).leftJoin(users, eq(tabs.openedBy, users.id)).where(eq(tabs.id, tabId)).limit(1);
  if (!tab[0]) throw new Error("Comanda n\xE3o encontrada");
  const [items, paymentRows] = await Promise.all([
    db.select({
      id: tabItems.id,
      productId: tabItems.productId,
      productName: tabItems.productName,
      quantity: tabItems.quantity,
      baseUnitPriceCents: tabItems.baseUnitPriceCents,
      unitPriceCents: tabItems.unitPriceCents,
      unitCostCents: tabItems.unitCostCents,
      discountPercent: tabItems.discountPercent,
      discountReason: tabItems.discountReason,
      note: tabItems.note,
      createdAt: tabItems.createdAt
    }).from(tabItems).where(eq(tabItems.tabId, tabId)).orderBy(desc(tabItems.createdAt)),
    db.select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      createdAt: payments.createdAt,
      receivedByName: users.name
    }).from(payments).leftJoin(users, eq(payments.receivedBy, users.id)).where(eq(payments.tabId, tabId)).orderBy(desc(payments.createdAt))
  ]);
  const totals = tabTotals(items, tab[0]);
  const totalCents = totals.totalCents;
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...tab[0], items, payments: paymentRows, ...totals, paidCents, balanceCents: Math.max(totalCents - paidCents, 0) };
}
async function openTab(tableId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const changed = await tx.update(loungeTables).set({ status: "occupied" }).where(and(eq(loungeTables.id, tableId), eq(loungeTables.status, "free")));
    const affected = changed.rowCount ?? 0;
    if (affected !== 1) throw new Error("Esta mesa j\xE1 possui uma comanda aberta");
    const inserted = await tx.insert(tabs).values({ tableId, tabCode: `ABERTA-${Date.now()}`, openedBy: userId }).returning({ id: tabs.id });
    const tabId = Number(inserted[0].id);
    const tabCode = `#${String(tabId).padStart(6, "0")}`;
    await tx.update(tabs).set({ tabCode }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ activeTabId: tabId, status: "occupied" }).where(eq(loungeTables.id, tableId));
    await tx.insert(auditLogs).values({ userId, action: "OPEN_TAB", entityType: "tab", entityId: tabId, description: `Abriu a comanda ${tabCode}` });
    return { id: tabId, tabCode };
  });
}
async function transferTab(tabId, destinationTableId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    if (tab[0].tableId === destinationTableId) throw new Error("Escolha uma mesa diferente da atual");
    await tx.execute(sql`SELECT id FROM lounge_tables WHERE id = ${destinationTableId} FOR UPDATE`);
    const destination = await tx.select().from(loungeTables).where(eq(loungeTables.id, destinationTableId)).limit(1);
    if (!destination[0]) throw new Error("Mesa de destino n\xE3o encontrada");
    if (destination[0].status !== "free" || destination[0].activeTabId) throw new Error("A mesa de destino j\xE1 est\xE1 ocupada");
    await tx.update(tabs).set({ tableId: destinationTableId, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ status: "free", activeTabId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.update(loungeTables).set({ status: "occupied", activeTabId: tabId, updatedAt: /* @__PURE__ */ new Date() }).where(eq(loungeTables.id, destinationTableId));
    await tx.insert(auditLogs).values({
      userId,
      action: "TRANSFER_TAB",
      entityType: "tab",
      entityId: tabId,
      description: `Transferiu a comanda ${tab[0].tabCode} para a mesa ${destination[0].number}`
    });
    return { tabId, tableId: destinationTableId, tableNumber: destination[0].number };
  });
}
async function addTabItem(input, userId, localRole2) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    await tx.execute(sql`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product[0] || !product[0].active) throw new Error("Produto indispon\xEDvel");
    const systemSettings = await tx.select().from(settings).limit(1);
    if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < input.quantity) throw new Error("Estoque insuficiente para este lan\xE7amento");
    const now = /* @__PURE__ */ new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduledRules = await tx.select().from(productPriceRules).where(and(eq(productPriceRules.productId, input.productId), eq(productPriceRules.active, true)));
    const scheduledRule = scheduledRules.find((rule) => timeInWindow(currentMinutes, rule.startTime, rule.endTime));
    const scheduledPriceCents = scheduledRule?.priceCents ?? product[0].priceCents;
    const happyHourActive = Boolean(
      systemSettings[0]?.happyHourEnabled && timeInWindow(
        currentMinutes,
        systemSettings[0]?.happyHourStart ?? "17:00",
        systemSettings[0]?.happyHourEnd ?? "19:00"
      )
    );
    const configuredDiscount = Number(systemSettings[0]?.happyHourDiscountPercent ?? 0);
    const discountPercent = happyHourActive ? Math.min(100, Math.max(0, configuredDiscount)) : 0;
    const unitPriceCents = Math.round(scheduledPriceCents * (100 - discountPercent) / 100);
    const discountReason = happyHourActive ? `Happy Hour${scheduledRule ? ` + ${scheduledRule.name}` : ""}` : scheduledRule?.name ?? null;
    await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} - ${input.quantity}` }).where(eq(products.id, input.productId));
    const existing = await tx.select().from(tabItems).where(and(eq(tabItems.tabId, input.tabId), eq(tabItems.productId, input.productId))).limit(1);
    if (existing[0]) {
      await tx.update(tabItems).set({
        quantity: sql`${tabItems.quantity} + ${input.quantity}`,
        unitPriceCents,
        discountPercent,
        discountReason,
        note: input.note ?? existing[0].note
      }).where(eq(tabItems.id, existing[0].id));
    } else {
      await tx.insert(tabItems).values({
        tabId: input.tabId,
        productId: product[0].id,
        productName: product[0].name,
        quantity: input.quantity,
        baseUnitPriceCents: product[0].priceCents,
        unitPriceCents,
        unitCostCents: product[0].costCents,
        discountPercent,
        discountReason,
        note: input.note,
        addedBy: userId
      });
    }
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: "out", reason: "Venda em comanda", referenceType: "tab", referenceId: input.tabId, createdBy: userId });
    await tx.update(tabs).set({ version: sql`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "ADD_ITEM", entityType: "tab", entityId: input.tabId, description: `Adicionou ${input.quantity}x ${product[0].name}` });
  });
}
async function setTabItemQuantity(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const item = await tx.select().from(tabItems).where(eq(tabItems.id, input.itemId)).limit(1);
    if (!item[0]) throw new Error("Item n\xE3o encontrado");
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${item[0].tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, item[0].tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const delta = input.quantity - item[0].quantity;
    await tx.execute(sql`SELECT id FROM products WHERE id = ${item[0].productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, item[0].productId)).limit(1);
    const systemSettings = await tx.select().from(settings).limit(1);
    if (!product[0]) throw new Error("Produto n\xE3o encontrado");
    if (delta > 0 && systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < delta) throw new Error("Estoque insuficiente para esta quantidade");
    if (input.quantity === 0) {
      await tx.delete(tabItems).where(eq(tabItems.id, item[0].id));
    } else {
      await tx.update(tabItems).set({ quantity: input.quantity, note: input.note ?? item[0].note }).where(eq(tabItems.id, item[0].id));
    }
    if (delta !== 0) {
      await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} - ${delta}` }).where(eq(products.id, product[0].id));
      await tx.insert(stockMovements).values({
        productId: product[0].id,
        quantity: Math.abs(delta),
        direction: delta > 0 ? "out" : "in",
        reason: delta > 0 ? "Ajuste de item na comanda" : "Estorno de item na comanda",
        referenceType: "tab",
        referenceId: item[0].tabId,
        createdBy: userId
      });
    }
    await tx.update(tabs).set({ version: sql`${tabs.version} + 1` }).where(eq(tabs.id, item[0].tabId));
    await tx.insert(auditLogs).values({ userId, action: input.quantity === 0 ? "REMOVE_ITEM" : "UPDATE_ITEM", entityType: "tab", entityId: item[0].tabId, description: `Atualizou ${item[0].productName}` });
  });
}
async function setTabCharges(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const items = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentsRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const totals = tabTotals(items, { tipPercent: input.tipPercent });
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents > totals.totalCents) throw new Error("O novo total n\xE3o pode ficar abaixo do valor j\xE1 pago");
    await tx.update(tabs).set({ discountPercent: 0, discountCents: 0, tipPercent: input.tipPercent, tipCents: totals.tipCents, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CHARGES", entityType: "tab", entityId: input.tabId, description: `Aplicou 10% de gorjeta` });
    return { ...totals, paidCents, balanceCents: totals.totalCents - paidCents };
  });
}
async function registerPayment(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const previous = await tx.select().from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
    if (previous[0]) return { paymentId: previous[0].id, duplicate: true };
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const itemRows = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (input.amountCents <= 0) throw new Error("Informe um valor de pagamento v\xE1lido");
    if (input.amountCents > balance) throw new Error("O pagamento n\xE3o pode superar o saldo pendente");
    const inserted = await tx.insert(payments).values({ ...input, receivedBy: userId }).returning({ id: payments.id });
    const paymentId = Number(inserted[0].id);
    const newBalance = balance - input.amountCents;
    await tx.update(loungeTables).set({ status: newBalance > 0 ? "partial" : "occupied" }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.insert(auditLogs).values({ userId, action: "PAYMENT", entityType: "tab", entityId: input.tabId, description: `Recebeu pagamento de R$ ${(input.amountCents / 100).toFixed(2)}` });
    return { paymentId, duplicate: false };
  });
}
async function closeTab(tabId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda j\xE1 est\xE1 encerrada");
    const [itemRows, paymentRows] = await Promise.all([
      tx.select().from(tabItems).where(eq(tabItems.tabId, tabId)),
      tx.select().from(payments).where(eq(payments.tabId, tabId))
    ]);
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (balance !== 0) throw new Error(`N\xE3o \xE9 poss\xEDvel encerrar: saldo pendente de R$ ${(balance / 100).toFixed(2)}`);
    await tx.update(tabs).set({ status: "closed", closedAt: /* @__PURE__ */ new Date(), closedBy: userId, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ status: "free", activeTabId: null }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.insert(auditLogs).values({ userId, action: "CLOSE_TAB", entityType: "tab", entityId: tabId, description: `Encerrou a comanda ${tab[0].tabCode}` });
  });
}
async function listProducts(query) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const rows = await db.select({
    id: products.id,
    name: products.name,
    code: products.code,
    categoryId: products.categoryId,
    categoryName: productCategories.name,
    unit: products.unit,
    costCents: products.costCents,
    priceCents: products.priceCents,
    stockQuantity: products.stockQuantity,
    minimumStock: products.minimumStock,
    active: products.active,
    notes: products.notes
  }).from(products).leftJoin(productCategories, eq(products.categoryId, productCategories.id)).orderBy(asc(products.name));
  const normalized = query?.trim().toLocaleLowerCase();
  return normalized ? rows.filter((row) => `${row.name} ${row.code} ${row.categoryName ?? ""}`.toLocaleLowerCase().includes(normalized)) : rows;
}
async function listCategories() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories).where(eq(productCategories.active, true)).orderBy(asc(productCategories.name));
}
async function saveProduct(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const data = { ...input, categoryId: input.categoryId ?? null, notes: input.notes || null };
  if (input.id) {
    await db.update(products).set(data).where(eq(products.id, input.id));
    await writeAudit(userId, "UPDATE_PRODUCT", "product", input.id, `Atualizou ${input.name}`);
    return { id: input.id };
  }
  const inserted = await db.insert(products).values(data).returning({ id: products.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_PRODUCT", "product", id, `Cadastrou ${input.name}`);
  return { id };
}
async function deleteProduct(productId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product[0]) throw new Error("Produto n\xE3o encontrado");
  const usedInTabs = await db.select({ id: tabItems.id }).from(tabItems).where(eq(tabItems.productId, productId)).limit(1);
  if (usedInTabs[0]) throw new Error("Este produto j\xE1 foi lan\xE7ado em uma comanda e n\xE3o pode ser removido. Desative-o no cadastro.");
  await db.delete(products).where(eq(products.id, productId));
  await writeAudit(userId, "DELETE_PRODUCT", "product", productId, `Removeu ${product[0].name}`);
  return { success: true };
}
async function adjustStock(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product[0]) throw new Error("Produto n\xE3o encontrado");
    const change = input.direction === "in" ? input.quantity : -input.quantity;
    const systemSettings = await tx.select().from(settings).limit(1);
    if (change < 0 && systemSettings[0]?.preventNegativeStock && product[0].stockQuantity + change < 0) throw new Error("Ajuste resultaria em estoque negativo");
    await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${change}` }).where(eq(products.id, input.productId));
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: input.direction, reason: input.reason, createdBy: userId });
    await tx.insert(auditLogs).values({ userId, action: "ADJUST_STOCK", entityType: "product", entityId: input.productId, description: `${input.direction === "in" ? "Entrada" : "Sa\xEDda"}: ${input.reason}` });
  });
}
async function listStockMovements() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({
    id: stockMovements.id,
    quantity: stockMovements.quantity,
    direction: stockMovements.direction,
    reason: stockMovements.reason,
    createdAt: stockMovements.createdAt,
    productName: products.name,
    userName: users.name
  }).from(stockMovements).innerJoin(products, eq(stockMovements.productId, products.id)).leftJoin(users, eq(stockMovements.createdBy, users.id)).orderBy(desc(stockMovements.createdAt)).limit(100);
}
async function createExpense(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const inserted = await db.insert(expenses).values({ ...input, notes: input.notes || null, createdBy: userId }).returning({ id: expenses.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_EXPENSE", "expense", id, `Registrou despesa: ${input.description}`);
  return { id };
}
async function listExpenses() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({
    id: expenses.id,
    description: expenses.description,
    category: expenses.category,
    amountCents: expenses.amountCents,
    method: expenses.method,
    notes: expenses.notes,
    occurredAt: expenses.occurredAt,
    userName: users.name
  }).from(expenses).leftJoin(users, eq(expenses.createdBy, users.id)).orderBy(desc(expenses.occurredAt)).limit(100);
}
async function getDashboard(rangeDays = 30) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const start = /* @__PURE__ */ new Date();
  start.setDate(start.getDate() - Math.max(rangeDays - 1, 0));
  start.setHours(0, 0, 0, 0);
  const [paymentRows, expenseRows, itemRows, openTabs, inventory] = await Promise.all([
    db.select({ amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt, tabId: payments.tabId }).from(payments).where(gte(payments.createdAt, start)),
    db.select().from(expenses).where(gte(expenses.occurredAt, start)),
    db.select().from(tabItems).where(gte(tabItems.createdAt, start)),
    db.select().from(tabs).where(eq(tabs.status, "open")),
    db.select().from(products).where(eq(products.active, true))
  ]);
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  const costCents = itemRows.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
  const pendingDetails = await Promise.all(openTabs.map((tab) => getTabDetails(tab.id)));
  const pendingCents = pendingDetails.reduce((sum, tab) => sum + tab.balanceCents, 0);
  const paymentMethods = ["pix", "cash", "debit", "credit", "other"].map((method) => ({
    method,
    totalCents: paymentRows.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amountCents, 0)
  }));
  const productMap = /* @__PURE__ */ new Map();
  for (const item of itemRows) {
    const row = productMap.get(item.productName) ?? { name: item.productName, quantity: 0, totalCents: 0 };
    row.quantity += item.quantity;
    row.totalCents += item.quantity * item.unitPriceCents;
    productMap.set(item.productName, row);
  }
  return {
    paidCents,
    expensesCents,
    costCents,
    resultCents: paidCents - expensesCents - costCents,
    salesCount: new Set(paymentRows.map((payment) => payment.tabId)).size,
    openTabs: openTabs.length,
    pendingCents,
    averageTicketCents: paymentRows.length ? Math.round(paidCents / new Set(paymentRows.map((payment) => payment.tabId)).size) : 0,
    lowStock: inventory.filter((product) => product.stockQuantity <= product.minimumStock).length,
    paymentMethods,
    topProducts: Array.from(productMap.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 5)
  };
}
async function listAudit() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    description: auditLogs.description,
    createdAt: auditLogs.createdAt,
    userName: users.name
  }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(100);
}
async function listProductHistory(productId, from, to) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const filters = [productId ? eq(tabItems.productId, productId) : void 0, from ? gte(tabItems.createdAt, from) : void 0, to ? lte(tabItems.createdAt, to) : void 0].filter(Boolean);
  const rows = await db.select({
    id: tabItems.id,
    tabId: tabItems.tabId,
    productId: tabItems.productId,
    productName: tabItems.productName,
    quantity: tabItems.quantity,
    unitPriceCents: tabItems.unitPriceCents,
    baseUnitPriceCents: tabItems.baseUnitPriceCents,
    discountPercent: tabItems.discountPercent,
    discountReason: tabItems.discountReason,
    createdAt: tabItems.createdAt,
    tabCode: tabs.tabCode,
    status: tabs.status,
    tableNumber: loungeTables.number
  }).from(tabItems).innerJoin(tabs, eq(tabItems.tabId, tabs.id)).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(filters.length ? and(...filters) : void 0).orderBy(desc(tabItems.createdAt)).limit(200);
  return rows;
}
async function listUserAccess() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({ id: users.id, name: users.name, email: users.email, systemRole: users.role, localRole: userProfiles.localRole, active: userProfiles.active, username: localCredentials.username }).from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).leftJoin(localCredentials, eq(localCredentials.userId, users.id)).orderBy(asc(users.name));
}
async function updateUserAccess(input, actorId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(userProfiles).values({ userId: input.userId, localRole: input.localRole, active: input.active }).onConflictDoUpdate({ target: userProfiles.userId, set: { localRole: input.localRole, active: input.active } });
  await writeAudit(actorId, "UPDATE_ACCESS", "user", input.userId, `Atualizou permiss\xE3o para ${input.localRole} (${input.active ? "ativo" : "inativo"})`);
  return { success: true };
}
async function createProductCategory(name, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const inserted = await db.insert(productCategories).values({ name: name.trim(), active: true }).returning({ id: productCategories.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_CATEGORY", "product_category", id, `Criou a categoria ${name.trim()}`);
  return { id, name: name.trim() };
}
async function listProductPriceRules() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({ id: productPriceRules.id, productId: productPriceRules.productId, productName: products.name, name: productPriceRules.name, startTime: productPriceRules.startTime, endTime: productPriceRules.endTime, priceCents: productPriceRules.priceCents, active: productPriceRules.active }).from(productPriceRules).innerJoin(products, eq(productPriceRules.productId, products.id)).orderBy(asc(products.name), asc(productPriceRules.startTime));
}
async function createProductPriceRule(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const product = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto n\xE3o encontrado");
  const inserted = await db.insert(productPriceRules).values({ ...input, active: true, createdBy: userId }).returning({ id: productPriceRules.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_PRICE_RULE", "product_price_rule", id, `Criou pre\xE7o programado para ${product[0].name}: ${input.startTime}-${input.endTime}`);
  return { id };
}
async function setProductPriceRuleActive(ruleId, active, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.update(productPriceRules).set({ active }).where(eq(productPriceRules.id, ruleId));
  const affected = result.rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de pre\xE7o n\xE3o encontrada");
  await writeAudit(userId, active ? "ACTIVATE_PRICE_RULE" : "DEACTIVATE_PRICE_RULE", "product_price_rule", ruleId, `${active ? "Ativou" : "Desativou"} regra de pre\xE7o`);
  return { success: true };
}
async function deleteProductPriceRule(ruleId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.delete(productPriceRules).where(eq(productPriceRules.id, ruleId));
  const affected = result.rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de pre\xE7o n\xE3o encontrada");
  await writeAudit(userId, "DELETE_PRICE_RULE", "product_price_rule", ruleId, "Excluiu regra de pre\xE7o");
  return { success: true };
}
async function getCommercialSettings() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await ensureInitialData();
  const rows = await db.select().from(settings).limit(1);
  return rows[0] ?? {
    id: 1,
    preventNegativeStock: true,
    allowManualDiscount: true,
    defaultDiscountPercent: 10,
    happyHourEnabled: false,
    happyHourStart: "17:00",
    happyHourEnd: "19:00",
    happyHourDiscountPercent: 10,
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function updateCommercialSettings(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(settings).values({
    id: 1,
    happyHourEnabled: input.happyHourEnabled,
    happyHourStart: input.happyHourStart,
    happyHourEnd: input.happyHourEnd,
    happyHourDiscountPercent: input.happyHourDiscountPercent
  }).onConflictDoUpdate({
    target: settings.id,
    set: {
      happyHourEnabled: input.happyHourEnabled,
      happyHourStart: input.happyHourStart,
      happyHourEnd: input.happyHourEnd,
      happyHourDiscountPercent: input.happyHourDiscountPercent,
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
  await writeAudit(userId, "UPDATE_SETTINGS", "settings", 1, "Atualizou as configura\xE7\xF5es de Happy Hour");
  return getCommercialSettings();
}

// server/routers.ts
var paymentMethod = z2.enum(["pix", "cash", "debit", "credit", "other"]);
var localRole = z2.enum(["administrator", "manager", "attendant"]);
async function operator(ctx) {
  const profile = await getLocalRole(ctx.user.id, ctx.user.role);
  if (!profile.active) throw new TRPCError3({ code: "FORBIDDEN", message: "Usu\xE1rio inativo" });
  return profile;
}
async function requireRole(ctx, accepted) {
  const profile = await operator(ctx);
  if (!accepted.includes(profile.localRole)) throw new TRPCError3({ code: "FORBIDDEN", message: "Esta a\xE7\xE3o exige permiss\xE3o de gerente ou administrador" });
  return profile;
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  localAuth: router({
    register: publicProcedure.input(z2.object({
      name: z2.string().trim().min(2).max(120),
      username: z2.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/),
      password: z2.string().min(12).max(128)
    })).mutation(async ({ ctx, input }) => {
      const session = await registerLocally(input);
      if (!session) throw new TRPCError3({ code: "CONFLICT", message: "Este usu\xE1rio j\xE1 est\xE1 cadastrado" });
      ctx.res.cookie("shadow_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1e3 * 60 * 60 * 12,
        path: "/"
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    login: publicProcedure.input(z2.object({ username: z2.string().trim().toLowerCase().min(3).max(64), password: z2.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const session = await loginLocally(input.username, input.password);
      if (!session) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Usu\xE1rio ou senha inv\xE1lidos" });
      ctx.res.cookie("shadow_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1e3 * 60 * 60 * 12,
        path: "/"
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.cookie("shadow_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        expires: /* @__PURE__ */ new Date(0),
        maxAge: 0,
        path: "/"
      });
      return { success: true };
    })
  }),
  workspace: router({
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      await ensureInitialData();
      const profile = await operator(ctx);
      return { localRole: profile.localRole, name: ctx.user.name ?? "Operador" };
    })
  }),
  lounge: router({
    dashboard: protectedProcedure.input(z2.object({ rangeDays: z2.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return getDashboard(input.rangeDays);
    }),
    tables: protectedProcedure.query(async ({ ctx }) => {
      await operator(ctx);
      return listTables();
    }),
    tab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
      await operator(ctx);
      return getTabDetails(input.tabId);
    }),
    openTab: protectedProcedure.input(z2.object({ tableId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return openTab(input.tableId, ctx.user.id);
    }),
    transferTab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), destinationTableId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return transferTab(input.tabId, input.destinationTableId, ctx.user.id);
    }),
    addItem: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      productId: z2.number().int().positive(),
      quantity: z2.number().int().min(1).max(99),
      note: z2.string().max(500).optional()
    })).mutation(async ({ ctx, input }) => {
      const profile = await operator(ctx);
      return addTabItem(input, ctx.user.id, profile.localRole);
    }),
    setItemQuantity: protectedProcedure.input(z2.object({
      itemId: z2.number().int().positive(),
      quantity: z2.number().int().min(0).max(99),
      note: z2.string().max(500).optional()
    })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return setTabItemQuantity(input, ctx.user.id);
    }),
    pay: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      amountCents: z2.number().int().positive(),
      method: paymentMethod,
      requestKey: z2.string().min(8).max(80)
    })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return registerPayment(input, ctx.user.id);
    }),
    closeTab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return closeTab(input.tabId, ctx.user.id);
    }),
    setCharges: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), tipPercent: z2.union([z2.literal(0), z2.literal(10)]) })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return setTabCharges(input, ctx.user.id);
    })
  }),
  inventory: router({
    categories: protectedProcedure.query(async ({ ctx }) => {
      await operator(ctx);
      return listCategories();
    }),
    createCategory: protectedProcedure.input(z2.object({ name: z2.string().min(2).max(100) })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createProductCategory(input.name, ctx.user.id);
    }),
    products: protectedProcedure.input(z2.object({ query: z2.string().max(160).optional() }).optional()).query(async ({ ctx, input }) => {
      await operator(ctx);
      return listProducts(input?.query);
    }),
    movements: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listStockMovements();
    }),
    saveProduct: protectedProcedure.input(z2.object({
      id: z2.number().int().positive().optional(),
      name: z2.string().min(2).max(160),
      code: z2.string().min(2).max(64),
      categoryId: z2.number().int().positive().optional(),
      unit: z2.string().min(1).max(24),
      costCents: z2.number().int().min(0),
      priceCents: z2.number().int().min(0),
      stockQuantity: z2.number().int().min(0),
      minimumStock: z2.number().int().min(0),
      active: z2.boolean(),
      notes: z2.string().max(2e3).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return saveProduct(input, ctx.user.id);
    }),
    deleteProduct: protectedProcedure.input(z2.object({ productId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return deleteProduct(input.productId, ctx.user.id);
    }),
    adjust: protectedProcedure.input(z2.object({
      productId: z2.number().int().positive(),
      quantity: z2.number().int().min(1).max(1e5),
      direction: z2.enum(["in", "out"]),
      reason: z2.string().min(2).max(120)
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return adjustStock(input, ctx.user.id);
    })
  }),
  finance: router({
    expenses: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listExpenses();
    }),
    createExpense: protectedProcedure.input(z2.object({
      description: z2.string().min(2).max(240),
      category: z2.string().min(2).max(100),
      amountCents: z2.number().int().positive(),
      method: paymentMethod,
      notes: z2.string().max(2e3).optional(),
      occurredAt: z2.date()
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createExpense(input, ctx.user.id);
    })
  }),
  audit: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return listAudit();
    })
  }),
  access: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return listUserAccess();
    }),
    update: protectedProcedure.input(z2.object({ userId: z2.number().int().positive(), localRole, active: z2.boolean() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return updateUserAccess(input, ctx.user.id);
    })
  }),
  productHistory: router({
    list: protectedProcedure.input(z2.object({ productId: z2.number().int().positive().optional(), from: z2.date().optional(), to: z2.date().optional() }).optional()).query(async ({ ctx, input }) => {
      await operator(ctx);
      return listProductHistory(input?.productId, input?.from, input?.to);
    })
  }),
  pricing: router({
    rules: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listProductPriceRules();
    }),
    createRule: protectedProcedure.input(z2.object({ productId: z2.number().int().positive(), name: z2.string().min(2).max(140), startTime: z2.string().regex(/^\d{2}:\d{2}$/), endTime: z2.string().regex(/^\d{2}:\d{2}$/), priceCents: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createProductPriceRule(input, ctx.user.id);
    }),
    setActive: protectedProcedure.input(z2.object({ ruleId: z2.number().int().positive(), active: z2.boolean() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return setProductPriceRuleActive(input.ruleId, input.active, ctx.user.id);
    }),
    deleteRule: protectedProcedure.input(z2.object({ ruleId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return deleteProductPriceRule(input.ruleId, ctx.user.id);
    })
  }),
  commercial: router({
    settings: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return getCommercialSettings();
    }),
    updateSettings: protectedProcedure.input(z2.object({
      happyHourEnabled: z2.boolean(),
      happyHourStart: z2.string().regex(/^\d{2}:\d{2}$/),
      happyHourEnd: z2.string().regex(/^\d{2}:\d{2}$/),
      happyHourDiscountPercent: z2.number().int().min(0).max(100)
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return updateCommercialSettings(input, ctx.user.id);
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken2 = cookies.get(COOKIE_NAME);
    if (!sessionToken2) {
      const authHeader = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken2 = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken2);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken2 ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken2 ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
function sessionToken(cookieHeader) {
  const match = cookieHeader?.match(/(?:^|;\s*)shadow_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }
  if (!user) {
    const token = sessionToken(opts.req.headers?.cookie);
    if (token) user = await getLocalUserFromSession(token);
  }
  return { req: opts.req, res: opts.res, user };
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken2 = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken2, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/app.ts
function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

// api/index.source.ts
var index_source_default = createApp();
export {
  index_source_default as default
};
