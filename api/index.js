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

// shared/cpf.ts
function normalizeCpf(value) {
  return value.replace(/\D/g, "");
}
function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^([0-9])\1{10}$/.test(cpf)) return false;
  const calculateDigit = (digits, weightStart) => {
    const sum = Array.from(digits).reduce((total, digit, index2) => total + Number(digit) * (weightStart - index2), 0);
    const remainder = sum * 10 % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const firstDigit = calculateDigit(cpf.slice(0, 9), 10);
  if (firstDigit !== Number(cpf[9])) return false;
  const secondDigit = calculateDigit(cpf.slice(0, 10), 11);
  return secondDigit === Number(cpf[10]);
}

// shared/role-permissions.ts
var ACCESS_FEATURES = [
  { id: "dashboard", label: "Vis\xE3o geral", description: "Indicadores e resumo da opera\xE7\xE3o" },
  { id: "tables", label: "Mesas e comandas", description: "Abrir mesas, comandas, lan\xE7ar itens e receber pagamentos" },
  { id: "adjustTabValue", label: "Alterar valor da comanda", description: "Aplicar ajuste manual ao total de uma comanda, com justificativa registrada" },
  { id: "customers", label: "Clientes", description: "Consultar, cadastrar e gerenciar clientes" },
  { id: "products", label: "Produtos", description: "Cat\xE1logo, categorias, pre\xE7os e cadastro de produtos" },
  { id: "stock", label: "Estoque", description: "Consultar movimentos e ajustar entradas e sa\xEDdas" },
  { id: "finance", label: "Financeiro", description: "Consultar e registrar despesas" },
  { id: "cash", label: "Caixa", description: "Abrir e fechar turnos, conferir recebimentos e registrar movimentos de dinheiro" },
  { id: "reports", label: "Relat\xF3rios", description: "Consultar relat\xF3rios de vendas e recebimentos" },
  { id: "settings", label: "Configura\xE7\xF5es", description: "Regras comerciais e par\xE2metros da opera\xE7\xE3o" }
];
var DEFAULT_ROLE_PERMISSIONS = {
  manager: ACCESS_FEATURES.map(({ id }) => id),
  attendant: ["tables", "customers", "cash", "reports"]
};
function canAccessFeature(role, permissions, feature) {
  if (role === "administrator") return true;
  if (role !== "manager" && role !== "attendant") return false;
  return (permissions ?? DEFAULT_ROLE_PERMISSIONS)[role].includes(feature);
}

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
function getLocalSessionCookieOptions(req) {
  const options = getSessionCookieOptions(req);
  return { ...options, sameSite: options.secure ? "none" : "lax" };
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
import { randomBytes as randomBytes2, scryptSync, timingSafeEqual as timingSafeEqual2 } from "crypto";
import { and, asc, desc, eq, gte, gt, inArray, lte, sql as sql2 } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// drizzle/schema.ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  serial,
  integer,
  jsonb,
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
    daysOfWeek: integer("daysOfWeek").array().notNull().default(sql`ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`),
    weekdaysMask: integer("weekdaysMask").notNull().default(127),
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
var customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    cpf: varchar("cpf", { length: 11 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    notes: varchar("notes", { length: 500 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("customers_cpf_unique").on(table.cpf), index("customers_active_idx").on(table.active)]
);
var tabs = pgTable(
  "tabs",
  {
    id: serial("id").primaryKey(),
    tableId: integer("tableId").notNull().references(() => loungeTables.id),
    tabCode: varchar("tabCode", { length: 24 }).notNull(),
    offlineKey: varchar("offlineKey", { length: 80 }),
    offlineFingerprint: varchar("offlineFingerprint", { length: 64 }),
    customerName: varchar("customerName", { length: 120 }),
    customerId: integer("customerId").references(() => customers.id),
    status: tabStatusEnum("status").default("open").notNull(),
    openedBy: integer("openedBy").notNull().references(() => users.id),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    closedBy: integer("closedBy").references(() => users.id),
    discountPercent: integer("discountPercent").default(0).notNull(),
    discountCents: integer("discountCents").default(0).notNull(),
    tipPercent: integer("tipPercent").default(0).notNull(),
    tipCents: integer("tipCents").default(0).notNull(),
    manualAdjustmentCents: integer("manualAdjustmentCents").default(0).notNull(),
    adjustmentReason: varchar("adjustmentReason", { length: 500 }),
    version: integer("version").default(1).notNull()
  },
  (table) => [
    uniqueIndex("tabs_code_unique").on(table.tabCode),
    uniqueIndex("tabs_offline_key_unique").on(table.offlineKey),
    index("tabs_table_status_idx").on(table.tableId, table.status),
    index("tabs_status_idx").on(table.status)
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
    index("tab_items_tab_idx").on(table.tabId),
    index("tab_items_tab_product_idx").on(table.tabId, table.productId)
  ]
);
var cashSessions = pgTable(
  "cash_sessions",
  {
    id: serial("id").primaryKey(),
    status: varchar("status", { length: 20 }).$type().default("open").notNull(),
    openingFloatCents: integer("openingFloatCents").notNull(),
    openedBy: integer("openedBy").notNull().references(() => users.id),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedBy: integer("closedBy").references(() => users.id),
    closedAt: timestamp("closedAt"),
    countedCashCents: integer("countedCashCents"),
    expectedCashCents: integer("expectedCashCents"),
    differenceCents: integer("differenceCents"),
    closeNote: varchar("closeNote", { length: 500 })
  },
  (table) => [
    check("cash_sessions_status_check", sql`${table.status} IN ('open', 'closed')`),
    check("cash_sessions_opening_nonnegative", sql`${table.openingFloatCents} >= 0`),
    index("cash_sessions_opened_idx").on(table.openedAt),
    uniqueIndex("cash_sessions_single_open_unique").on(table.status).where(sql`${table.status} = 'open'`)
  ]
);
var cashMovements = pgTable(
  "cash_movements",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("sessionId").notNull().references(() => cashSessions.id),
    kind: varchar("kind", { length: 20 }).$type().notNull(),
    amountCents: integer("amountCents").notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    createdBy: integer("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [
    check("cash_movements_kind_check", sql`${table.kind} IN ('supply', 'withdrawal', 'refund')`),
    check("cash_movements_amount_positive", sql`${table.amountCents} > 0`),
    index("cash_movements_session_created_idx").on(table.sessionId, table.createdAt)
  ]
);
var payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tabId").notNull().references(() => tabs.id),
    cashSessionId: integer("cashSessionId").references(() => cashSessions.id),
    amountCents: integer("amountCents").notNull(),
    method: paymentMethodEnum("method").notNull(),
    requestKey: varchar("requestKey", { length: 80 }).notNull(),
    receivedBy: integer("receivedBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("payments_request_key_unique").on(table.requestKey),
    index("payments_tab_idx").on(table.tabId),
    index("payments_created_idx").on(table.createdAt),
    index("payments_cash_session_idx").on(table.cashSessionId)
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
    cashSessionId: integer("cashSessionId").references(() => cashSessions.id),
    notes: text("notes"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdBy: integer("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("expenses_occurred_idx").on(table.occurredAt), index("expenses_cash_session_idx").on(table.cashSessionId)]
);
var settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  preventNegativeStock: boolean("preventNegativeStock").default(true).notNull(),
  maxTables: integer("maxTables").default(20).notNull(),
  allowManualDiscount: boolean("allowManualDiscount").default(true).notNull(),
  defaultDiscountPercent: integer("defaultDiscountPercent").default(10).notNull(),
  happyHourEnabled: boolean("happyHourEnabled").default(false).notNull(),
  happyHourStart: varchar("happyHourStart", { length: 5 }).default("17:00").notNull(),
  happyHourEnd: varchar("happyHourEnd", { length: 5 }).default("19:00").notNull(),
  happyHourDiscountPercent: integer("happyHourDiscountPercent").default(10).notNull(),
  rolePermissions: jsonb("rolePermissions").$type().notNull().default(sql`'{"manager":["dashboard","tables","adjustTabValue","customers","products","stock","finance","cash","reports","settings"],"attendant":["tables","customers","cash","reports"]}'::jsonb`),
  rolePermissionsVersion: integer("rolePermissionsVersion").default(3).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});
var printerAgents = pgTable(
  "windows_print_agents",
  {
    id: integer("id").primaryKey(),
    computerName: varchar("computerName", { length: 120 }).notNull(),
    printerName: varchar("printerName", { length: 160 }).notNull(),
    pairingCodeHash: varchar("pairingCodeHash", { length: 64 }),
    pairingCodeExpiresAt: timestamp("pairingCodeExpiresAt"),
    tokenHash: varchar("tokenHash", { length: 64 }),
    enabled: boolean("enabled").default(true).notNull(),
    lastSeenAt: timestamp("lastSeenAt"),
    pairedAt: timestamp("pairedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    check("windows_print_agents_singleton_check", sql`${table.id} = 1`),
    uniqueIndex("windows_print_agents_token_hash_unique").on(table.tokenHash)
  ]
);
var printJobs = pgTable(
  "windows_print_jobs",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agentId").notNull().references(() => printerAgents.id),
    kind: varchar("kind", { length: 20 }).$type().notNull(),
    status: varchar("status", { length: 20 }).$type().default("queued").notNull(),
    payload: jsonb("payload").$type().notNull(),
    requestedBy: integer("requestedBy").notNull().references(() => users.id),
    attempts: integer("attempts").default(0).notNull(),
    lastError: varchar("lastError", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    claimedAt: timestamp("claimedAt"),
    completedAt: timestamp("completedAt")
  },
  (table) => [
    check("windows_print_jobs_kind_check", sql`${table.kind} IN ('tab', 'barista', 'cash')`),
    check("windows_print_jobs_status_check", sql`${table.status} IN ('queued', 'processing', 'printed', 'failed', 'uncertain')`),
    index("windows_print_jobs_queue_idx").on(table.agentId, table.status, table.createdAt),
    index("windows_print_jobs_created_idx").on(table.createdAt)
  ]
);
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

// shared/audit-labels.ts
var roleLabels = {
  administrator: "administrador",
  manager: "gerente",
  attendant: "atendente"
};
function auditRoleLabel(role) {
  return roleLabels[role] ?? "perfil n\xE3o identificado";
}

// server/report-financial-utils.ts
function calculateReportFinancialTotals(sales, items, expensesCents) {
  const salesCents = sales.reduce((total, sale) => total + sale.salesCents, 0);
  const tipCents = sales.reduce((total, sale) => total + sale.tipCents, 0);
  const productSalesCents = items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
  const costCents = items.reduce((total, item) => total + item.quantity * item.unitCostCents, 0);
  return {
    salesCents,
    tipCents,
    productSalesCents,
    costCents,
    resultCents: salesCents - tipCents - costCents - expensesCents
  };
}

// server/cash-register-utils.ts
var PAYMENT_METHODS = ["pix", "cash", "debit", "credit", "other"];
function isCashOutflowAllowed(amountCents, expectedCashCents) {
  return Number.isSafeInteger(amountCents) && amountCents > 0 && Number.isSafeInteger(expectedCashCents) && expectedCashCents >= 0 && amountCents <= expectedCashCents;
}
function calculateCashDifferenceCents(countedCashCents, expectedCashCents) {
  return countedCashCents - expectedCashCents;
}
function calculateCashSessionTotals(input) {
  const paymentTotals = PAYMENT_METHODS.map((method) => {
    const matchingPayments = input.payments.filter((payment) => payment.method === method);
    return {
      method,
      totalCents: matchingPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
      count: matchingPayments.length
    };
  });
  const cashPaymentsCents = paymentTotals.find((item) => item.method === "cash")?.totalCents ?? 0;
  const suppliesCents = input.movements.filter((movement) => movement.kind === "supply").reduce((sum, movement) => sum + movement.amountCents, 0);
  const withdrawalsCents = input.movements.filter((movement) => movement.kind === "withdrawal").reduce((sum, movement) => sum + movement.amountCents, 0);
  const refundsCents = input.movements.filter((movement) => movement.kind === "refund").reduce((sum, movement) => sum + movement.amountCents, 0);
  const cashExpensesCents = input.expenses.filter((expense) => expense.method === "cash").reduce((sum, expense) => sum + expense.amountCents, 0);
  const nonCashExpensesCents = input.expenses.filter((expense) => expense.method !== "cash").reduce((sum, expense) => sum + expense.amountCents, 0);
  const receivedCents = paymentTotals.reduce((sum, item) => sum + item.totalCents, 0);
  const expectedCashCents = input.openingFloatCents + cashPaymentsCents + suppliesCents - withdrawalsCents - refundsCents - cashExpensesCents;
  return {
    paymentTotals,
    receivedCents,
    cashPaymentsCents,
    suppliesCents,
    withdrawalsCents,
    refundsCents,
    cashExpensesCents,
    nonCashExpensesCents,
    expectedCashCents
  };
}

// server/payment-idempotency-utils.ts
import { createHash } from "crypto";
function createOfflineTabFingerprint(input) {
  const canonicalRequest = {
    deviceId: input.deviceId,
    tableId: input.tableId,
    customerName: input.customerName?.trim() || null,
    tipPercent: input.tipPercent,
    items: input.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      note: item.note ?? null,
      createdAt: item.createdAt ?? null
    })),
    payments: input.payments.map((payment) => ({
      amountCents: payment.amountCents,
      method: payment.method,
      requestKey: payment.requestKey
    }))
  };
  return createHash("sha256").update(JSON.stringify(canonicalRequest)).digest("hex");
}
function offlineFingerprintMatches(storedFingerprint, requestedFingerprint) {
  return Boolean(storedFingerprint) && storedFingerprint === requestedFingerprint;
}
function paymentRequestMatches(existing, request) {
  return existing.tabId === request.tabId && existing.amountCents === request.amountCents && existing.method === request.method;
}

// server/price-rule-utils.ts
function parseRuleTime(value) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function saoPauloClock(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayText);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return { weekday, minutes: hour * 60 + minute };
}
function weekdaysToMask(days) {
  return days.reduce((mask, day) => Number.isInteger(day) && day >= 0 && day <= 6 ? mask | 1 << day : mask, 0);
}
function weekdaysFromMask(mask) {
  if (!Number.isInteger(mask) || Number(mask) < 1 || Number(mask) > 127) return null;
  return Array.from({ length: 7 }, (_, day) => day).filter((day) => (Number(mask) & 1 << day) !== 0);
}
function timeInWindow(currentMinutes, startTime, endTime) {
  const start = parseRuleTime(startTime);
  const end = parseRuleTime(endTime);
  if (start === null || end === null || start === end || !Number.isInteger(currentMinutes) || currentMinutes < 0 || currentMinutes >= 1440) return false;
  return start < end ? currentMinutes >= start && currentMinutes < end : currentMinutes >= start || currentMinutes < end;
}
function priceRuleAppliesAt(daysOfWeek, startTime, endTime, weekday, currentMinutes) {
  const start = parseRuleTime(startTime);
  const end = parseRuleTime(endTime);
  if (start === null || end === null || start === end || weekday < 0 || weekday > 6 || !Number.isInteger(currentMinutes) || currentMinutes < 0 || currentMinutes >= 1440) return false;
  const days = Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (start < end) return days.includes(weekday) && currentMinutes >= start && currentMinutes < end;
  if (currentMinutes >= start) return days.includes(weekday);
  return end > 0 && currentMinutes < end && days.includes((weekday + 6) % 7);
}

// server/tab-adjustment-utils.ts
function planTabTotalAdjustment(input) {
  const { baseTotalCents, currentAdjustmentCents, newTotalCents, paidCents } = input;
  if (!Number.isSafeInteger(newTotalCents) || newTotalCents < 0) {
    throw new Error("Informe um novo total v\xE1lido");
  }
  const currentTotalCents = Math.max(0, baseTotalCents + currentAdjustmentCents);
  if (newTotalCents < paidCents) {
    throw new Error("O novo total n\xE3o pode ficar abaixo do valor j\xE1 pago");
  }
  return {
    currentTotalCents,
    newTotalCents,
    adjustmentCents: newTotalCents - baseTotalCents
  };
}

// shared/sao-paulo-time.ts
function saoPauloDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function addDaysToSaoPauloDateKey(dateKey, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isInteger(days)) return "";
  const date = /* @__PURE__ */ new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function saoPauloDayStart(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Data inv\xE1lida");
  return /* @__PURE__ */ new Date(`${dateKey}T00:00:00.000-03:00`);
}

// server/daily-revenue-utils.ts
function buildDailyRevenue(rangeDays, payments2, now = /* @__PURE__ */ new Date()) {
  const normalizedRange = Number.isInteger(rangeDays) && rangeDays > 0 ? Math.min(365, rangeDays) : 30;
  const todayKey = saoPauloDateKey(now);
  const firstKey = addDaysToSaoPauloDateKey(todayKey, -normalizedRange + 1);
  const dateKeys = Array.from({ length: normalizedRange }, (_, index2) => addDaysToSaoPauloDateKey(firstKey, index2));
  const totals = new Map(dateKeys.map((key) => [key, 0]));
  for (const payment of payments2) {
    const key = saoPauloDateKey(payment.createdAt);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + payment.amountCents);
  }
  return dateKeys.map((dateKey) => ({
    dateKey,
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "short"
    }).format(/* @__PURE__ */ new Date(`${dateKey}T12:00:00.000Z`)),
    totalCents: totals.get(dateKey) ?? 0
  }));
}

// server/printer-utils.ts
import { createHash as createHash2, randomBytes, timingSafeEqual } from "node:crypto";
function createPrinterPairingCode() {
  return randomBytes(18).toString("base64url");
}
function createPrinterAgentToken() {
  return randomBytes(32).toString("base64url");
}
function hashPrinterSecret(secret) {
  return createHash2("sha256").update(secret, "utf8").digest("hex");
}
function printerSecretMatches(secret, expectedHash) {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const suppliedHash = Buffer.from(hashPrinterSecret(secret), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}
var money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100).replace(/\u00a0/g, " ");
var dateTime = (value) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
var time = (value) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
var line = (text2, options = {}) => ({ text: text2, ...options });
var divider = () => ({ text: "", separator: true });
function buildTabPrintPayload(tab) {
  const lines = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line(`COMANDA ${tab.tabCode}`, { align: "center", size: "small" }),
    divider(),
    line(`Mesa: ${tab.tableNumber}`, { bold: true })
  ];
  if (tab.customerName) lines.push(line(`Cliente: ${tab.customerName}`));
  lines.push(line(`Abertura: ${dateTime(tab.openedAt)}`), divider());
  if (tab.items.length) {
    for (const item of tab.items) {
      lines.push(line(`${item.quantity}x ${item.productName}`, { bold: true }));
      lines.push(line(`   ${money(item.quantity * item.unitPriceCents)}`));
      if (item.discountReason) lines.push(line(`   ${item.discountReason}`, { size: "small" }));
      if (item.addedByName) lines.push(line(`   Lan\xE7ado por: ${item.addedByName}`, { size: "small" }));
      if (item.createdAt) lines.push(line(`   Adicionado \xE0s ${time(item.createdAt)}`, { size: "small" }));
      if (item.note) lines.push(line(`   Obs.: ${item.note}`, { size: "small" }));
    }
  } else {
    lines.push(line("Nenhum item lan\xE7ado", { align: "center", size: "small" }));
  }
  lines.push(divider(), line(`Subtotal: ${money(tab.subtotalCents)}`));
  if (tab.tipCents) lines.push(line(`Gorjeta: ${money(tab.tipCents)}`));
  lines.push(line(`Total: ${money(tab.totalCents)}`), line(`Pagamentos: - ${money(tab.paidCents)}`), line(`SALDO: ${money(tab.balanceCents)}`, { bold: true, size: "large" }));
  if (tab.payments.length) {
    const labels = { pix: "PIX", cash: "Dinheiro", debit: "D\xE9bito", credit: "Cr\xE9dito", other: "Outros" };
    lines.push(divider(), line("PAGAMENTOS", { size: "small", bold: true }));
    for (const payment of tab.payments) lines.push(line(`${labels[payment.method] ?? payment.method}: ${money(payment.amountCents)}`));
  }
  lines.push(divider(), line("Obrigado pela prefer\xEAncia", { align: "center", size: "small" }));
  return { kind: "tab", lines };
}
function buildBaristaPrintPayload(tab, itemId) {
  const item = tab.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("O item selecionado n\xE3o pertence a esta comanda");
  const lines = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line("PEDIDO PARA O BARISTA", { align: "center", size: "small" }),
    divider(),
    line("MESA", { align: "center", size: "small" }),
    line(String(tab.tableNumber), { align: "center", size: "large", bold: true }),
    line(tab.tabCode, { align: "center", size: "small" }),
    divider(),
    line(`${item.quantity}x`, { size: "large", bold: true }),
    line(item.productName, { size: "large", bold: true })
  ];
  if (item.discountReason) lines.push(line(`${item.discountReason} \xB7 ${money(item.unitPriceCents)}`, { bold: true }));
  if (item.note) lines.push(divider(), line("OBSERVA\xC7\xC3O", { bold: true }), line(item.note, { size: "large" }));
  lines.push(line(`Lan\xE7ado por: ${item.addedByName || "Operador"}`, { size: "small" }), divider(), line("Preparar e entregar na mesa indicada", { align: "center", size: "small" }));
  return { kind: "barista", lines };
}
function buildCashSessionPrintPayload(session) {
  const methodLabels = { pix: "PIX", cash: "Dinheiro", debit: "D\xE9bito", credit: "Cr\xE9dito", other: "Outros" };
  const open = session.status === "open";
  const lines = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line("RESUMO DO CAIXA", { align: "center", bold: true }),
    line(`SESS\xC3O #${session.id}`, { align: "center", size: "small" }),
    divider(),
    line(`Status: ${open ? "ABERTO" : "ENCERRADO"}`, { bold: true }),
    line(`Abertura: ${dateTime(session.openedAt)}`),
    line(`Aberto por: ${session.openedByName || "Operador"}`)
  ];
  if (!open && session.closedAt) lines.push(line(`Fechamento: ${dateTime(session.closedAt)}`));
  if (!open && session.closedByName) lines.push(line(`Fechado por: ${session.closedByName}`));
  lines.push(
    divider(),
    line(`Fundo inicial: ${money(session.openingFloatCents)}`),
    line(`Recebido em dinheiro: ${money(session.cashPaymentsCents)}`),
    line(`Suprimentos: ${money(session.suppliesCents)}`),
    line(`Sangrias: ${money(session.withdrawalsCents)}`),
    line(`Devolu\xE7\xF5es: ${money(session.refundsCents)}`),
    line(`Despesas em dinheiro: ${money(session.cashExpensesCents)}`),
    line(`Despesas outros meios: ${money(session.nonCashExpensesCents)}`),
    line(`Dinheiro esperado: ${money(session.expectedCashCents)}`, { bold: true }),
    divider(),
    line("RECEBIMENTOS POR FORMA", { size: "small", bold: true })
  );
  for (const payment of session.paymentTotals ?? []) lines.push(line(`${methodLabels[payment.method] ?? payment.method}: ${money(payment.totalCents)}`));
  lines.push(line(`Total recebido: ${money(session.receivedCents)}`, { bold: true }));
  if (!open) {
    lines.push(divider(), line(`Dinheiro contado: ${money(session.countedCashCents ?? 0)}`), line(`Diferen\xE7a: ${money(session.differenceCents ?? 0)}`, { bold: true, size: "large" }));
    if (session.closeNote) lines.push(line(`Obs.: ${session.closeNote}`, { size: "small" }));
  }
  lines.push(divider(), line("Resumo da sess\xE3o de caixa", { align: "center", size: "small" }));
  return { kind: "cash", lines };
}

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
var initialDataPromise = null;
async function ensureInitialData() {
  if (!initialDataPromise) {
    initialDataPromise = initializeInitialData();
  }
  try {
    await initialDataPromise;
  } catch (error) {
    initialDataPromise = null;
    throw error;
  }
}
async function initializeInitialData() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "customerName" varchar(120)`);
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "manualAdjustmentCents" integer NOT NULL DEFAULT 0`);
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "adjustmentReason" varchar(500)`);
  await db.execute(sql2`CREATE TABLE IF NOT EXISTS "customers" ("id" serial PRIMARY KEY, "name" varchar(160) NOT NULL, "cpf" varchar(11) NOT NULL, "phone" varchar(30), "notes" varchar(500), "active" boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
  await db.execute(sql2`CREATE UNIQUE INDEX IF NOT EXISTS "customers_cpf_unique" ON "customers" ("cpf")`);
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "customerId" integer REFERENCES "customers"("id")`);
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineKey" varchar(80)`);
  await db.execute(sql2`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineFingerprint" varchar(64)`);
  await db.execute(sql2`CREATE UNIQUE INDEX IF NOT EXISTS "tabs_offline_key_unique" ON "tabs" USING btree ("offlineKey")`);
  await db.execute(sql2`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "maxTables" integer NOT NULL DEFAULT 20`);
  await db.execute(sql2`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "rolePermissions" jsonb NOT NULL DEFAULT '{"manager":["dashboard","tables","adjustTabValue","customers","products","stock","finance","cash","reports","settings"],"attendant":["tables","customers","cash","reports"]}'::jsonb`);
  await db.execute(sql2`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "rolePermissionsVersion" integer NOT NULL DEFAULT 1`);
  await db.execute(sql2`UPDATE "settings" SET "rolePermissions" = jsonb_set("rolePermissions", '{manager}', COALESCE("rolePermissions"->'manager', '[]'::jsonb) || '["adjustTabValue"]'::jsonb, true), "rolePermissionsVersion" = 2 WHERE "rolePermissionsVersion" < 2`);
  await db.execute(sql2`UPDATE "settings" SET "rolePermissions" = jsonb_set(jsonb_set("rolePermissions", '{manager}', COALESCE("rolePermissions"->'manager', '[]'::jsonb) || '["cash"]'::jsonb, true), '{attendant}', COALESCE("rolePermissions"->'attendant', '[]'::jsonb) || '["cash"]'::jsonb, true), "rolePermissionsVersion" = 3 WHERE "rolePermissionsVersion" < 3`);
  await db.execute(sql2`ALTER TABLE "settings" ALTER COLUMN "rolePermissionsVersion" SET DEFAULT 3`);
  await db.execute(sql2`ALTER TABLE "settings" ALTER COLUMN "rolePermissions" SET DEFAULT '{"manager":["dashboard","tables","adjustTabValue","customers","products","stock","finance","cash","reports","settings"],"attendant":["tables","customers","cash","reports"]}'::jsonb`);
  await db.execute(sql2`CREATE TABLE IF NOT EXISTS "cash_sessions" ("id" serial PRIMARY KEY, "status" varchar(20) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'closed')), "openingFloatCents" integer NOT NULL CHECK ("openingFloatCents" >= 0), "openedBy" integer NOT NULL REFERENCES "users"("id"), "openedAt" timestamp NOT NULL DEFAULT now(), "closedBy" integer REFERENCES "users"("id"), "closedAt" timestamp, "countedCashCents" integer, "expectedCashCents" integer, "differenceCents" integer, "closeNote" varchar(500))`);
  await db.execute(sql2`CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_single_open_unique" ON "cash_sessions" ("status") WHERE "status" = 'open'`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "cash_sessions_opened_idx" ON "cash_sessions" ("openedAt")`);
  await db.execute(sql2`CREATE TABLE IF NOT EXISTS "cash_movements" ("id" serial PRIMARY KEY, "sessionId" integer NOT NULL REFERENCES "cash_sessions"("id"), "kind" varchar(20) NOT NULL CHECK ("kind" IN ('supply', 'withdrawal', 'refund')), "amountCents" integer NOT NULL CHECK ("amountCents" > 0), "description" varchar(240) NOT NULL, "createdBy" integer NOT NULL REFERENCES "users"("id"), "createdAt" timestamp NOT NULL DEFAULT now())`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "cash_movements_session_created_idx" ON "cash_movements" ("sessionId", "createdAt")`);
  await db.execute(sql2`ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashSessionId" integer REFERENCES "cash_sessions"("id")`);
  await db.execute(sql2`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "cashSessionId" integer REFERENCES "cash_sessions"("id")`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "payments_cash_session_idx" ON "payments" ("cashSessionId")`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "expenses_cash_session_idx" ON "expenses" ("cashSessionId")`);
  await db.execute(sql2`ALTER TABLE "product_price_rules" ADD COLUMN IF NOT EXISTS "daysOfWeek" integer[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`);
  await db.execute(sql2`ALTER TABLE "product_price_rules" ADD COLUMN IF NOT EXISTS "weekdaysMask" integer NOT NULL DEFAULT 127`);
  await db.execute(sql2`UPDATE "product_price_rules" AS rule SET "weekdaysMask" = COALESCE((SELECT bit_or(1 << value) FROM unnest(COALESCE(rule."daysOfWeek", ARRAY[]::integer[])) AS selected_day(value)), 127)`);
  await db.execute(sql2`DROP INDEX IF EXISTS "tab_items_tab_product_unique"`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "tab_items_tab_product_idx" ON "tab_items" ("tabId", "productId")`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "tabs_status_idx" ON "tabs" ("status")`);
  await db.execute(sql2`CREATE TABLE IF NOT EXISTS "windows_print_agents" ("id" integer PRIMARY KEY, CONSTRAINT "windows_print_agents_singleton_check" CHECK ("id" = 1), "computerName" varchar(120) NOT NULL, "printerName" varchar(160) NOT NULL, "pairingCodeHash" varchar(64), "pairingCodeExpiresAt" timestamp, "tokenHash" varchar(64), "enabled" boolean NOT NULL DEFAULT true, "lastSeenAt" timestamp, "pairedAt" timestamp, "updatedAt" timestamp NOT NULL DEFAULT now())`);
  await db.execute(sql2`CREATE UNIQUE INDEX IF NOT EXISTS "windows_print_agents_token_hash_unique" ON "windows_print_agents" ("tokenHash")`);
  await db.execute(sql2`CREATE TABLE IF NOT EXISTS "windows_print_jobs" ("id" serial PRIMARY KEY, "agentId" integer NOT NULL REFERENCES "windows_print_agents"("id"), "kind" varchar(20) NOT NULL CHECK ("kind" IN ('tab', 'barista', 'cash')), "status" varchar(20) NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'processing', 'printed', 'failed', 'uncertain')), "payload" jsonb NOT NULL, "requestedBy" integer NOT NULL REFERENCES "users"("id"), "attempts" integer NOT NULL DEFAULT 0, "lastError" varchar(500), "createdAt" timestamp NOT NULL DEFAULT now(), "claimedAt" timestamp, "completedAt" timestamp)`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "windows_print_jobs_queue_idx" ON "windows_print_jobs" ("agentId", "status", "createdAt")`);
  await db.execute(sql2`CREATE INDEX IF NOT EXISTS "windows_print_jobs_created_idx" ON "windows_print_jobs" ("createdAt")`);
  await db.execute(sql2`CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $audit_immutable$
    BEGIN
      RAISE EXCEPTION 'Registros de auditoria são imutáveis; alterações e exclusões não são permitidas'
        USING ERRCODE = '55000';
    END;
    $audit_immutable$`);
  await db.execute(sql2`DO $audit_trigger$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_no_update_delete'
          AND tgrelid = 'public.audit_logs'::regclass
          AND NOT tgisinternal
      ) THEN
        BEGIN
          CREATE TRIGGER audit_logs_no_update_delete
          BEFORE UPDATE OR DELETE ON public.audit_logs
          FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'audit_logs_no_truncate'
          AND tgrelid = 'public.audit_logs'::regclass
          AND NOT tgisinternal
      ) THEN
        BEGIN
          CREATE TRIGGER audit_logs_no_truncate
          BEFORE TRUNCATE ON public.audit_logs
          FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_log_mutation();
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
      END IF;
    END;
    $audit_trigger$`);
  await db.insert(loungeTables).values(Array.from({ length: 20 }, (_, index2) => ({ number: index2 + 1 }))).onConflictDoNothing({ target: loungeTables.number });
  await db.insert(productCategories).values(categoriesSeed.map((name) => ({ name }))).onConflictDoUpdate({
    target: productCategories.name,
    set: { active: true }
  });
  await db.insert(settings).values({ id: 1, preventNegativeStock: true, maxTables: 20, rolePermissions: DEFAULT_ROLE_PERMISSIONS, rolePermissionsVersion: 3 }).onConflictDoNothing({ target: settings.id });
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
async function requireOpenCashSession(tx) {
  const active = await tx.select().from(cashSessions).where(eq(cashSessions.status, "open")).for("update").limit(1);
  if (!active[0]) throw new Error("Abra o caixa antes de realizar opera\xE7\xF5es financeiras");
  return active[0];
}
function hashPassword(password, salt = randomBytes2(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}
function validatePassword(password, storedHash) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual2(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
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
    username: "admin",
    name: "Administrador",
    password: process.env.FIXED_ADMIN_PASSWORD ?? "shadow1020",
    localRole: "administrator"
  },
  {
    username: "gerente",
    name: "Gerente",
    password: process.env.FIXED_MANAGER_PASSWORD ?? "shadow1020",
    localRole: "manager"
  },
  {
    username: "atendente",
    name: "Atendente",
    password: process.env.FIXED_ATTENDANT_PASSWORD ?? "shadow1020",
    localRole: "attendant"
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
  const token = randomBytes2(48).toString("hex");
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
      openId: `local-${randomBytes2(24).toString("hex")}`,
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
  }).from(localCredentials).innerJoin(userProfiles, eq(userProfiles.userId, localCredentials.userId)).where(and(eq(localCredentials.username, normalizeUsername(username)), eq(userProfiles.active, true))).limit(1);
  if (!credential[0] || !validatePassword(password, credential[0].passwordHash)) return null;
  return createLocalSession(credential[0].userId);
}
async function createLocalUser(input, actorId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const username = normalizeUsername(input.username);
  const existing = await db.select({ id: localCredentials.id }).from(localCredentials).where(eq(localCredentials.username, username)).limit(1);
  if (existing[0]) throw new Error("Este login j\xE1 est\xE1 cadastrado");
  const result = await db.transaction(async (tx) => {
    const inserted = await tx.insert(users).values({ openId: `local-${randomBytes2(24).toString("hex")}`, name: input.name.trim(), loginMethod: "local", role: "user" }).returning({ id: users.id });
    const userId = Number(inserted[0].id);
    await tx.insert(userProfiles).values({ userId, localRole: input.localRole, active: true });
    await tx.insert(localCredentials).values({ userId, username, passwordHash: hashPassword(input.password) });
    return userId;
  });
  await writeAudit(actorId, "CREATE_USER", "user", result, `Criou o usu\xE1rio ${input.name.trim()} (${auditRoleLabel(input.localRole)})`);
  return { id: result, success: true };
}
function centsOf(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}
function tabTotalsForSubtotal(subtotalCents, tab) {
  const discountCents = 0;
  const tipCents = Math.round(subtotalCents * (tab.tipPercent ?? 0) / 100);
  const manualAdjustmentCents = tab.manualAdjustmentCents ?? 0;
  return { subtotalCents, discountCents, tipCents, manualAdjustmentCents, totalCents: Math.max(0, subtotalCents + tipCents + manualAdjustmentCents) };
}
function tabTotals(items, tab) {
  const subtotalCents = centsOf(items);
  return tabTotalsForSubtotal(subtotalCents, tab);
}
function parseTime(value) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
async function listTables() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const [configuredSettings, allTableRows] = await Promise.all([
    db.select({ maxTables: settings.maxTables }).from(settings).limit(1),
    db.select({ id: loungeTables.id, number: loungeTables.number }).from(loungeTables).orderBy(asc(loungeTables.number))
  ]);
  const maxTables = configuredSettings[0]?.maxTables ?? 20;
  const tableRows = allTableRows.filter((table) => table.number <= maxTables);
  const openTabs = await db.select({
    id: tabs.id,
    tableId: tabs.tableId,
    tabCode: tabs.tabCode,
    customerName: tabs.customerName,
    openedAt: tabs.openedAt,
    version: tabs.version,
    tipPercent: tabs.tipPercent,
    tipCents: tabs.tipCents,
    manualAdjustmentCents: tabs.manualAdjustmentCents
  }).from(tabs).where(eq(tabs.status, "open"));
  const tabIds = openTabs.map((tab) => tab.id);
  const [subtotalRows, paymentRows] = tabIds.length ? await Promise.all([
    db.select({ tabId: tabItems.tabId, subtotalCents: sql2`COALESCE(SUM(${tabItems.quantity}::bigint * ${tabItems.unitPriceCents}::bigint), 0)` }).from(tabItems).where(inArray(tabItems.tabId, tabIds)).groupBy(tabItems.tabId),
    db.select({ tabId: payments.tabId, paidCents: sql2`COALESCE(SUM(${payments.amountCents}::bigint), 0)` }).from(payments).where(inArray(payments.tabId, tabIds)).groupBy(payments.tabId)
  ]) : [[], []];
  const tabsByTable = new Map(openTabs.map((tab) => [tab.tableId, tab]));
  const subtotalByTab = new Map(subtotalRows.map((row) => [row.tabId, Number(row.subtotalCents ?? 0)]));
  const paidByTab = /* @__PURE__ */ new Map();
  for (const payment of paymentRows) paidByTab.set(payment.tabId, Number(payment.paidCents ?? 0));
  return tableRows.map((table) => {
    const tab = tabsByTable.get(table.id);
    const subtotal = tab ? subtotalByTab.get(tab.id) ?? 0 : 0;
    const paid = tab ? paidByTab.get(tab.id) ?? 0 : 0;
    const total = tab ? tabTotalsForSubtotal(subtotal, tab).totalCents : 0;
    const balance = Math.max(total - paid, 0);
    const computedStatus = !tab ? "free" : paid > 0 && balance > 0 ? "partial" : "occupied";
    return {
      id: table.id,
      number: table.number,
      status: computedStatus,
      tabId: tab?.id ?? null,
      tabCode: tab?.tabCode ?? null,
      version: tab?.version ?? null,
      customerName: tab?.customerName ?? null,
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
    customerName: tabs.customerName,
    customerId: tabs.customerId,
    customerCpf: customers.cpf,
    status: tabs.status,
    version: tabs.version,
    openedAt: tabs.openedAt,
    closedAt: tabs.closedAt,
    discountPercent: tabs.discountPercent,
    discountCents: tabs.discountCents,
    tipPercent: tabs.tipPercent,
    tipCents: tabs.tipCents,
    manualAdjustmentCents: tabs.manualAdjustmentCents,
    adjustmentReason: tabs.adjustmentReason,
    tableNumber: loungeTables.number,
    tableId: loungeTables.id,
    openedByName: users.name
  }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).leftJoin(users, eq(tabs.openedBy, users.id)).leftJoin(customers, eq(tabs.customerId, customers.id)).where(eq(tabs.id, tabId)).limit(1);
  if (!tab[0]) throw new Error("Comanda n\xE3o encontrada");
  const [items, paymentRows, launchHistory] = await Promise.all([
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
      addedByName: users.name,
      createdAt: tabItems.createdAt
    }).from(tabItems).leftJoin(users, eq(tabItems.addedBy, users.id)).where(eq(tabItems.tabId, tabId)).orderBy(desc(tabItems.createdAt)),
    db.select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      createdAt: payments.createdAt,
      receivedByName: users.name
    }).from(payments).leftJoin(users, eq(payments.receivedBy, users.id)).where(eq(payments.tabId, tabId)).orderBy(desc(payments.createdAt)),
    db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      description: auditLogs.description,
      createdAt: auditLogs.createdAt,
      userName: users.name
    }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).where(and(eq(auditLogs.entityType, "tab"), eq(auditLogs.entityId, tabId), inArray(auditLogs.action, ["ADD_ITEM", "UPDATE_ITEM", "REMOVE_ITEM", "ADJUST_TAB_TOTAL"]))).orderBy(desc(auditLogs.createdAt)).limit(100)
  ]);
  const totals = tabTotals(items, tab[0]);
  const totalCents = totals.totalCents;
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...tab[0], items, payments: paymentRows, launchHistory, ...totals, paidCents, balanceCents: Math.max(totalCents - paidCents, 0) };
}
async function setTabCustomerName(tabId, customerName, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const normalizedName = customerName?.trim() || null;
  return db.transaction(async (tx) => {
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    await tx.update(tabs).set({ customerName: normalizedName, customerId: null, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.insert(auditLogs).values({
      userId,
      action: "UPDATE_TAB_CUSTOMER",
      entityType: "tab",
      entityId: tabId,
      description: normalizedName ? `Atribuiu a comanda ${tab[0].tabCode} a ${normalizedName}` : `Removeu o nome da comanda ${tab[0].tabCode}`
    });
    return { tabId, customerName: normalizedName };
  });
}
async function listCustomers() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await ensureInitialData();
  return db.select().from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name));
}
async function saveCustomer(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const cpf = normalizeCpf(input.cpf);
  if (!isValidCpf(cpf)) throw new Error("CPF inv\xE1lido. Confira os 11 d\xEDgitos e tente novamente.");
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Informe o nome do cliente");
  const data = { name, cpf, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null, active: true, updatedAt: /* @__PURE__ */ new Date() };
  const result = input.id ? await db.update(customers).set(data).where(eq(customers.id, input.id)).returning({ id: customers.id }) : await db.insert(customers).values(data).returning({ id: customers.id });
  if (!result[0]) throw new Error("Cliente n\xE3o encontrado");
  await writeAudit(userId, input.id ? "UPDATE_CUSTOMER" : "CREATE_CUSTOMER", "customer", Number(result[0].id), `${input.id ? "Atualizou" : "Cadastrou"} o cliente ${name}`);
  return { id: Number(result[0].id), success: true };
}
async function deleteCustomer(customerId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.update(customers).set({ active: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(customers.id, customerId));
  const affected = result.rowCount ?? 0;
  if (affected !== 1) throw new Error("Cliente n\xE3o encontrado");
  await writeAudit(userId, "DEACTIVATE_CUSTOMER", "customer", customerId, "Desativou um cliente");
  return { success: true };
}
async function assignTabCustomer(tabId, customerId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const customer = customerId ? await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.active, true))).limit(1) : [];
    if (customerId && !customer[0]) throw new Error("Cliente n\xE3o encontrado ou inativo");
    await tx.update(tabs).set({ customerId, customerName: customer[0]?.name ?? null, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CUSTOMER", entityType: "tab", entityId: tabId, description: customer[0] ? `Atribuiu ${customer[0].name} (CPF ${customer[0].cpf}) \xE0 comanda ${tab[0].tabCode}` : `Removeu o cliente da comanda ${tab[0].tabCode}` });
    return { tabId, customerId, customerName: customer[0]?.name ?? null, customerCpf: customer[0]?.cpf ?? null };
  });
}
async function openTab(tableId, userId, openedByName) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const table = await tx.select({ id: loungeTables.id, number: loungeTables.number }).from(loungeTables).where(eq(loungeTables.id, tableId)).for("update").limit(1);
    if (!table[0]) throw new Error("Mesa n\xE3o encontrada");
    const existingOpenTab = await tx.select({ id: tabs.id }).from(tabs).where(and(eq(tabs.tableId, tableId), eq(tabs.status, "open"))).limit(1);
    if (existingOpenTab[0]) throw new Error("Esta mesa j\xE1 possui uma comanda aberta");
    const activeCash = await tx.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.status, "open")).for("update").limit(1);
    const defaultTipPercent = activeCash[0] ? 10 : 0;
    const inserted = await tx.insert(tabs).values({ tableId, tabCode: `ABERTA-${Date.now()}`, openedBy: userId, tipPercent: defaultTipPercent }).returning({ id: tabs.id, openedAt: tabs.openedAt });
    const tabId = Number(inserted[0].id);
    const tabCode = `#${String(tabId).padStart(6, "0")}`;
    await tx.update(tabs).set({ tabCode }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ activeTabId: tabId, status: "occupied" }).where(eq(loungeTables.id, tableId));
    await tx.insert(auditLogs).values({ userId, action: "OPEN_TAB", entityType: "tab", entityId: tabId, description: `Abriu a comanda ${tabCode}` });
    return {
      id: tabId,
      tabCode,
      tableId,
      tableNumber: table[0].number,
      status: "open",
      version: 1,
      customerName: null,
      customerId: null,
      customerCpf: null,
      openedAt: inserted[0].openedAt,
      closedAt: null,
      openedByName,
      discountPercent: 0,
      discountCents: 0,
      tipPercent: defaultTipPercent,
      tipCents: 0,
      manualAdjustmentCents: 0,
      adjustmentReason: null,
      items: [],
      payments: [],
      launchHistory: [],
      subtotalCents: 0,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0
    };
  });
}
async function syncOfflineTab(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const fingerprint = createOfflineTabFingerprint(input);
  if (new Set(input.payments.map((payment) => payment.requestKey)).size !== input.payments.length) throw new Error("A sincroniza\xE7\xE3o cont\xE9m chaves de pagamento repetidas");
  return db.transaction(async (tx) => {
    await tx.execute(sql2`SELECT pg_advisory_xact_lock(hashtextextended(${input.offlineKey}, 0))`);
    const existing = await tx.select({ id: tabs.id, tabCode: tabs.tabCode, offlineFingerprint: tabs.offlineFingerprint }).from(tabs).where(eq(tabs.offlineKey, input.offlineKey)).limit(1);
    if (existing[0]) {
      if (!offlineFingerprintMatches(existing[0].offlineFingerprint, fingerprint)) {
        if (!existing[0].offlineFingerprint) throw new Error("H\xE1 uma comanda antiga com esta chave offline, mas sem dados suficientes para validar a repeti\xE7\xE3o. Confira o hist\xF3rico antes de descartar a fila local.");
        throw new Error("Esta chave offline j\xE1 foi usada com dados diferentes");
      }
      return { tabId: existing[0].id, tabCode: existing[0].tabCode, duplicate: true };
    }
    const activeCash = input.items.length > 0 || input.payments.length > 0 || input.tipPercent === 10 ? await requireOpenCashSession(tx) : null;
    await tx.execute(sql2`SELECT id FROM lounge_tables WHERE id = ${input.tableId} FOR UPDATE`);
    const table = await tx.select().from(loungeTables).where(eq(loungeTables.id, input.tableId)).limit(1);
    if (!table[0]) throw new Error("Mesa n\xE3o encontrada");
    const open = await tx.select({ id: tabs.id }).from(tabs).where(and(eq(tabs.tableId, input.tableId), eq(tabs.status, "open"))).limit(1);
    if (open[0]) throw new Error(`A mesa ${table[0].number} j\xE1 possui uma comanda aberta`);
    const cashSessionId = activeCash ? Number(activeCash.id) : null;
    const inserted = await tx.insert(tabs).values({ tableId: input.tableId, tabCode: `OFFLINE-${Date.now()}`, offlineKey: input.offlineKey, offlineFingerprint: fingerprint, customerName: input.customerName?.trim() || null, openedBy: userId }).returning({ id: tabs.id });
    const tabId = Number(inserted[0].id);
    const tabCode = `#${String(tabId).padStart(6, "0")}`;
    await tx.update(tabs).set({ tabCode }).where(eq(tabs.id, tabId));
    let subtotalCents = 0;
    for (const item of input.items) {
      if (item.quantity < 1 || item.quantity > 99) throw new Error("Quantidade de produto inv\xE1lida");
      await tx.execute(sql2`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`);
      const product = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product[0] || !product[0].active) throw new Error(`Produto indispon\xEDvel: ${item.productName}`);
      const systemSettings = await tx.select().from(settings).limit(1);
      if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < item.quantity) throw new Error(`Estoque insuficiente para ${product[0].name}`);
      await tx.update(products).set({ stockQuantity: sql2`${products.stockQuantity} - ${item.quantity}` }).where(eq(products.id, product[0].id));
      await tx.insert(tabItems).values({ tabId, productId: product[0].id, productName: product[0].name, quantity: item.quantity, baseUnitPriceCents: product[0].priceCents, unitPriceCents: product[0].priceCents, unitCostCents: product[0].costCents, note: item.note ?? null, addedBy: userId, ...item.createdAt ? { createdAt: new Date(item.createdAt) } : {} });
      await tx.insert(stockMovements).values({ productId: product[0].id, quantity: item.quantity, direction: "out", reason: "Venda em comanda offline", referenceType: "tab", referenceId: tabId, createdBy: userId });
      await tx.insert(auditLogs).values({ userId, action: "ADD_ITEM", entityType: "tab", entityId: tabId, description: `Adicionou ${item.quantity}x ${product[0].name} \xE0 comanda ${tabCode} (sincroniza\xE7\xE3o offline)` });
      subtotalCents += item.quantity * product[0].priceCents;
    }
    const tipCents = Math.round(subtotalCents * input.tipPercent / 100);
    await tx.update(tabs).set({ tipPercent: input.tipPercent, tipCents }).where(eq(tabs.id, tabId));
    let paidCents = 0;
    for (const payment of input.payments) {
      if (payment.amountCents <= 0) throw new Error("Pagamento offline inv\xE1lido");
      const duplicatePayment = await tx.select({ id: payments.id }).from(payments).where(eq(payments.requestKey, payment.requestKey)).limit(1);
      if (duplicatePayment[0]) throw new Error("Esta chave de pagamento j\xE1 foi usada em outra sincroniza\xE7\xE3o");
      if (paidCents + payment.amountCents > subtotalCents + tipCents) throw new Error("Os pagamentos superam o total da comanda");
      await tx.insert(payments).values({ tabId, cashSessionId, amountCents: payment.amountCents, method: payment.method, requestKey: payment.requestKey, receivedBy: userId });
      paidCents += payment.amountCents;
    }
    await tx.update(loungeTables).set({ activeTabId: tabId, status: paidCents === subtotalCents + tipCents ? "occupied" : paidCents > 0 ? "partial" : "occupied", updatedAt: /* @__PURE__ */ new Date() }).where(eq(loungeTables.id, input.tableId));
    await tx.insert(auditLogs).values({ userId, action: "SYNC_OFFLINE_TAB", entityType: "tab", entityId: tabId, description: `Sincronizou a comanda offline ${tabCode} do dispositivo ${input.deviceId.slice(-12)}` });
    return { tabId, tabCode, duplicate: false };
  });
}
async function transferTab(tabId, destinationTableId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    if (tab[0].tableId === destinationTableId) throw new Error("Escolha uma mesa diferente da atual");
    await tx.execute(sql2`SELECT id FROM lounge_tables WHERE id = ${destinationTableId} FOR UPDATE`);
    const destination = await tx.select().from(loungeTables).where(eq(loungeTables.id, destinationTableId)).limit(1);
    if (!destination[0]) throw new Error("Mesa de destino n\xE3o encontrada");
    if (destination[0].status !== "free" || destination[0].activeTabId) throw new Error("A mesa de destino j\xE1 est\xE1 ocupada");
    await tx.update(tabs).set({ tableId: destinationTableId, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
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
async function addTabItem(input, userId, addedByName) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await requireOpenCashSession(tx);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).for("update").limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).for("update").limit(1);
    if (!product[0] || !product[0].active) throw new Error("Produto indispon\xEDvel");
    const systemSettings = await tx.select().from(settings).limit(1);
    if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < input.quantity) throw new Error("Estoque insuficiente para este lan\xE7amento");
    const { weekday: currentWeekday, minutes: currentMinutes } = saoPauloClock(/* @__PURE__ */ new Date());
    const scheduledRules = await tx.select().from(productPriceRules).where(and(eq(productPriceRules.productId, input.productId), eq(productPriceRules.active, true)));
    const scheduledRule = scheduledRules.find((rule) => priceRuleAppliesAt(weekdaysFromMask(rule.weekdaysMask) ?? rule.daysOfWeek, rule.startTime, rule.endTime, currentWeekday, currentMinutes));
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
    await tx.update(products).set({ stockQuantity: sql2`${products.stockQuantity} - ${input.quantity}` }).where(eq(products.id, input.productId));
    const insertedItem = await tx.insert(tabItems).values({
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
    }).returning({
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
    });
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: "out", reason: "Venda em comanda", referenceType: "tab", referenceId: input.tabId, createdBy: userId });
    const updatedTab = await tx.update(tabs).set({
      tipCents: sql2`ROUND(COALESCE((SELECT SUM("quantity"::bigint * "unitPriceCents"::bigint) FROM "tab_items" WHERE "tabId" = ${input.tabId}), 0) * ${tab[0].tipPercent} / 100)::integer`,
      version: sql2`${tabs.version} + 1`
    }).where(eq(tabs.id, input.tabId)).returning({
      version: tabs.version,
      subtotalCents: sql2`COALESCE((SELECT SUM("quantity"::bigint * "unitPriceCents"::bigint) FROM "tab_items" WHERE "tabId" = ${input.tabId}), 0)`
    });
    const currentTotals = tabTotalsForSubtotal(Number(updatedTab[0]?.subtotalCents ?? 0), tab[0]);
    const description = `Adicionou ${input.quantity}x ${product[0].name} \xE0 comanda ${tab[0].tabCode}`;
    const audit = await tx.insert(auditLogs).values({ userId, action: "ADD_ITEM", entityType: "tab", entityId: input.tabId, description }).returning({ id: auditLogs.id, createdAt: auditLogs.createdAt });
    return {
      item: { ...insertedItem[0], addedByName },
      product: { id: product[0].id, stockQuantity: product[0].stockQuantity - input.quantity },
      ...currentTotals,
      version: updatedTab[0]?.version ?? tab[0].version + 1,
      audit: { id: audit[0].id, action: "ADD_ITEM", description, createdAt: audit[0].createdAt, userName: addedByName }
    };
  });
}
async function setTabItemQuantity(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await requireOpenCashSession(tx);
    const item = await tx.select().from(tabItems).where(eq(tabItems.id, input.itemId)).limit(1);
    if (!item[0]) throw new Error("Item n\xE3o encontrado");
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${item[0].tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, item[0].tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const delta = input.quantity - item[0].quantity;
    await tx.execute(sql2`SELECT id FROM products WHERE id = ${item[0].productId} FOR UPDATE`);
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
      await tx.update(products).set({ stockQuantity: sql2`${products.stockQuantity} - ${delta}` }).where(eq(products.id, product[0].id));
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
    const currentItems = await tx.select({ quantity: tabItems.quantity, unitPriceCents: tabItems.unitPriceCents }).from(tabItems).where(eq(tabItems.tabId, item[0].tabId));
    const currentTotals = tabTotals(currentItems, tab[0]);
    const paymentsRows = await tx.select().from(payments).where(eq(payments.tabId, item[0].tabId));
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (currentTotals.totalCents < paidCents) throw new Error("N\xE3o \xE9 poss\xEDvel reduzir a comanda abaixo do valor j\xE1 pago");
    await tx.update(tabs).set({ tipCents: currentTotals.tipCents, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, item[0].tabId));
    const description = input.quantity === 0 ? `Removeu ${item[0].quantity}x ${item[0].productName} da comanda ${tab[0].tabCode}` : `Alterou a quantidade de ${item[0].productName} de ${item[0].quantity} para ${input.quantity} na comanda ${tab[0].tabCode}`;
    await tx.insert(auditLogs).values({ userId, action: input.quantity === 0 ? "REMOVE_ITEM" : "UPDATE_ITEM", entityType: "tab", entityId: item[0].tabId, description });
  });
}
async function setTabCharges(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await requireOpenCashSession(tx);
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const items = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentsRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const totals = tabTotals(items, { ...tab[0], tipPercent: input.tipPercent });
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents > totals.totalCents) throw new Error("O novo total n\xE3o pode ficar abaixo do valor j\xE1 pago");
    await tx.update(tabs).set({ discountPercent: 0, discountCents: 0, tipPercent: input.tipPercent, tipCents: totals.tipCents, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CHARGES", entityType: "tab", entityId: input.tabId, description: `Aplicou 10% de gorjeta` });
    return { ...totals, paidCents, balanceCents: totals.totalCents - paidCents };
  });
}
async function adjustTabValue(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await requireOpenCashSession(tx);
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const [items, paymentRows] = await Promise.all([
      tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId)),
      tx.select().from(payments).where(eq(payments.tabId, input.tabId))
    ]);
    const baseTotals = tabTotals(items, { ...tab[0], manualAdjustmentCents: 0 });
    const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    const plan = planTabTotalAdjustment({
      baseTotalCents: baseTotals.totalCents,
      currentAdjustmentCents: tab[0].manualAdjustmentCents,
      newTotalCents: input.newTotalCents,
      paidCents
    });
    const reason = input.reason.trim();
    await tx.update(tabs).set({
      manualAdjustmentCents: plan.adjustmentCents,
      adjustmentReason: reason,
      version: sql2`${tabs.version} + 1`
    }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({
      userId,
      action: "ADJUST_TAB_TOTAL",
      entityType: "tab",
      entityId: input.tabId,
      description: `Alterou o total da comanda ${tab[0].tabCode} de R$ ${(plan.currentTotalCents / 100).toFixed(2)} para R$ ${(plan.newTotalCents / 100).toFixed(2)}. Justificativa: ${reason}`
    });
    return { ...tabTotals(items, { ...tab[0], manualAdjustmentCents: plan.adjustmentCents }), paidCents, balanceCents: plan.newTotalCents - paidCents };
  });
}
async function registerPayment(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const returnDuplicateOrRejectMismatch = (existing) => {
      if (!paymentRequestMatches(existing, input)) {
        throw new Error("Esta chave de pagamento j\xE1 foi usada com dados diferentes");
      }
      return { paymentId: existing.id, duplicate: true };
    };
    const previous = await tx.select({ id: payments.id, tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method }).from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
    if (previous[0]) return returnDuplicateOrRejectMismatch(previous[0]);
    const activeCash = await tx.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.status, "open")).for("update").limit(1);
    if (!activeCash[0]) throw new Error("Abra o caixa antes de realizar opera\xE7\xF5es financeiras");
    const duplicateAfterLock = await tx.select({ id: payments.id, tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method }).from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
    if (duplicateAfterLock[0]) return returnDuplicateOrRejectMismatch(duplicateAfterLock[0]);
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda est\xE1 encerrada");
    const itemRows = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (input.amountCents <= 0) throw new Error("Informe um valor de pagamento v\xE1lido");
    if (input.amountCents > balance) throw new Error("O pagamento n\xE3o pode superar o saldo pendente");
    const inserted = await tx.insert(payments).values({ ...input, cashSessionId: Number(activeCash[0].id), receivedBy: userId }).returning({ id: payments.id });
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
    await tx.execute(sql2`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda j\xE1 est\xE1 encerrada");
    const [itemRows, paymentRows] = await Promise.all([
      tx.select().from(tabItems).where(eq(tabItems.tabId, tabId)),
      tx.select().from(payments).where(eq(payments.tabId, tabId))
    ]);
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (balance !== 0) throw new Error(`N\xE3o \xE9 poss\xEDvel encerrar: saldo pendente de R$ ${(balance / 100).toFixed(2)}`);
    await tx.update(tabs).set({ status: "closed", closedAt: /* @__PURE__ */ new Date(), closedBy: userId, version: sql2`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
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
  const data = { ...input, stockQuantity: input.stockQuantity ?? 0, categoryId: input.categoryId ?? null, notes: input.notes || null };
  if (input.id) {
    const { stockQuantity: _initialStockQuantity, ...updateData } = data;
    await db.update(products).set(updateData).where(eq(products.id, input.id));
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
  const usedInStock = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.productId, productId)).limit(1);
  if (usedInTabs[0] || usedInStock[0]) {
    await db.update(products).set({ active: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(products.id, productId));
    await writeAudit(userId, "DEACTIVATE_PRODUCT", "product", productId, `Desativou ${product[0].name} para preservar o hist\xF3rico`);
    return { success: true, deleted: false };
  }
  await db.delete(productPriceRules).where(eq(productPriceRules.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
  await writeAudit(userId, "DELETE_PRODUCT", "product", productId, `Removeu ${product[0].name}`);
  return { success: true, deleted: true };
}
async function setProductActive(productId, active, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product[0]) throw new Error("Produto n\xE3o encontrado");
  await db.update(products).set({ active, updatedAt: /* @__PURE__ */ new Date() }).where(eq(products.id, productId));
  await writeAudit(userId, active ? "ACTIVATE_PRODUCT" : "DEACTIVATE_PRODUCT", "product", productId, `${active ? "Ativou" : "Desativou"} ${product[0].name}`);
  return { success: true, active };
}
async function adjustStock(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    await tx.execute(sql2`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product[0]) throw new Error("Produto n\xE3o encontrado");
    const change = input.direction === "in" ? input.quantity : -input.quantity;
    const systemSettings = await tx.select().from(settings).limit(1);
    if (change < 0 && systemSettings[0]?.preventNegativeStock && product[0].stockQuantity + change < 0) throw new Error("Ajuste resultaria em estoque negativo");
    await tx.update(products).set({ stockQuantity: sql2`${products.stockQuantity} + ${change}` }).where(eq(products.id, input.productId));
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: input.direction, reason: input.reason, createdBy: userId });
    const stockAction = input.direction === "in" ? "Entrada" : "Sa\xEDda";
    const nextStock = product[0].stockQuantity + change;
    await tx.insert(auditLogs).values({
      userId,
      action: "ADJUST_STOCK",
      entityType: "product",
      entityId: input.productId,
      description: `${stockAction} de ${input.quantity} ${product[0].unit} de ${product[0].name} no estoque (${product[0].stockQuantity} \u2192 ${nextStock} ${product[0].unit}). Motivo: ${input.reason}`
    });
  });
}
async function listStockMovements(input) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const pageSize = 25;
  const page = Math.max(1, Math.floor(input.page));
  const where = and(
    input.from ? gte(stockMovements.createdAt, input.from) : void 0,
    input.to ? lte(stockMovements.createdAt, input.to) : void 0,
    input.productId ? eq(stockMovements.productId, input.productId) : void 0
  );
  const [countRows, items] = await Promise.all([
    db.select({ count: sql2`count(*)::int` }).from(stockMovements).innerJoin(products, eq(stockMovements.productId, products.id)).where(where),
    db.select({
      id: stockMovements.id,
      quantity: stockMovements.quantity,
      direction: stockMovements.direction,
      reason: stockMovements.reason,
      createdAt: stockMovements.createdAt,
      productName: products.name,
      unit: products.unit,
      userName: users.name
    }).from(stockMovements).innerJoin(products, eq(stockMovements.productId, products.id)).leftJoin(users, eq(stockMovements.createdBy, users.id)).where(where).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id)).limit(pageSize).offset((page - 1) * pageSize)
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
async function createExpense(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const activeCash = await requireOpenCashSession(tx);
    if (input.method === "cash") {
      const summary = await getCashSessionReport(tx, activeCash);
      if (!isCashOutflowAllowed(input.amountCents, summary.expectedCashCents)) throw new Error("A despesa supera o dinheiro esperado dispon\xEDvel no caixa");
    }
    const inserted = await tx.insert(expenses).values({ ...input, notes: input.notes || null, createdBy: userId, cashSessionId: activeCash.id }).returning({ id: expenses.id });
    const id = Number(inserted[0].id);
    await tx.insert(auditLogs).values({ userId, action: "CREATE_EXPENSE", entityType: "expense", entityId: id, description: `Registrou despesa: ${input.description}${input.method === "cash" ? " paga em dinheiro e vinculada ao caixa" : ""}` });
    return { id };
  });
}
async function listExpenses(input) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const pageSize = 25;
  const page = Math.max(1, Math.floor(input.page));
  const where = and(
    input.from ? gte(expenses.occurredAt, input.from) : void 0,
    input.to ? lte(expenses.occurredAt, input.to) : void 0
  );
  const [countRows, items] = await Promise.all([
    db.select({ count: sql2`count(*)::int` }).from(expenses).where(where),
    db.select({
      id: expenses.id,
      description: expenses.description,
      category: expenses.category,
      amountCents: expenses.amountCents,
      method: expenses.method,
      notes: expenses.notes,
      occurredAt: expenses.occurredAt,
      userName: users.name
    }).from(expenses).leftJoin(users, eq(expenses.createdBy, users.id)).where(where).orderBy(desc(expenses.occurredAt), desc(expenses.id)).limit(pageSize).offset((page - 1) * pageSize)
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
async function getCashSessionReport(executor, session) {
  const [paymentRows, movementRows, expenseRows, openedByRows] = await Promise.all([
    executor.select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      createdAt: payments.createdAt,
      tabCode: tabs.tabCode,
      tableNumber: loungeTables.number,
      receivedByName: users.name
    }).from(payments).leftJoin(tabs, eq(payments.tabId, tabs.id)).leftJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).leftJoin(users, eq(payments.receivedBy, users.id)).where(eq(payments.cashSessionId, session.id)).orderBy(desc(payments.createdAt), desc(payments.id)),
    executor.select({
      id: cashMovements.id,
      kind: cashMovements.kind,
      amountCents: cashMovements.amountCents,
      description: cashMovements.description,
      createdAt: cashMovements.createdAt,
      userName: users.name
    }).from(cashMovements).leftJoin(users, eq(cashMovements.createdBy, users.id)).where(eq(cashMovements.sessionId, session.id)).orderBy(desc(cashMovements.createdAt), desc(cashMovements.id)),
    executor.select({
      id: expenses.id,
      description: expenses.description,
      category: expenses.category,
      amountCents: expenses.amountCents,
      method: expenses.method,
      occurredAt: expenses.occurredAt,
      createdAt: expenses.createdAt,
      userName: users.name
    }).from(expenses).leftJoin(users, eq(expenses.createdBy, users.id)).where(eq(expenses.cashSessionId, session.id)).orderBy(desc(expenses.createdAt), desc(expenses.id)),
    executor.select({ name: users.name }).from(users).where(eq(users.id, session.openedBy)).limit(1)
  ]);
  const closedByRows = session.closedBy ? await executor.select({ name: users.name }).from(users).where(eq(users.id, session.closedBy)).limit(1) : [];
  const totals = calculateCashSessionTotals({
    openingFloatCents: Number(session.openingFloatCents),
    payments: paymentRows,
    movements: movementRows,
    expenses: expenseRows
  });
  return {
    ...session,
    openedByName: openedByRows[0]?.name || "Operador",
    closedByName: closedByRows[0]?.name || null,
    ...totals,
    expectedCashCents: session.status === "closed" && session.expectedCashCents !== null ? session.expectedCashCents : totals.expectedCashCents,
    countedCashCents: session.countedCashCents ?? null,
    differenceCents: session.status === "closed" ? session.differenceCents : null,
    payments: paymentRows,
    movements: movementRows,
    expenses: expenseRows
  };
}
async function getCurrentCashSession() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const rows = await db.select().from(cashSessions).where(eq(cashSessions.status, "open")).orderBy(desc(cashSessions.id)).limit(1);
  return rows[0] ? getCashSessionReport(db, rows[0]) : null;
}
async function getCashSessionStatus() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const rows = await db.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.status, "open")).limit(1);
  return { open: Boolean(rows[0]) };
}
async function getCashSessionDetails(sessionId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const rows = await db.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).limit(1);
  if (!rows[0]) throw new Error("Sess\xE3o de caixa n\xE3o encontrada");
  return getCashSessionReport(db, rows[0]);
}
async function listCashSessions(input) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const pageSize = 20;
  const page = Math.max(1, Math.floor(input.page));
  const [countRows, items] = await Promise.all([
    db.select({ count: sql2`count(*)::int` }).from(cashSessions).where(eq(cashSessions.status, "closed")),
    db.select({
      id: cashSessions.id,
      status: cashSessions.status,
      openingFloatCents: cashSessions.openingFloatCents,
      openedBy: cashSessions.openedBy,
      openedByName: sql2`COALESCE((SELECT name FROM users WHERE id = ${cashSessions.openedBy}), 'Operador')`,
      openedAt: cashSessions.openedAt,
      closedBy: cashSessions.closedBy,
      closedByName: sql2`(SELECT name FROM users WHERE id = ${cashSessions.closedBy})`,
      closedAt: cashSessions.closedAt,
      expectedCashCents: cashSessions.expectedCashCents,
      countedCashCents: cashSessions.countedCashCents,
      differenceCents: cashSessions.differenceCents,
      closeNote: cashSessions.closeNote
    }).from(cashSessions).where(eq(cashSessions.status, "closed")).orderBy(desc(cashSessions.openedAt), desc(cashSessions.id)).limit(pageSize).offset((page - 1) * pageSize)
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
async function openCashSession(openingFloatCents, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx.select({ id: cashSessions.id }).from(cashSessions).where(eq(cashSessions.status, "open")).for("update").limit(1);
      if (existing[0]) throw new Error("J\xE1 existe um caixa aberto. Feche a sess\xE3o atual antes de abrir outra.");
      const inserted = await tx.insert(cashSessions).values({ openingFloatCents, openedBy: userId, status: "open" }).returning({ id: cashSessions.id });
      const id = Number(inserted[0].id);
      await tx.insert(auditLogs).values({ userId, action: "OPEN_CASH_SESSION", entityType: "cash_session", entityId: id, description: `Abriu caixa com fundo inicial de R$ ${(openingFloatCents / 100).toFixed(2)}` });
      return { id };
    });
  } catch (error) {
    const databaseError = error;
    if (databaseError.code === "23505" || databaseError.cause?.code === "23505") throw new Error("J\xE1 existe um caixa aberto. Feche a sess\xE3o atual antes de abrir outra.");
    throw error;
  }
}
async function addCashMovement(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const active = await tx.select().from(cashSessions).where(eq(cashSessions.status, "open")).for("update").limit(1);
    if (!active[0]) throw new Error("Abra o caixa antes de registrar movimenta\xE7\xF5es");
    const isOutflow = input.kind !== "supply";
    const summary = isOutflow ? await getCashSessionReport(tx, active[0]) : null;
    if (summary && !isCashOutflowAllowed(input.amountCents, summary.expectedCashCents)) throw new Error("A sa\xEDda supera o dinheiro esperado dispon\xEDvel no caixa");
    const inserted = await tx.insert(cashMovements).values({ ...input, description: input.description.trim(), sessionId: active[0].id, createdBy: userId }).returning({ id: cashMovements.id });
    const action = input.kind === "supply" ? "CASH_SUPPLY" : input.kind === "refund" ? "CASH_REFUND" : "CASH_WITHDRAWAL";
    const label = input.kind === "supply" ? "suprimento" : input.kind === "refund" ? "devolu\xE7\xE3o em dinheiro" : "sangria";
    await tx.insert(auditLogs).values({ userId, action, entityType: "cash_movement", entityId: Number(inserted[0].id), description: `Registrou ${label} de R$ ${(input.amountCents / 100).toFixed(2)}: ${input.description.trim()}` });
    return { id: Number(inserted[0].id) };
  });
}
async function closeCashSession(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const active = await tx.select().from(cashSessions).where(and(eq(cashSessions.id, input.sessionId), eq(cashSessions.status, "open"))).for("update").limit(1);
    if (!active[0]) throw new Error("Esta sess\xE3o n\xE3o est\xE1 aberta");
    const summary = await getCashSessionReport(tx, active[0]);
    const differenceCents = calculateCashDifferenceCents(input.countedCashCents, summary.expectedCashCents);
    const closedAt = /* @__PURE__ */ new Date();
    await tx.update(cashSessions).set({
      status: "closed",
      closedBy: userId,
      closedAt,
      countedCashCents: input.countedCashCents,
      expectedCashCents: summary.expectedCashCents,
      differenceCents,
      closeNote: input.note?.trim() || null
    }).where(eq(cashSessions.id, input.sessionId));
    await tx.insert(auditLogs).values({ userId, action: "CLOSE_CASH_SESSION", entityType: "cash_session", entityId: input.sessionId, description: `Fechou caixa: esperado R$ ${(summary.expectedCashCents / 100).toFixed(2)}, contado R$ ${(input.countedCashCents / 100).toFixed(2)}, diferen\xE7a R$ ${(differenceCents / 100).toFixed(2)}` });
    return { id: input.sessionId, expectedCashCents: summary.expectedCashCents, countedCashCents: input.countedCashCents, differenceCents, closedAt };
  });
}
async function getDashboard(rangeDays = 30) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const now = /* @__PURE__ */ new Date();
  const normalizedRange = Number.isInteger(rangeDays) && rangeDays > 0 ? Math.min(365, rangeDays) : 30;
  const start = saoPauloDayStart(addDaysToSaoPauloDateKey(saoPauloDateKey(now), -normalizedRange + 1));
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
    lowStockProducts: inventory.filter((product) => product.stockQuantity <= product.minimumStock).sort((a, b) => a.stockQuantity - a.minimumStock - (b.stockQuantity - b.minimumStock)).slice(0, 3).map(({ name, stockQuantity, minimumStock }) => ({ name, stockQuantity, minimumStock })),
    paymentMethods,
    topProducts: Array.from(productMap.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 5),
    dailyRevenue: buildDailyRevenue(normalizedRange, paymentRows, now)
  };
}
async function listAudit() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    description: auditLogs.description,
    createdAt: auditLogs.createdAt,
    userName: users.name
  }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(100);
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
async function getReportSummary(from, to, includeFinanceDetails = true) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const closedTabFilters = [eq(tabs.status, "closed"), from ? gte(tabs.closedAt, from) : void 0, to ? lte(tabs.closedAt, to) : void 0].filter(Boolean);
  const expenseFilters = [from ? gte(expenses.occurredAt, from) : void 0, to ? lte(expenses.occurredAt, to) : void 0].filter(Boolean);
  const paymentFilters = [from ? gte(payments.createdAt, from) : void 0, to ? lte(payments.createdAt, to) : void 0].filter(Boolean);
  const [closedTabs, expenseRows] = await Promise.all([
    db.select({ id: tabs.id, tabCode: tabs.tabCode, customerName: tabs.customerName, closedAt: tabs.closedAt, tipCents: tabs.tipCents, discountCents: tabs.discountCents, manualAdjustmentCents: tabs.manualAdjustmentCents, adjustmentReason: tabs.adjustmentReason, tableNumber: loungeTables.number }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(and(...closedTabFilters)).orderBy(desc(tabs.closedAt)),
    includeFinanceDetails ? db.select({ amountCents: expenses.amountCents, category: expenses.category }).from(expenses).where(expenseFilters.length ? and(...expenseFilters) : void 0) : Promise.resolve([])
  ]);
  const tabIds = closedTabs.map((tab) => tab.id);
  const [salesPaymentRows, productRows, periodPaymentRows] = await Promise.all([
    includeFinanceDetails && tabIds.length ? db.select({ tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt }).from(payments).where(inArray(payments.tabId, tabIds)).orderBy(asc(payments.createdAt)) : Promise.resolve([]),
    tabIds.length ? db.select({ id: tabItems.id, tabId: tabItems.tabId, productName: tabItems.productName, quantity: tabItems.quantity, unitPriceCents: tabItems.unitPriceCents, unitCostCents: tabItems.unitCostCents }).from(tabItems).where(inArray(tabItems.tabId, tabIds)).orderBy(asc(tabItems.id)) : Promise.resolve([]),
    includeFinanceDetails ? db.select({ tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt, tabCode: tabs.tabCode, tabStatus: tabs.status, tableNumber: loungeTables.number }).from(payments).innerJoin(tabs, eq(payments.tabId, tabs.id)).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(paymentFilters.length ? and(...paymentFilters) : void 0).orderBy(desc(payments.createdAt)) : Promise.resolve([])
  ]);
  const productsMap = /* @__PURE__ */ new Map();
  const itemsByTab = /* @__PURE__ */ new Map();
  for (const item of productRows) {
    const items = itemsByTab.get(item.tabId) ?? [];
    items.push(item);
    itemsByTab.set(item.tabId, items);
    const current = productsMap.get(item.productName) ?? { productName: item.productName, quantity: 0, totalCents: 0 };
    current.quantity += item.quantity;
    current.totalCents += item.quantity * item.unitPriceCents;
    productsMap.set(item.productName, current);
  }
  const paymentsByTab = /* @__PURE__ */ new Map();
  const paymentMap = /* @__PURE__ */ new Map();
  for (const payment of salesPaymentRows) {
    const paymentsForTab = paymentsByTab.get(payment.tabId) ?? [];
    paymentsForTab.push(payment);
    paymentsByTab.set(payment.tabId, paymentsForTab);
  }
  for (const payment of periodPaymentRows) {
    const current = paymentMap.get(payment.method) ?? { method: payment.method, totalCents: 0, count: 0 };
    current.totalCents += payment.amountCents;
    current.count += 1;
    paymentMap.set(payment.method, current);
  }
  const sales = closedTabs.map((tab) => {
    const items = itemsByTab.get(tab.id) ?? [];
    const paymentsForTab = paymentsByTab.get(tab.id) ?? [];
    const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const salesCents = Math.max(0, subtotalCents + tab.tipCents - tab.discountCents + tab.manualAdjustmentCents);
    const receivedCents2 = paymentsForTab.reduce((sum, payment) => sum + payment.amountCents, 0);
    return {
      id: tab.id,
      tabCode: tab.tabCode,
      tableNumber: tab.tableNumber,
      customerName: tab.customerName,
      closedAt: tab.closedAt,
      subtotalCents,
      tipCents: tab.tipCents,
      discountCents: tab.discountCents,
      manualAdjustmentCents: tab.manualAdjustmentCents,
      adjustmentReason: tab.adjustmentReason,
      salesCents,
      receivedCents: receivedCents2,
      balanceCents: Math.max(0, salesCents - receivedCents2),
      items: items.map(({ id, productName, quantity, unitPriceCents, unitCostCents }) => ({ id, productName, quantity, unitPriceCents, totalCents: quantity * unitPriceCents, costCents: quantity * unitCostCents })),
      payments: paymentsForTab.map(({ amountCents, method, createdAt }) => ({ amountCents, method, createdAt }))
    };
  });
  const receivedCents = periodPaymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  const expenseCategoryTotals = /* @__PURE__ */ new Map();
  for (const expense of expenseRows) expenseCategoryTotals.set(expense.category, (expenseCategoryTotals.get(expense.category) ?? 0) + expense.amountCents);
  const expenseCategories = Array.from(expenseCategoryTotals, ([category, totalCents]) => ({ category, totalCents })).sort((a, b) => b.totalCents - a.totalCents);
  const financialTotals = calculateReportFinancialTotals(sales, productRows, expensesCents);
  const common = {
    salesCount: sales.length,
    productUnits: productRows.reduce((sum, item) => sum + item.quantity, 0),
    products: Array.from(productsMap.values()).sort((a, b) => b.quantity - a.quantity)
  };
  if (!includeFinanceDetails) {
    return {
      ...common,
      salesCents: financialTotals.salesCents,
      tipCents: financialTotals.tipCents,
      productSalesCents: financialTotals.productSalesCents,
      sales: sales.map(({ receivedCents: _received, balanceCents: _balance, payments: _payments, ...sale }) => sale)
    };
  }
  return {
    ...financialTotals,
    ...common,
    receivedCents,
    outstandingCents: sales.reduce((sum, tab) => sum + tab.balanceCents, 0),
    expensesCents,
    expenseCategories,
    paymentMethods: Array.from(paymentMap.values()).sort((a, b) => b.totalCents - a.totalCents),
    sales,
    receipts: periodPaymentRows.map(({ tabId, amountCents, method, createdAt, tabCode, tabStatus, tableNumber }) => ({ tabId, amountCents, method, createdAt, tabCode, tabStatus, tableNumber }))
  };
}
async function listUserAccess() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({ id: users.id, name: users.name, email: users.email, systemRole: users.role, localRole: userProfiles.localRole, active: userProfiles.active, username: localCredentials.username }).from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id)).innerJoin(localCredentials, eq(localCredentials.userId, users.id)).orderBy(asc(users.name));
}
async function updateUserAccess(input, actorId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(userProfiles).values({ userId: input.userId, localRole: input.localRole, active: input.active }).onConflictDoUpdate({ target: userProfiles.userId, set: { localRole: input.localRole, active: input.active } });
  await writeAudit(actorId, "UPDATE_ACCESS", "user", input.userId, `Atualizou permiss\xE3o para ${auditRoleLabel(input.localRole)} (${input.active ? "ativo" : "inativo"})`);
  return { success: true };
}
async function deleteLocalUser(userId, actorId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const credential = await db.select({ username: localCredentials.username, name: users.name }).from(localCredentials).innerJoin(users, eq(users.id, localCredentials.userId)).where(eq(localCredentials.userId, userId)).limit(1);
  if (!credential[0]) throw new Error("Usu\xE1rio n\xE3o encontrado");
  if (credential[0].username === "admin") throw new Error("O perfil admin n\xE3o pode ser exclu\xEDdo");
  await db.transaction(async (tx) => {
    await tx.delete(localCredentials).where(eq(localCredentials.userId, userId));
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
  });
  await writeAudit(actorId, "DELETE_USER", "user", userId, `Excluiu o acesso de ${credential[0].name || credential[0].username}; hist\xF3rico operacional preservado`);
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
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.select({ id: productPriceRules.id, productId: productPriceRules.productId, productName: products.name, name: productPriceRules.name, startTime: productPriceRules.startTime, endTime: productPriceRules.endTime, daysOfWeek: productPriceRules.daysOfWeek, weekdaysMask: productPriceRules.weekdaysMask, priceCents: productPriceRules.priceCents, active: productPriceRules.active }).from(productPriceRules).innerJoin(products, eq(productPriceRules.productId, products.id)).orderBy(asc(products.name), asc(productPriceRules.startTime));
}
async function createProductPriceRule(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  if (parseTime(input.startTime) === null || parseTime(input.endTime) === null || parseTime(input.startTime) === parseTime(input.endTime)) {
    throw new Error("Informe hor\xE1rios v\xE1lidos e diferentes para in\xEDcio e fim");
  }
  const product = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto n\xE3o encontrado");
  const daysOfWeek = Array.from(new Set(input.daysOfWeek)).sort((a, b) => a - b);
  if (!daysOfWeek.length || daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || input.weekdaysMask !== weekdaysToMask(daysOfWeek)) throw new Error("Os dias selecionados da promo\xE7\xE3o s\xE3o inv\xE1lidos");
  const inserted = await db.insert(productPriceRules).values({ ...input, daysOfWeek, weekdaysMask: input.weekdaysMask, active: true, createdBy: userId }).returning({ id: productPriceRules.id });
  const id = Number(inserted[0].id);
  const dayNames = ["domingo", "segunda", "ter\xE7a", "quarta", "quinta", "sexta", "s\xE1bado"];
  await writeAudit(userId, "CREATE_PRICE_RULE", "product_price_rule", id, `Criou pre\xE7o programado para ${product[0].name}: ${input.startTime}-${input.endTime} (${daysOfWeek.map((day) => dayNames[day]).join(", ")})`);
  return { id };
}
async function updateProductPriceRule(input, userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  if (parseTime(input.startTime) === null || parseTime(input.endTime) === null || parseTime(input.startTime) === parseTime(input.endTime)) {
    throw new Error("Informe hor\xE1rios v\xE1lidos e diferentes para in\xEDcio e fim");
  }
  const daysOfWeek = Array.from(new Set(input.daysOfWeek)).sort((a, b) => a - b);
  if (!daysOfWeek.length || daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || input.weekdaysMask !== weekdaysToMask(daysOfWeek)) throw new Error("Os dias selecionados da promo\xE7\xE3o s\xE3o inv\xE1lidos");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto n\xE3o encontrado");
  const rule = await db.select({ id: productPriceRules.id }).from(productPriceRules).where(eq(productPriceRules.id, input.ruleId)).limit(1);
  if (!rule[0]) throw new Error("Regra de pre\xE7o n\xE3o encontrada");
  const result = await db.update(productPriceRules).set({
    productId: input.productId,
    name: input.name.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    daysOfWeek,
    weekdaysMask: input.weekdaysMask,
    priceCents: input.priceCents
  }).where(eq(productPriceRules.id, input.ruleId));
  const affected = result.rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de pre\xE7o n\xE3o encontrada");
  const dayNames = ["domingo", "segunda", "ter\xE7a", "quarta", "quinta", "sexta", "s\xE1bado"];
  await writeAudit(userId, "UPDATE_PRICE_RULE", "product_price_rule", input.ruleId, `Editou o pre\xE7o programado de ${product[0].name}: ${input.startTime}-${input.endTime} (${daysOfWeek.map((day) => dayNames[day]).join(", ")}) por R$ ${(input.priceCents / 100).toFixed(2).replace(".", ",")}`);
  return { success: true };
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
async function getRolePermissions() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await ensureInitialData();
  const rows = await db.select({ rolePermissions: settings.rolePermissions }).from(settings).limit(1);
  const saved = rows[0]?.rolePermissions;
  const validFeatures = new Set(ACCESS_FEATURES.map(({ id }) => id));
  const normalize = (value, fallback) => {
    if (!Array.isArray(value)) return fallback;
    return Array.from(new Set(value.filter((item) => typeof item === "string" && validFeatures.has(item))));
  };
  return {
    manager: normalize(saved?.manager, DEFAULT_ROLE_PERMISSIONS.manager),
    attendant: normalize(saved?.attendant, DEFAULT_ROLE_PERMISSIONS.attendant)
  };
}
async function updateRolePermissions(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await ensureInitialData();
  const validFeatures = new Set(ACCESS_FEATURES.map(({ id }) => id));
  const normalized = {
    manager: Array.from(new Set(input.manager.filter((feature) => validFeatures.has(feature)))),
    attendant: Array.from(new Set(input.attendant.filter((feature) => validFeatures.has(feature))))
  };
  await db.insert(settings).values({ id: 1, rolePermissions: normalized, rolePermissionsVersion: 3 }).onConflictDoUpdate({
    target: settings.id,
    set: { rolePermissions: normalized, rolePermissionsVersion: 3, updatedAt: /* @__PURE__ */ new Date() }
  });
  await writeAudit(userId, "UPDATE_ROLE_PERMISSIONS", "settings", 1, "Atualizou as permiss\xF5es dos perfis Gerente e Atendente");
  return normalized;
}
async function getCommercialSettings() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await ensureInitialData();
  const rows = await db.select().from(settings).limit(1);
  return rows[0] ?? {
    id: 1,
    preventNegativeStock: true,
    maxTables: 20,
    allowManualDiscount: true,
    defaultDiscountPercent: 10,
    happyHourEnabled: false,
    happyHourStart: "17:00",
    happyHourEnd: "19:00",
    happyHourDiscountPercent: 10,
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function updateTableLimit(maxTables, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const normalized = Math.min(100, Math.max(1, Math.round(maxTables)));
  await ensureInitialData();
  return db.transaction(async (tx) => {
    const openOutsideLimit = await tx.select({ id: tabs.id, number: loungeTables.number }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(and(eq(tabs.status, "open"), sql2`${loungeTables.number} > ${normalized}`)).limit(1);
    if (openOutsideLimit[0]) throw new Error(`Feche ou transfira a comanda da mesa ${openOutsideLimit[0].number} antes de reduzir o limite`);
    const existingTables = await tx.select({ number: loungeTables.number }).from(loungeTables).orderBy(asc(loungeTables.number));
    const existingNumbers = new Set(existingTables.map((table) => table.number));
    const missingTables = Array.from({ length: normalized }, (_, index2) => index2 + 1).filter((number) => !existingNumbers.has(number)).map((number) => ({ number }));
    if (missingTables.length) await tx.insert(loungeTables).values(missingTables).onConflictDoNothing({ target: loungeTables.number });
    await tx.insert(settings).values({ id: 1, maxTables: normalized }).onConflictDoUpdate({ target: settings.id, set: { maxTables: normalized, updatedAt: /* @__PURE__ */ new Date() } });
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TABLE_LIMIT", entityType: "settings", entityId: 1, description: `Definiu o limite de mesas em ${normalized}` });
    return { maxTables: normalized };
  });
}
async function updateNegativeStockPolicy(preventNegativeStock, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  await db.insert(settings).values({ id: 1, preventNegativeStock }).onConflictDoUpdate({
    target: settings.id,
    set: { preventNegativeStock, updatedAt: /* @__PURE__ */ new Date() }
  });
  await writeAudit(userId, "UPDATE_SETTINGS", "settings", 1, `${preventNegativeStock ? "Ativou" : "Desativou"} a prote\xE7\xE3o contra estoque negativo`);
  return getCommercialSettings();
}
async function updateCommercialSettings(input, userId) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  if (parseTime(input.happyHourStart) === null || parseTime(input.happyHourEnd) === null || parseTime(input.happyHourStart) === parseTime(input.happyHourEnd)) {
    throw new Error("Informe hor\xE1rios v\xE1lidos e diferentes para o Happy Hour");
  }
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
async function createPrinterPairingCode2(userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const pairingCode = createPrinterPairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1e3);
  await db.insert(printerAgents).values({
    id: 1,
    computerName: "",
    printerName: "",
    pairingCodeHash: hashPrinterSecret(pairingCode),
    pairingCodeExpiresAt: expiresAt,
    tokenHash: null,
    enabled: true,
    lastSeenAt: null,
    pairedAt: null,
    updatedAt: /* @__PURE__ */ new Date()
  }).onConflictDoUpdate({
    target: printerAgents.id,
    set: {
      computerName: "",
      printerName: "",
      pairingCodeHash: hashPrinterSecret(pairingCode),
      pairingCodeExpiresAt: expiresAt,
      tokenHash: null,
      enabled: true,
      lastSeenAt: null,
      pairedAt: null,
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
  await db.insert(auditLogs).values({
    userId,
    action: "CREATE_PRINTER_PAIRING_CODE",
    entityType: "printer_agent",
    entityId: 1,
    description: "Gerou um c\xF3digo tempor\xE1rio de pareamento da impressora Windows"
  });
  return { pairingCode, expiresAt };
}
async function pairPrinterAgent(input) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const agentToken = createPrinterAgentToken();
  const now = /* @__PURE__ */ new Date();
  const updated = await db.update(printerAgents).set({
    computerName: input.computerName.trim().slice(0, 120),
    printerName: input.printerName.trim().slice(0, 160),
    pairingCodeHash: null,
    pairingCodeExpiresAt: null,
    tokenHash: hashPrinterSecret(agentToken),
    enabled: true,
    lastSeenAt: now,
    pairedAt: now,
    updatedAt: now
  }).where(and(
    eq(printerAgents.id, 1),
    eq(printerAgents.enabled, true),
    eq(printerAgents.pairingCodeHash, hashPrinterSecret(input.pairingCode)),
    gt(printerAgents.pairingCodeExpiresAt, now)
  )).returning({ id: printerAgents.id });
  if (!updated[0]) throw new Error("C\xF3digo inv\xE1lido, expirado ou j\xE1 utilizado. Gere um novo c\xF3digo no sistema.");
  return { agentToken };
}
async function getPrinterBridgeStatus() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const [agent] = await db.select({
    id: printerAgents.id,
    computerName: printerAgents.computerName,
    printerName: printerAgents.printerName,
    enabled: printerAgents.enabled,
    lastSeenAt: printerAgents.lastSeenAt,
    pairedAt: printerAgents.pairedAt
  }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1);
  const jobs = await db.select({
    id: printJobs.id,
    kind: printJobs.kind,
    status: printJobs.status,
    attempts: printJobs.attempts,
    lastError: printJobs.lastError,
    createdAt: printJobs.createdAt,
    completedAt: printJobs.completedAt
  }).from(printJobs).orderBy(desc(printJobs.createdAt), desc(printJobs.id)).limit(25);
  const online = !!agent?.enabled && !!agent.lastSeenAt && Date.now() - agent.lastSeenAt.getTime() < 45e3;
  return {
    agent: agent ? { ...agent, online, paired: !!agent.enabled && !!agent.pairedAt } : null,
    jobs
  };
}
async function revokePrinterAgent(userId) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const result = await db.update(printerAgents).set({ enabled: false, tokenHash: null, pairingCodeHash: null, pairingCodeExpiresAt: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(printerAgents.id, 1)).returning({ id: printerAgents.id });
  await db.insert(auditLogs).values({
    userId,
    action: "REVOKE_PRINTER_AGENT",
    entityType: "printer_agent",
    entityId: 1,
    description: "Revogou o acesso do agente de impress\xE3o Windows"
  });
  return { revoked: result.length > 0 };
}
async function authenticatePrinterAgent(token) {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  if (!db) return null;
  const [agent] = await db.select({ id: printerAgents.id, enabled: printerAgents.enabled, tokenHash: printerAgents.tokenHash }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1);
  if (!agent?.enabled || !printerSecretMatches(token, agent.tokenHash)) return null;
  return agent.id;
}
async function claimNextPrintJob(token) {
  await ensureInitialData();
  const agentId = await authenticatePrinterAgent(token);
  if (!agentId) throw new Error("Agente n\xE3o autorizado");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  return db.transaction(async (tx) => {
    const now = /* @__PURE__ */ new Date();
    await tx.update(printerAgents).set({ lastSeenAt: now, updatedAt: now }).where(eq(printerAgents.id, agentId));
    await tx.update(printJobs).set({ status: "uncertain", lastError: "O agente perdeu a conex\xE3o durante a impress\xE3o; verifique a impressora antes de reenviar.", completedAt: now }).where(and(eq(printJobs.agentId, agentId), eq(printJobs.status, "processing"), lte(printJobs.claimedAt, new Date(now.getTime() - 5 * 6e4))));
    const [job] = await tx.select().from(printJobs).where(and(eq(printJobs.agentId, agentId), eq(printJobs.status, "queued"))).orderBy(asc(printJobs.createdAt), asc(printJobs.id)).for("update", { skipLocked: true }).limit(1);
    if (!job) return null;
    await tx.update(printJobs).set({ status: "processing", attempts: sql2`${printJobs.attempts} + 1`, claimedAt: now, lastError: null }).where(eq(printJobs.id, job.id));
    return { id: job.id, kind: job.kind, payload: job.payload };
  });
}
async function completePrintJob(input) {
  await ensureInitialData();
  const agentId = await authenticatePrinterAgent(input.token);
  if (!agentId) throw new Error("Agente n\xE3o autorizado");
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const now = /* @__PURE__ */ new Date();
  const changed = await db.update(printJobs).set({
    status: input.status,
    lastError: input.status === "failed" ? input.error?.replace(/[\r\n\0]/g, " ").slice(0, 500) || "Falha desconhecida no agente de impress\xE3o" : null,
    completedAt: now
  }).where(and(eq(printJobs.id, input.jobId), eq(printJobs.agentId, agentId), eq(printJobs.status, "processing"))).returning({ id: printJobs.id });
  await db.update(printerAgents).set({ lastSeenAt: now, updatedAt: now }).where(eq(printerAgents.id, agentId));
  if (!changed[0]) return { accepted: false };
  return { accepted: true };
}
async function queueTabPrintJob(input) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const tab = await getTabDetails(input.tabId);
  const payload = input.kind === "barista" ? buildBaristaPrintPayload(tab, input.itemId ?? -1) : buildTabPrintPayload(tab);
  const [job] = await db.transaction(async (tx) => {
    const [agent] = await tx.select({ id: printerAgents.id, enabled: printerAgents.enabled, tokenHash: printerAgents.tokenHash }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1).for("update");
    if (!agent?.enabled || !agent.tokenHash) throw new Error("A impressora ainda n\xE3o est\xE1 pareada. Configure o agente Windows primeiro.");
    const inserted = await tx.insert(printJobs).values({
      agentId: agent.id,
      kind: input.kind,
      status: "queued",
      payload,
      requestedBy: input.userId
    }).returning({ id: printJobs.id });
    return inserted;
  });
  const [agentStatus] = await db.select({ lastSeenAt: printerAgents.lastSeenAt }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1);
  return { jobId: job.id, status: "queued", agentOnline: !!agentStatus?.lastSeenAt && Date.now() - agentStatus.lastSeenAt.getTime() < 45e3 };
}
async function queueCashSessionPrintJob(input) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indispon\xEDvel");
  const session = await getCashSessionDetails(input.sessionId);
  const payload = buildCashSessionPrintPayload(session);
  const [job] = await db.transaction(async (tx) => {
    const [agent] = await tx.select({ id: printerAgents.id, enabled: printerAgents.enabled, tokenHash: printerAgents.tokenHash }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1).for("update");
    if (!agent?.enabled || !agent.tokenHash) throw new Error("A impressora ainda n\xE3o est\xE1 pareada. Configure o agente Windows primeiro.");
    return tx.insert(printJobs).values({ agentId: agent.id, kind: "cash", status: "queued", payload, requestedBy: input.userId }).returning({ id: printJobs.id });
  });
  const [agentStatus] = await db.select({ lastSeenAt: printerAgents.lastSeenAt }).from(printerAgents).where(eq(printerAgents.id, 1)).limit(1);
  return { jobId: job.id, status: "queued", agentOnline: !!agentStatus?.lastSeenAt && Date.now() - agentStatus.lastSeenAt.getTime() < 45e3 };
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
async function requireFeature(ctx, feature) {
  const profile = await operator(ctx);
  if (profile.localRole === "administrator") return profile;
  const permissions = await getRolePermissions();
  if (!canAccessFeature(profile.localRole, permissions, feature)) {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Seu perfil n\xE3o tem acesso a esta funcionalidade" });
  }
  return profile;
}
async function requireAnyFeature(ctx, features) {
  const profile = await operator(ctx);
  if (profile.localRole === "administrator") return profile;
  const permissions = await getRolePermissions();
  if (!features.some((feature) => canAccessFeature(profile.localRole, permissions, feature))) {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Seu perfil n\xE3o tem acesso a esta funcionalidade" });
  }
  return profile;
}
async function requireOpenCash() {
  const status = await getCashSessionStatus();
  if (!status.open) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "Abra o caixa antes de realizar opera\xE7\xF5es financeiras" });
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
      const cookieOptions = getLocalSessionCookieOptions(ctx.req);
      ctx.res.cookie("shadow_session", session.token, {
        ...cookieOptions,
        maxAge: 1e3 * 60 * 60 * 12
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    login: publicProcedure.input(z2.object({ username: z2.string().trim().toLowerCase().min(3).max(64), password: z2.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const session = await loginLocally(input.username, input.password);
      if (!session) throw new TRPCError3({ code: "UNAUTHORIZED", message: "Usu\xE1rio ou senha inv\xE1lidos" });
      const cookieOptions = getLocalSessionCookieOptions(ctx.req);
      ctx.res.cookie("shadow_session", session.token, {
        ...cookieOptions,
        maxAge: 1e3 * 60 * 60 * 12
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getLocalSessionCookieOptions(ctx.req);
      ctx.res.cookie("shadow_session", "", {
        ...cookieOptions,
        expires: /* @__PURE__ */ new Date(0),
        maxAge: 0
      });
      return { success: true };
    })
  }),
  workspace: router({
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      await ensureInitialData();
      const profile = await operator(ctx);
      return { localRole: profile.localRole, name: ctx.user.name ?? "Operador", rolePermissions: await getRolePermissions() };
    })
  }),
  lounge: router({
    dashboard: protectedProcedure.input(z2.object({ rangeDays: z2.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "dashboard");
      return getDashboard(input.rangeDays);
    }),
    tables: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "tables");
      return listTables();
    }),
    cashStatus: protectedProcedure.query(async ({ ctx }) => {
      await requireAnyFeature(ctx, ["tables", "finance", "cash"]);
      return getCashSessionStatus();
    }),
    tab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return getTabDetails(input.tabId);
    }),
    setCustomerName: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), customerName: z2.string().trim().max(120).nullable() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return setTabCustomerName(input.tabId, input.customerName, ctx.user.id);
    }),
    assignCustomer: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), customerId: z2.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "customers");
      return assignTabCustomer(input.tabId, input.customerId, ctx.user.id);
    }),
    openTab: protectedProcedure.input(z2.object({ tableId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return openTab(input.tableId, ctx.user.id, ctx.user.name ?? "Operador");
    }),
    syncOfflineTab: protectedProcedure.input(z2.object({
      offlineKey: z2.string().min(8).max(80),
      deviceId: z2.string().min(3).max(120),
      tableId: z2.number().int().positive(),
      customerName: z2.string().trim().max(120).nullable().optional(),
      tipPercent: z2.union([z2.literal(0), z2.literal(10)]),
      items: z2.array(z2.object({ productId: z2.number().int().positive(), productName: z2.string().max(160), quantity: z2.number().int().min(1).max(99), note: z2.string().max(500).nullable().optional(), createdAt: z2.string().datetime().optional() })).max(100),
      payments: z2.array(z2.object({ amountCents: z2.number().int().positive(), method: paymentMethod, requestKey: z2.string().min(8).max(80) })).max(20)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      if (input.payments.length > 0) await requireFeature(ctx, "cash");
      try {
        return await syncOfflineTab(input, ctx.user.id);
      } catch (error) {
        if (error instanceof Error && error.message === "Abra o caixa antes de realizar opera\xE7\xF5es financeiras") {
          throw new TRPCError3({ code: "PRECONDITION_FAILED", message: error.message });
        }
        throw error;
      }
    }),
    transferTab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), destinationTableId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return transferTab(input.tabId, input.destinationTableId, ctx.user.id);
    }),
    addItem: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      productId: z2.number().int().positive(),
      quantity: z2.number().int().min(1).max(99),
      note: z2.string().max(500).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      await requireOpenCash();
      return addTabItem(input, ctx.user.id, ctx.user.name ?? "Operador");
    }),
    setItemQuantity: protectedProcedure.input(z2.object({
      itemId: z2.number().int().positive(),
      quantity: z2.number().int().min(0).max(99),
      note: z2.string().max(500).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      await requireOpenCash();
      return setTabItemQuantity(input, ctx.user.id);
    }),
    pay: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      amountCents: z2.number().int().positive(),
      method: paymentMethod,
      requestKey: z2.string().min(8).max(80)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      await requireFeature(ctx, "cash");
      try {
        return await registerPayment(input, ctx.user.id);
      } catch (error) {
        if (error instanceof Error && error.message === "Abra o caixa antes de realizar opera\xE7\xF5es financeiras") {
          throw new TRPCError3({ code: "PRECONDITION_FAILED", message: error.message });
        }
        throw error;
      }
    }),
    closeTab: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return closeTab(input.tabId, ctx.user.id);
    }),
    setCharges: protectedProcedure.input(z2.object({ tabId: z2.number().int().positive(), tipPercent: z2.union([z2.literal(0), z2.literal(10)]) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      await requireOpenCash();
      return setTabCharges(input, ctx.user.id);
    }),
    adjustTabValue: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      newTotalCents: z2.number().int().min(0).max(1e8),
      reason: z2.string().trim().min(5).max(500)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "adjustTabValue");
      await requireOpenCash();
      return adjustTabValue(input, ctx.user.id);
    })
  }),
  inventory: router({
    categories: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "products");
      return listCategories();
    }),
    createCategory: protectedProcedure.input(z2.object({ name: z2.string().min(2).max(100) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return createProductCategory(input.name, ctx.user.id);
    }),
    products: protectedProcedure.input(z2.object({ query: z2.string().max(160).optional() }).optional()).query(async ({ ctx, input }) => {
      const profile = await operator(ctx);
      if (profile.localRole !== "administrator") {
        const permissions = await getRolePermissions();
        if (!canAccessFeature(profile.localRole, permissions, "products") && !canAccessFeature(profile.localRole, permissions, "tables") && !canAccessFeature(profile.localRole, permissions, "stock")) throw new TRPCError3({ code: "FORBIDDEN", message: "Seu perfil n\xE3o tem acesso aos produtos" });
      }
      return listProducts(input?.query);
    }),
    movements: protectedProcedure.input(z2.object({
      from: z2.date().optional(),
      to: z2.date().optional(),
      productId: z2.number().int().positive().optional(),
      page: z2.number().int().min(1).default(1)
    }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual \xE0 data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "stock");
      return listStockMovements({ ...input, page: input?.page ?? 1 });
    }),
    saveProduct: protectedProcedure.input(z2.object({
      id: z2.number().int().positive().optional(),
      name: z2.string().min(2).max(160),
      code: z2.string().min(2).max(64),
      categoryId: z2.number().int().positive().optional(),
      unit: z2.string().min(1).max(24),
      costCents: z2.number().int().min(0),
      priceCents: z2.number().int().min(0),
      stockQuantity: z2.number().int().optional(),
      minimumStock: z2.number().int().min(0),
      active: z2.boolean(),
      notes: z2.string().max(2e3).optional()
    }).superRefine((input, refinement) => {
      if (!input.id && input.stockQuantity !== void 0 && input.stockQuantity < 0) {
        refinement.addIssue({ code: "custom", path: ["stockQuantity"], message: "O estoque inicial n\xE3o pode ser negativo" });
      }
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return saveProduct(input, ctx.user.id);
    }),
    deleteProduct: protectedProcedure.input(z2.object({ productId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return deleteProduct(input.productId, ctx.user.id);
    }),
    setProductActive: protectedProcedure.input(z2.object({ productId: z2.number().int().positive(), active: z2.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return setProductActive(input.productId, input.active, ctx.user.id);
    }),
    adjust: protectedProcedure.input(z2.object({
      productId: z2.number().int().positive(),
      quantity: z2.number().int().min(1).max(1e5),
      direction: z2.enum(["in", "out"]),
      reason: z2.string().min(2).max(120)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "stock");
      return adjustStock(input, ctx.user.id);
    })
  }),
  finance: router({
    summary: protectedProcedure.input(z2.object({ from: z2.date().optional(), to: z2.date().optional() }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual \xE0 data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "finance");
      const summary = await getReportSummary(input?.from, input?.to, true);
      if (!("receivedCents" in summary)) throw new Error("Resumo financeiro indispon\xEDvel");
      return {
        receivedCents: summary.receivedCents,
        outstandingCents: summary.outstandingCents,
        costCents: summary.costCents,
        expensesCents: summary.expensesCents,
        resultCents: summary.resultCents,
        paymentMethods: summary.paymentMethods,
        expenseCategories: summary.expenseCategories,
        receipts: summary.receipts
      };
    }),
    expenses: protectedProcedure.input(z2.object({
      from: z2.date().optional(),
      to: z2.date().optional(),
      page: z2.number().int().min(1).default(1)
    }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual \xE0 data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "finance");
      return listExpenses({ from: input?.from, to: input?.to, page: input?.page ?? 1 });
    }),
    createExpense: protectedProcedure.input(z2.object({
      description: z2.string().min(2).max(240),
      category: z2.string().min(2).max(100),
      amountCents: z2.number().int().positive(),
      method: paymentMethod,
      notes: z2.string().max(2e3).optional(),
      occurredAt: z2.date()
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "finance");
      if (input.method === "cash") await requireFeature(ctx, "cash");
      await requireOpenCash();
      return createExpense(input, ctx.user.id);
    })
  }),
  cash: router({
    current: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "cash");
      return getCurrentCashSession();
    }),
    history: protectedProcedure.input(z2.object({ page: z2.number().int().min(1).default(1) })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      return listCashSessions({ page: input.page });
    }),
    details: protectedProcedure.input(z2.object({ sessionId: z2.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      return getCashSessionDetails(input.sessionId);
    }),
    open: protectedProcedure.input(z2.object({ openingFloatCents: z2.number().int().min(0).max(1e8) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      return openCashSession(input.openingFloatCents, ctx.user.id);
    }),
    addMovement: protectedProcedure.input(z2.object({
      kind: z2.enum(["supply", "withdrawal", "refund"]),
      amountCents: z2.number().int().positive().max(1e8),
      description: z2.string().trim().min(2).max(240)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      await requireOpenCash();
      return addCashMovement(input, ctx.user.id);
    }),
    addExpense: protectedProcedure.input(z2.object({
      description: z2.string().trim().min(2).max(240),
      category: z2.string().trim().min(2).max(100),
      amountCents: z2.number().int().positive().max(1e8),
      notes: z2.string().max(2e3).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      await requireOpenCash();
      return createExpense({ ...input, method: "cash", occurredAt: /* @__PURE__ */ new Date() }, ctx.user.id);
    }),
    close: protectedProcedure.input(z2.object({
      sessionId: z2.number().int().positive(),
      countedCashCents: z2.number().int().min(0).max(1e8),
      note: z2.string().trim().max(500).optional()
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      return closeCashSession(input, ctx.user.id);
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
    }),
    updateRolePermissions: protectedProcedure.input(z2.object({
      manager: z2.array(z2.enum(ACCESS_FEATURES.map(({ id }) => id))).max(ACCESS_FEATURES.length),
      attendant: z2.array(z2.enum(ACCESS_FEATURES.map(({ id }) => id))).max(ACCESS_FEATURES.length)
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return updateRolePermissions(input, ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({ name: z2.string().trim().min(2).max(120), username: z2.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/), password: z2.string().min(12).max(128), localRole })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return createLocalUser(input, ctx.user.id);
    }),
    delete: protectedProcedure.input(z2.object({ userId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return deleteLocalUser(input.userId, ctx.user.id);
    })
  }),
  productHistory: router({
    list: protectedProcedure.input(z2.object({ productId: z2.number().int().positive().optional(), from: z2.date().optional(), to: z2.date().optional() }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return listProductHistory(input?.productId, input?.from, input?.to);
    })
  }),
  reports: router({
    summary: protectedProcedure.input(z2.object({ from: z2.date().optional(), to: z2.date().optional() }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual \xE0 data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "reports");
      return getReportSummary(input?.from, input?.to, false);
    })
  }),
  pricing: router({
    rules: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "settings");
      return listProductPriceRules();
    }),
    createRule: protectedProcedure.input(z2.object({ productId: z2.number().int().positive(), name: z2.string().min(2).max(140), startTime: z2.string().regex(/^\d{2}:\d{2}$/), endTime: z2.string().regex(/^\d{2}:\d{2}$/), daysOfWeek: z2.array(z2.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, { message: "Remova dias repetidos" }), weekdaysMask: z2.number().int().min(1).max(127), priceCents: z2.number().int().positive() }).refine((input) => weekdaysToMask(input.daysOfWeek) === input.weekdaysMask, { message: "Os dias selecionados n\xE3o correspondem \xE0 regra" })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return createProductPriceRule(input, ctx.user.id);
    }),
    updateRule: protectedProcedure.input(z2.object({ ruleId: z2.number().int().positive(), productId: z2.number().int().positive(), name: z2.string().trim().min(2).max(140), startTime: z2.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), endTime: z2.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), daysOfWeek: z2.array(z2.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, { message: "Remova dias repetidos" }), weekdaysMask: z2.number().int().min(1).max(127), priceCents: z2.number().int().positive() }).refine((input) => weekdaysToMask(input.daysOfWeek) === input.weekdaysMask, { message: "Os dias selecionados n\xE3o correspondem \xE0 regra" })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateProductPriceRule(input, ctx.user.id);
    }),
    setActive: protectedProcedure.input(z2.object({ ruleId: z2.number().int().positive(), active: z2.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return setProductPriceRuleActive(input.ruleId, input.active, ctx.user.id);
    }),
    deleteRule: protectedProcedure.input(z2.object({ ruleId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return deleteProductPriceRule(input.ruleId, ctx.user.id);
    })
  }),
  commercial: router({
    updateNegativeStockPolicy: protectedProcedure.input(z2.object({ preventNegativeStock: z2.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateNegativeStockPolicy(input.preventNegativeStock, ctx.user.id);
    }),
    updateTableLimit: protectedProcedure.input(z2.object({ maxTables: z2.number().int().min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateTableLimit(input.maxTables, ctx.user.id);
    }),
    settings: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "settings");
      return getCommercialSettings();
    }),
    updateSettings: protectedProcedure.input(z2.object({
      happyHourEnabled: z2.boolean(),
      happyHourStart: z2.string().regex(/^\d{2}:\d{2}$/),
      happyHourEnd: z2.string().regex(/^\d{2}:\d{2}$/),
      happyHourDiscountPercent: z2.number().int().min(0).max(100)
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateCommercialSettings(input, ctx.user.id);
    })
  }),
  printer: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return getPrinterBridgeStatus();
    }),
    createPairingCode: protectedProcedure.mutation(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return createPrinterPairingCode2(ctx.user.id);
    }),
    revoke: protectedProcedure.mutation(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return revokePrinterAgent(ctx.user.id);
    }),
    printCashSession: protectedProcedure.input(z2.object({ sessionId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "cash");
      const result = await queueCashSessionPrintJob({ ...input, userId: ctx.user.id });
      await writeAudit(ctx.user.id, "QUEUE_PRINT_JOB", "print_job", result.jobId, `Enfileirou resumo da sess\xE3o de caixa ${input.sessionId}`);
      return result;
    }),
    printTab: protectedProcedure.input(z2.object({
      tabId: z2.number().int().positive(),
      kind: z2.enum(["tab", "barista"]).default("tab"),
      itemId: z2.number().int().positive().optional()
    }).refine((input) => input.kind !== "barista" || input.itemId !== void 0, {
      message: "Selecione o item para imprimir no barista",
      path: ["itemId"]
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      const result = await queueTabPrintJob({ ...input, userId: ctx.user.id });
      await writeAudit(ctx.user.id, "QUEUE_PRINT_JOB", "print_job", result.jobId, `Enfileirou impress\xE3o ${input.kind} da comanda ${input.tabId}`);
      return result;
    })
  }),
  customers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "customers");
      return listCustomers();
    }),
    save: protectedProcedure.input(z2.object({ id: z2.number().int().positive().optional(), name: z2.string().trim().min(2).max(160), cpf: z2.string().min(11).max(18).refine(isValidCpf, "CPF inv\xE1lido. Confira os 11 d\xEDgitos e tente novamente."), phone: z2.string().max(30).optional(), notes: z2.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "customers");
      return saveCustomer(input, ctx.user.id);
    }),
    delete: protectedProcedure.input(z2.object({ customerId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "customers");
      return deleteCustomer(input.customerId, ctx.user.id);
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
import { z as z3 } from "zod";
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
  app.post("/api/printer/pair", async (req, res) => {
    const input = z3.object({
      pairingCode: z3.string().min(20).max(60),
      computerName: z3.string().trim().min(1).max(120),
      printerName: z3.string().trim().min(1).max(160)
    }).safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Dados de pareamento inv\xE1lidos" });
    try {
      const result = await pairPrinterAgent(input.data);
      return res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao parear o agente";
      return res.status(message === "Agente n\xE3o autorizado" ? 401 : 400).json({ error: message });
    }
  });
  app.post("/api/printer/jobs/next", async (req, res) => {
    const token = req.get("authorization")?.match(/^Bearer (.{1,200})$/i)?.[1] ?? "";
    try {
      const job = await claimNextPrintJob(token);
      return res.json({ job });
    } catch {
      return res.status(401).json({ error: "Agente n\xE3o autorizado" });
    }
  });
  app.post("/api/printer/jobs/:jobId/result", async (req, res) => {
    const token = req.get("authorization")?.match(/^Bearer (.{1,200})$/i)?.[1] ?? "";
    const jobId = Number(req.params.jobId);
    const input = z3.object({ status: z3.enum(["printed", "failed"]), error: z3.string().max(2e3).optional() }).safeParse(req.body);
    if (!Number.isSafeInteger(jobId) || jobId < 1 || !input.success) return res.status(400).json({ error: "Resultado inv\xE1lido" });
    try {
      const result = await completePrintJob({ token, jobId, ...input.data });
      return res.json(result);
    } catch {
      return res.status(401).json({ error: "Agente n\xE3o autorizado" });
    }
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}

// api/index.source.ts
var index_source_default = createApp();
export {
  index_source_default as default
};
