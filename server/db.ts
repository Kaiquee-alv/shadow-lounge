import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  auditLogs,
  customers,
  expenses,
  localCredentials,
  localSessions,
  loungeTables,
  payments,
  productCategories,
  productPriceRules,
  products,
  settings,
  stockMovements,
  tabItems,
  tabs,
  userProfiles,
  type InsertUser,
  users,
} from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import { isValidCpf, normalizeCpf } from "@shared/cpf";
import { auditRoleLabel } from "@shared/audit-labels";
import { calculateReportFinancialTotals } from "./report-financial-utils.js";
import { priceRuleAppliesAt, saoPauloClock, timeInWindow, weekdaysFromMask, weekdaysToMask } from "./price-rule-utils.js";
import { planTabTotalAdjustment } from "./tab-adjustment-utils.js";
import { buildDailyRevenue } from "./daily-revenue-utils.js";
import { addDaysToSaoPauloDateKey, saoPauloDateKey, saoPauloDayStart } from "../shared/sao-paulo-time.js";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const connectionString = process.env.DATABASE_URL;
      const useSsl = /neon\.tech|sslmode=require/i.test(connectionString);
      _pool = new Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined, max: 5 });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const categoriesSeed = [
  "Cervejas", "Bebidas", "Destilados", "Refrigerantes", "Energéticos",
  "Narguilé", "Essências", "Carvões", "Petiscos", "Outros",
];

let initialDataPromise: Promise<void> | null = null;

export async function ensureInitialData() {
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
  if (!db) throw new Error("Banco de dados indisponível");

  // Mantém instalações existentes compatíveis com o campo adicionado depois do schema inicial.
  await db.execute(sql`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "customerName" varchar(120)`);
  await db.execute(sql`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "manualAdjustmentCents" integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "adjustmentReason" varchar(500)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "customers" ("id" serial PRIMARY KEY, "name" varchar(160) NOT NULL, "cpf" varchar(11) NOT NULL, "phone" varchar(30), "notes" varchar(500), "active" boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "customers_cpf_unique" ON "customers" ("cpf")`);
  await db.execute(sql`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "customerId" integer REFERENCES "customers"("id")`);
  await db.execute(sql`ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineKey" varchar(80)`);
  await db.execute(sql`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "maxTables" integer NOT NULL DEFAULT 20`);
  // Regras criadas antes dos dias da semana continuam valendo todos os dias.
  await db.execute(sql`ALTER TABLE "product_price_rules" ADD COLUMN IF NOT EXISTS "daysOfWeek" integer[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`);
  await db.execute(sql`ALTER TABLE "product_price_rules" ADD COLUMN IF NOT EXISTS "weekdaysMask" integer NOT NULL DEFAULT 127`);
  // Reconciliates existing arrays into the explicit bitmask, preserving selected days from earlier deployments.
  await db.execute(sql`UPDATE "product_price_rules" AS rule SET "weekdaysMask" = COALESCE((SELECT bit_or(1 << value) FROM unnest(COALESCE(rule."daysOfWeek", ARRAY[]::integer[])) AS selected_day(value)), 127)`);
  // Permite linhas separadas para o mesmo produto quando uma delas usa uma promoção.
  await db.execute(sql`DROP INDEX IF EXISTS "tab_items_tab_product_unique"`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "tab_items_tab_product_idx" ON "tab_items" ("tabId", "productId")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "tabs_status_idx" ON "tabs" ("status")`);
  await db.execute(sql`CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $audit_immutable$
    BEGIN
      RAISE EXCEPTION 'Registros de auditoria são imutáveis; alterações e exclusões não são permitidas'
        USING ERRCODE = '55000';
    END;
    $audit_immutable$`);
  await db.execute(sql`DO $audit_trigger$
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
  await db.insert(loungeTables).values(Array.from({ length: 20 }, (_, index) => ({ number: index + 1 }))).onConflictDoNothing({ target: loungeTables.number });
  await db.insert(productCategories).values(categoriesSeed.map((name) => ({ name }))).onConflictDoUpdate({ target: productCategories.name,
    set: { active: true },
  });
  await db.insert(settings).values({ id: 1, preventNegativeStock: true, maxTables: 20 }).onConflictDoNothing({ target: settings.id });


}

export async function getLocalRole(userId: number, systemRole: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (profile[0]) {
    if (systemRole === "admin" && (profile[0].localRole !== "administrator" || !profile[0].active)) {
      await db.update(userProfiles).set({ localRole: "administrator", active: true }).where(eq(userProfiles.id, profile[0].id));
      return { ...profile[0], localRole: "administrator" as const, active: true };
    }
    return profile[0];
  }
  const localRole = systemRole === "admin" ? "administrator" : "attendant";
  await db.insert(userProfiles).values({ userId, localRole });
  const created = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return created[0]!;
}

export async function writeAudit(userId: number, action: string, entityType: string, entityId: number | null, description: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ userId, action, entityType, entityId, description });
}

function asNumber(value: unknown) {
  return Number(value ?? 0);
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function validatePassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export async function getLocalUserFromSession(token: string) {
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
    expiresAt: localSessions.expiresAt,
  }).from(localSessions).innerJoin(users, eq(localSessions.userId, users.id)).where(eq(localSessions.token, token)).limit(1);
  if (!result[0] || result[0].expiresAt.getTime() < Date.now()) return null;
  const { expiresAt: _expiresAt, ...user } = result[0];
  return user;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

const FIXED_USERS = [
  {
    username: "admin",
    name: "Administrador",
    password: process.env.FIXED_ADMIN_PASSWORD ?? "shadow1020",
    localRole: "administrator" as const,
  },
  {
    username: "gerente",
    name: "Gerente",
    password: process.env.FIXED_MANAGER_PASSWORD ?? "shadow1020",
    localRole: "manager" as const,
  },
  {
    username: "atendente",
    name: "Atendente",
    password: process.env.FIXED_ATTENDANT_PASSWORD ?? "shadow1020",
    localRole: "attendant" as const,
  },
];

async function ensureFixedUsers() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  for (const fixedUser of FIXED_USERS) {
    const openId = `fixed-${fixedUser.username}`;
    const passwordHash = hashPassword(fixedUser.password);

    await db.insert(users).values({
      openId,
      name: fixedUser.name,
      loginMethod: "local-fixed",
      role: "user",
    }).onConflictDoUpdate({
      target: users.openId,
      set: { name: fixedUser.name, loginMethod: "local-fixed", updatedAt: new Date() },
    });

    const user = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    const userId = user[0]?.id;
    if (!userId) throw new Error(`Não foi possível criar o usuário fixo ${fixedUser.username}`);

    await db.insert(userProfiles).values({ userId, localRole: fixedUser.localRole, active: true })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { localRole: fixedUser.localRole, active: true, updatedAt: new Date() },
      });

    await db.insert(localCredentials).values({
      userId,
      username: fixedUser.username,
      passwordHash,
    }).onConflictDoUpdate({
      target: localCredentials.username,
      set: { userId, passwordHash, updatedAt: new Date() },
    });
  }
}

async function createLocalSession(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await db.insert(localSessions).values({ userId, token, expiresAt });
  return { token, expiresAt };
}

export async function registerLocally(input: { name: string; username: string; password: string }) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const username = normalizeUsername(input.username);
  const existing = await db.select({ id: localCredentials.id })
    .from(localCredentials)
    .where(eq(localCredentials.username, username))
    .limit(1);
  if (existing[0]) return null;

  const result = await db.transaction(async (tx) => {
    const insertedUser = await tx.insert(users).values({
      openId: `local-${randomBytes(24).toString("hex")}`,
      name: input.name.trim(),
      loginMethod: "local",
      role: "user",
    }).returning({ id: users.id });
    const userId = Number(insertedUser[0].id);
    await tx.insert(userProfiles).values({ userId, localRole: "attendant", active: true });
    await tx.insert(localCredentials).values({
      userId,
      username,
      passwordHash: hashPassword(input.password),
    });
    return userId;
  });
  return createLocalSession(result);
}

export async function loginLocally(username: string, password: string) {
  await ensureInitialData();
  await ensureFixedUsers();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const credential = await db.select({
    userId: localCredentials.userId,
    passwordHash: localCredentials.passwordHash,
  }).from(localCredentials).innerJoin(userProfiles, eq(userProfiles.userId, localCredentials.userId)).where(and(eq(localCredentials.username, normalizeUsername(username)), eq(userProfiles.active, true))).limit(1);
  if (!credential[0] || !validatePassword(password, credential[0].passwordHash)) return null;
  return createLocalSession(credential[0].userId);
}

export async function createLocalUser(input: { name: string; username: string; password: string; localRole: "administrator" | "manager" | "attendant" }, actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const username = normalizeUsername(input.username);
  const existing = await db.select({ id: localCredentials.id }).from(localCredentials).where(eq(localCredentials.username, username)).limit(1);
  if (existing[0]) throw new Error("Este login já está cadastrado");
  const result = await db.transaction(async (tx) => {
    const inserted = await tx.insert(users).values({ openId: `local-${randomBytes(24).toString("hex")}`, name: input.name.trim(), loginMethod: "local", role: "user" }).returning({ id: users.id });
    const userId = Number(inserted[0].id);
    await tx.insert(userProfiles).values({ userId, localRole: input.localRole, active: true });
    await tx.insert(localCredentials).values({ userId, username, passwordHash: hashPassword(input.password) });
    return userId;
  });
  await writeAudit(actorId, "CREATE_USER", "user", result, `Criou o usuário ${input.name.trim()} (${auditRoleLabel(input.localRole)})`);
  return { id: result, success: true };
}

function centsOf(items: Array<{ quantity: number; unitPriceCents: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}

function tabTotalsForSubtotal(subtotalCents: number, tab: { tipPercent?: number; manualAdjustmentCents?: number }) {
  const discountCents = 0;
  const tipCents = Math.round(subtotalCents * (tab.tipPercent ?? 0) / 100);
  const manualAdjustmentCents = tab.manualAdjustmentCents ?? 0;
  return { subtotalCents, discountCents, tipCents, manualAdjustmentCents, totalCents: Math.max(0, subtotalCents + tipCents + manualAdjustmentCents) };
}

function tabTotals(items: Array<{ quantity: number; unitPriceCents: number }>, tab: { tipPercent?: number; tipCents?: number; manualAdjustmentCents?: number }) {
  const subtotalCents = centsOf(items);
  // tipCents é derivado: sempre recalcular para evitar residual após remover itens.
  return tabTotalsForSubtotal(subtotalCents, tab);
}

function parseTime(value: string) {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function listTables() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [configuredSettings, allTableRows] = await Promise.all([
    db.select({ maxTables: settings.maxTables }).from(settings).limit(1),
    db.select({ id: loungeTables.id, number: loungeTables.number }).from(loungeTables).orderBy(asc(loungeTables.number)),
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
    manualAdjustmentCents: tabs.manualAdjustmentCents,
  }).from(tabs).where(eq(tabs.status, "open"));
  const tabIds = openTabs.map((tab) => tab.id);
  const [subtotalRows, paymentRows] = tabIds.length
    ? await Promise.all([
        db.select({ tabId: tabItems.tabId, subtotalCents: sql<number>`COALESCE(SUM(${tabItems.quantity}::bigint * ${tabItems.unitPriceCents}::bigint), 0)` })
          .from(tabItems).where(inArray(tabItems.tabId, tabIds)).groupBy(tabItems.tabId),
        db.select({ tabId: payments.tabId, paidCents: sql<number>`COALESCE(SUM(${payments.amountCents}::bigint), 0)` })
          .from(payments).where(inArray(payments.tabId, tabIds)).groupBy(payments.tabId),
      ])
    : [[], []];
  const tabsByTable = new Map(openTabs.map((tab) => [tab.tableId, tab]));
  const subtotalByTab = new Map(subtotalRows.map((row) => [row.tabId, Number(row.subtotalCents ?? 0)]));
  const paidByTab = new Map<number, number>();
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
      balanceCents: balance,
    };
  });
}

export async function getTabDetails(tabId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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
    openedByName: users.name,
  }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).leftJoin(users, eq(tabs.openedBy, users.id)).leftJoin(customers, eq(tabs.customerId, customers.id)).where(eq(tabs.id, tabId)).limit(1);
  if (!tab[0]) throw new Error("Comanda não encontrada");

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
      createdAt: tabItems.createdAt,
    }).from(tabItems).leftJoin(users, eq(tabItems.addedBy, users.id)).where(eq(tabItems.tabId, tabId)).orderBy(desc(tabItems.createdAt)),
    db.select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      createdAt: payments.createdAt,
      receivedByName: users.name,
    }).from(payments).leftJoin(users, eq(payments.receivedBy, users.id)).where(eq(payments.tabId, tabId)).orderBy(desc(payments.createdAt)),
    db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      description: auditLogs.description,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).where(and(eq(auditLogs.entityType, "tab"), eq(auditLogs.entityId, tabId), inArray(auditLogs.action, ["ADD_ITEM", "UPDATE_ITEM", "REMOVE_ITEM", "ADJUST_TAB_TOTAL"]))).orderBy(desc(auditLogs.createdAt)).limit(100),
  ]);
  const totals = tabTotals(items, tab[0]);
  const totalCents = totals.totalCents;
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...tab[0], items, payments: paymentRows, launchHistory, ...totals, paidCents, balanceCents: Math.max(totalCents - paidCents, 0) };
}

export async function setTabCustomerName(tabId: number, customerName: string | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const normalizedName = customerName?.trim() || null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    await tx.update(tabs).set({ customerName: normalizedName, customerId: null, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.insert(auditLogs).values({
      userId,
      action: "UPDATE_TAB_CUSTOMER",
      entityType: "tab",
      entityId: tabId,
      description: normalizedName ? `Atribuiu a comanda ${tab[0].tabCode} a ${normalizedName}` : `Removeu o nome da comanda ${tab[0].tabCode}`,
    });
    return { tabId, customerName: normalizedName };
  });
}

export async function listCustomers() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await ensureInitialData();
  return db.select().from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name));
}

export async function saveCustomer(input: { id?: number; name: string; cpf: string; phone?: string; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const cpf = normalizeCpf(input.cpf);
  if (!isValidCpf(cpf)) throw new Error("CPF inválido. Confira os 11 dígitos e tente novamente.");
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Informe o nome do cliente");
  const data = { name, cpf, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null, active: true, updatedAt: new Date() };
  const result = input.id ? await db.update(customers).set(data).where(eq(customers.id, input.id)).returning({ id: customers.id }) : await db.insert(customers).values(data).returning({ id: customers.id });
  if (!result[0]) throw new Error("Cliente não encontrado");
  await writeAudit(userId, input.id ? "UPDATE_CUSTOMER" : "CREATE_CUSTOMER", "customer", Number(result[0].id), `${input.id ? "Atualizou" : "Cadastrou"} o cliente ${name}`);
  return { id: Number(result[0].id), success: true };
}

export async function deleteCustomer(customerId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.update(customers).set({ active: false, updatedAt: new Date() }).where(eq(customers.id, customerId));
  const affected = (result as unknown as { rowCount: number }).rowCount ?? 0;
  if (affected !== 1) throw new Error("Cliente não encontrado");
  await writeAudit(userId, "DEACTIVATE_CUSTOMER", "customer", customerId, "Desativou um cliente");
  return { success: true };
}

export async function assignTabCustomer(tabId: number, customerId: number | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const customer = customerId ? await tx.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.active, true))).limit(1) : [];
    if (customerId && !customer[0]) throw new Error("Cliente não encontrado ou inativo");
    await tx.update(tabs).set({ customerId, customerName: customer[0]?.name ?? null, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CUSTOMER", entityType: "tab", entityId: tabId, description: customer[0] ? `Atribuiu ${customer[0].name} (CPF ${customer[0].cpf}) à comanda ${tab[0].tabCode}` : `Removeu o cliente da comanda ${tab[0].tabCode}` });
    return { tabId, customerId, customerName: customer[0]?.name ?? null, customerCpf: customer[0]?.cpf ?? null };
  });
}

export async function openTab(tableId: number, userId: number, openedByName: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const table = await tx.select({ id: loungeTables.id, number: loungeTables.number }).from(loungeTables).where(eq(loungeTables.id, tableId)).for("update").limit(1);
    if (!table[0]) throw new Error("Mesa não encontrada");
    const existingOpenTab = await tx.select({ id: tabs.id }).from(tabs).where(and(eq(tabs.tableId, tableId), eq(tabs.status, "open"))).limit(1);
    if (existingOpenTab[0]) throw new Error("Esta mesa já possui uma comanda aberta");
    const inserted = await tx.insert(tabs).values({ tableId, tabCode: `ABERTA-${Date.now()}`, openedBy: userId }).returning({ id: tabs.id, openedAt: tabs.openedAt });
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
      status: "open" as const,
      version: 1,
      customerName: null,
      customerId: null,
      customerCpf: null,
      openedAt: inserted[0].openedAt,
      closedAt: null,
      openedByName,
      discountPercent: 0,
      discountCents: 0,
      tipPercent: 0,
      tipCents: 0,
      manualAdjustmentCents: 0,
      adjustmentReason: null,
      items: [],
      payments: [],
      launchHistory: [],
      subtotalCents: 0,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0,
    };
  });
}

export async function syncOfflineTab(input: {
  offlineKey: string;
  deviceId: string;
  tableId: number;
  customerName?: string | null;
  tipPercent: 0 | 10;
  items: Array<{ productId: number; productName: string; quantity: number; note?: string | null; createdAt?: string }>;
  payments: Array<{ amountCents: number; method: "pix" | "cash" | "debit" | "credit" | "other"; requestKey: string }>;
}, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: tabs.id, tabCode: tabs.tabCode }).from(tabs).where(eq(tabs.offlineKey, input.offlineKey)).limit(1);
    if (existing[0]) return { tabId: existing[0].id, tabCode: existing[0].tabCode, duplicate: true };
    await tx.execute(sql`SELECT id FROM lounge_tables WHERE id = ${input.tableId} FOR UPDATE`);
    const table = await tx.select().from(loungeTables).where(eq(loungeTables.id, input.tableId)).limit(1);
    if (!table[0]) throw new Error("Mesa não encontrada");
    const open = await tx.select({ id: tabs.id }).from(tabs).where(and(eq(tabs.tableId, input.tableId), eq(tabs.status, "open"))).limit(1);
    if (open[0]) throw new Error(`A mesa ${table[0].number} já possui uma comanda aberta`);
    const inserted = await tx.insert(tabs).values({ tableId: input.tableId, tabCode: `OFFLINE-${Date.now()}`, offlineKey: input.offlineKey, customerName: input.customerName?.trim() || null, openedBy: userId }).returning({ id: tabs.id });
    const tabId = Number(inserted[0].id);
    const tabCode = `#${String(tabId).padStart(6, "0")}`;
    await tx.update(tabs).set({ tabCode }).where(eq(tabs.id, tabId));
    let subtotalCents = 0;
    for (const item of input.items) {
      if (item.quantity < 1 || item.quantity > 99) throw new Error("Quantidade de produto inválida");
      await tx.execute(sql`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`);
      const product = await tx.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product[0] || !product[0].active) throw new Error(`Produto indisponível: ${item.productName}`);
      const systemSettings = await tx.select().from(settings).limit(1);
      if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < item.quantity) throw new Error(`Estoque insuficiente para ${product[0].name}`);
      await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} - ${item.quantity}` }).where(eq(products.id, product[0].id));
      await tx.insert(tabItems).values({ tabId, productId: product[0].id, productName: product[0].name, quantity: item.quantity, baseUnitPriceCents: product[0].priceCents, unitPriceCents: product[0].priceCents, unitCostCents: product[0].costCents, note: item.note ?? null, addedBy: userId, ...(item.createdAt ? { createdAt: new Date(item.createdAt) } : {}) });
      await tx.insert(stockMovements).values({ productId: product[0].id, quantity: item.quantity, direction: "out", reason: "Venda em comanda offline", referenceType: "tab", referenceId: tabId, createdBy: userId });
      subtotalCents += item.quantity * product[0].priceCents;
    }
    const tipCents = Math.round(subtotalCents * input.tipPercent / 100);
    await tx.update(tabs).set({ tipPercent: input.tipPercent, tipCents }).where(eq(tabs.id, tabId));
    let paidCents = 0;
    for (const payment of input.payments) {
      if (payment.amountCents <= 0) throw new Error("Pagamento offline inválido");
      const duplicatePayment = await tx.select({ id: payments.id }).from(payments).where(eq(payments.requestKey, payment.requestKey)).limit(1);
      if (duplicatePayment[0]) continue;
      if (paidCents + payment.amountCents > subtotalCents + tipCents) throw new Error("Os pagamentos superam o total da comanda");
      await tx.insert(payments).values({ tabId, amountCents: payment.amountCents, method: payment.method, requestKey: payment.requestKey, receivedBy: userId });
      paidCents += payment.amountCents;
    }
    await tx.update(loungeTables).set({ activeTabId: tabId, status: paidCents === subtotalCents + tipCents ? "occupied" : paidCents > 0 ? "partial" : "occupied", updatedAt: new Date() }).where(eq(loungeTables.id, input.tableId));
    await tx.insert(auditLogs).values({ userId, action: "SYNC_OFFLINE_TAB", entityType: "tab", entityId: tabId, description: `Sincronizou a comanda offline ${tabCode} do dispositivo ${input.deviceId.slice(-12)}` });
    return { tabId, tabCode, duplicate: false };
  });
}

export async function transferTab(tabId: number, destinationTableId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    if (tab[0].tableId === destinationTableId) throw new Error("Escolha uma mesa diferente da atual");

    await tx.execute(sql`SELECT id FROM lounge_tables WHERE id = ${destinationTableId} FOR UPDATE`);
    const destination = await tx.select().from(loungeTables).where(eq(loungeTables.id, destinationTableId)).limit(1);
    if (!destination[0]) throw new Error("Mesa de destino não encontrada");
    if (destination[0].status !== "free" || destination[0].activeTabId) throw new Error("A mesa de destino já está ocupada");

    await tx.update(tabs).set({ tableId: destinationTableId, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ status: "free", activeTabId: null, updatedAt: new Date() }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.update(loungeTables).set({ status: "occupied", activeTabId: tabId, updatedAt: new Date() }).where(eq(loungeTables.id, destinationTableId));
    await tx.insert(auditLogs).values({
      userId,
      action: "TRANSFER_TAB",
      entityType: "tab",
      entityId: tabId,
      description: `Transferiu a comanda ${tab[0].tabCode} para a mesa ${destination[0].number}`,
    });
    return { tabId, tableId: destinationTableId, tableNumber: destination[0].number };
  });
}

export async function addTabItem(input: { tabId: number; productId: number; quantity: number; note?: string }, userId: number, addedByName: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).for("update").limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).for("update").limit(1);
    if (!product[0] || !product[0].active) throw new Error("Produto indisponível");
    const systemSettings = await tx.select().from(settings).limit(1);
    if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < input.quantity) throw new Error("Estoque insuficiente para este lançamento");

    const { weekday: currentWeekday, minutes: currentMinutes } = saoPauloClock(new Date());
    const scheduledRules = await tx.select().from(productPriceRules).where(and(eq(productPriceRules.productId, input.productId), eq(productPriceRules.active, true)));
    const scheduledRule = scheduledRules.find((rule) => priceRuleAppliesAt(weekdaysFromMask(rule.weekdaysMask) ?? rule.daysOfWeek, rule.startTime, rule.endTime, currentWeekday, currentMinutes));
    const scheduledPriceCents = scheduledRule?.priceCents ?? product[0].priceCents;
    const happyHourActive = Boolean(
      systemSettings[0]?.happyHourEnabled &&
      timeInWindow(
        currentMinutes,
        systemSettings[0]?.happyHourStart ?? "17:00",
        systemSettings[0]?.happyHourEnd ?? "19:00",
      ),
    );
    const configuredDiscount = Number(systemSettings[0]?.happyHourDiscountPercent ?? 0);
    const discountPercent = happyHourActive
      ? Math.min(100, Math.max(0, configuredDiscount))
      : 0;
    const unitPriceCents = Math.round(scheduledPriceCents * (100 - discountPercent) / 100);
    const discountReason = happyHourActive
      ? `Happy Hour${scheduledRule ? ` + ${scheduledRule.name}` : ""}`
      : scheduledRule?.name ?? null;
    await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} - ${input.quantity}` }).where(eq(products.id, input.productId));
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
      addedBy: userId,
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
      createdAt: tabItems.createdAt,
    });
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: "out", reason: "Venda em comanda", referenceType: "tab", referenceId: input.tabId, createdBy: userId });
    const updatedTab = await tx.update(tabs).set({
      tipCents: sql`ROUND(COALESCE((SELECT SUM("quantity"::bigint * "unitPriceCents"::bigint) FROM "tab_items" WHERE "tabId" = ${input.tabId}), 0) * ${tab[0].tipPercent} / 100)::integer`,
      version: sql`${tabs.version} + 1`,
    }).where(eq(tabs.id, input.tabId)).returning({
      version: tabs.version,
      subtotalCents: sql<number>`COALESCE((SELECT SUM("quantity"::bigint * "unitPriceCents"::bigint) FROM "tab_items" WHERE "tabId" = ${input.tabId}), 0)`,
    });
    const currentTotals = tabTotalsForSubtotal(Number(updatedTab[0]?.subtotalCents ?? 0), tab[0]);
    const description = `Adicionou ${input.quantity}x ${product[0].name}`;
    const audit = await tx.insert(auditLogs).values({ userId, action: "ADD_ITEM", entityType: "tab", entityId: input.tabId, description }).returning({ id: auditLogs.id, createdAt: auditLogs.createdAt });
    return {
      item: { ...insertedItem[0], addedByName },
      product: { id: product[0].id, stockQuantity: product[0].stockQuantity - input.quantity },
      ...currentTotals,
      version: updatedTab[0]?.version ?? tab[0].version + 1,
      audit: { id: audit[0].id, action: "ADD_ITEM", description, createdAt: audit[0].createdAt, userName: addedByName },
    };
  });
}

export async function setTabItemQuantity(input: { itemId: number; quantity: number; note?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const item = await tx.select().from(tabItems).where(eq(tabItems.id, input.itemId)).limit(1);
    if (!item[0]) throw new Error("Item não encontrado");
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${item[0].tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, item[0].tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const delta = input.quantity - item[0].quantity;
    await tx.execute(sql`SELECT id FROM products WHERE id = ${item[0].productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, item[0].productId)).limit(1);
    const systemSettings = await tx.select().from(settings).limit(1);
    if (!product[0]) throw new Error("Produto não encontrado");
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
        createdBy: userId,
      });
    }
    const currentItems = await tx.select({ quantity: tabItems.quantity, unitPriceCents: tabItems.unitPriceCents }).from(tabItems).where(eq(tabItems.tabId, item[0].tabId));
    const currentTotals = tabTotals(currentItems, tab[0]);
    const paymentsRows = await tx.select().from(payments).where(eq(payments.tabId, item[0].tabId));
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (currentTotals.totalCents < paidCents) throw new Error("Não é possível reduzir a comanda abaixo do valor já pago");
    await tx.update(tabs).set({ tipCents: currentTotals.tipCents, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, item[0].tabId));
    await tx.insert(auditLogs).values({ userId, action: input.quantity === 0 ? "REMOVE_ITEM" : "UPDATE_ITEM", entityType: "tab", entityId: item[0].tabId, description: `Atualizou ${item[0].productName}` });
  });
}

export async function setTabCharges(input: { tabId: number; tipPercent: 0 | 10 }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const items = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentsRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const totals = tabTotals(items, { ...tab[0], tipPercent: input.tipPercent });
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents > totals.totalCents) throw new Error("O novo total não pode ficar abaixo do valor já pago");
    await tx.update(tabs).set({ discountPercent: 0, discountCents: 0, tipPercent: input.tipPercent, tipCents: totals.tipCents, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CHARGES", entityType: "tab", entityId: input.tabId, description: `Aplicou 10% de gorjeta` });
    return { ...totals, paidCents, balanceCents: totals.totalCents - paidCents };
  });
}

export async function adjustTabValue(input: { tabId: number; newTotalCents: number; reason: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const [items, paymentRows] = await Promise.all([
      tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId)),
      tx.select().from(payments).where(eq(payments.tabId, input.tabId)),
    ]);
    const baseTotals = tabTotals(items, { ...tab[0], manualAdjustmentCents: 0 });
    const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    const plan = planTabTotalAdjustment({
      baseTotalCents: baseTotals.totalCents,
      currentAdjustmentCents: tab[0].manualAdjustmentCents,
      newTotalCents: input.newTotalCents,
      paidCents,
    });
    const reason = input.reason.trim();
    await tx.update(tabs).set({
      manualAdjustmentCents: plan.adjustmentCents,
      adjustmentReason: reason,
      version: sql`${tabs.version} + 1`,
    }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({
      userId,
      action: "ADJUST_TAB_TOTAL",
      entityType: "tab",
      entityId: input.tabId,
      description: `Alterou o total da comanda ${tab[0].tabCode} de R$ ${(plan.currentTotalCents / 100).toFixed(2)} para R$ ${(plan.newTotalCents / 100).toFixed(2)}. Justificativa: ${reason}`,
    });
    return { ...tabTotals(items, { ...tab[0], manualAdjustmentCents: plan.adjustmentCents }), paidCents, balanceCents: plan.newTotalCents - paidCents };
  });
}

export async function registerPayment(input: { tabId: number; amountCents: number; method: "pix" | "cash" | "debit" | "credit" | "other"; requestKey: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const previous = await tx.select().from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
    if (previous[0]) return { paymentId: previous[0].id, duplicate: true };
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    const itemRows = await tx.select().from(tabItems).where(eq(tabItems.tabId, input.tabId));
    const paymentRows = await tx.select().from(payments).where(eq(payments.tabId, input.tabId));
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (input.amountCents <= 0) throw new Error("Informe um valor de pagamento válido");
    if (input.amountCents > balance) throw new Error("O pagamento não pode superar o saldo pendente");
    const inserted = await tx.insert(payments).values({ ...input, receivedBy: userId }).returning({ id: payments.id });
    const paymentId = Number(inserted[0].id);
    const newBalance = balance - input.amountCents;
    await tx.update(loungeTables).set({ status: newBalance > 0 ? "partial" : "occupied" }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.insert(auditLogs).values({ userId, action: "PAYMENT", entityType: "tab", entityId: input.tabId, description: `Recebeu pagamento de R$ ${(input.amountCents / 100).toFixed(2)}` });
    return { paymentId, duplicate: false };
  });
}

export async function closeTab(tabId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda já está encerrada");
    const [itemRows, paymentRows] = await Promise.all([
      tx.select().from(tabItems).where(eq(tabItems.tabId, tabId)),
      tx.select().from(payments).where(eq(payments.tabId, tabId)),
    ]);
    const balance = tabTotals(itemRows, tab[0]).totalCents - paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (balance !== 0) throw new Error(`Não é possível encerrar: saldo pendente de R$ ${(balance / 100).toFixed(2)}`);
    await tx.update(tabs).set({ status: "closed", closedAt: new Date(), closedBy: userId, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ status: "free", activeTabId: null }).where(eq(loungeTables.id, tab[0].tableId));
    await tx.insert(auditLogs).values({ userId, action: "CLOSE_TAB", entityType: "tab", entityId: tabId, description: `Encerrou a comanda ${tab[0].tabCode}` });
  });
}

export async function listProducts(query?: string) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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
    notes: products.notes,
  }).from(products).leftJoin(productCategories, eq(products.categoryId, productCategories.id)).orderBy(asc(products.name));
  const normalized = query?.trim().toLocaleLowerCase();
  return normalized ? rows.filter((row) => `${row.name} ${row.code} ${row.categoryName ?? ""}`.toLocaleLowerCase().includes(normalized)) : rows;
}

export async function listCategories() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories).where(eq(productCategories.active, true)).orderBy(asc(productCategories.name));
}

export async function saveProduct(input: { id?: number; name: string; code: string; categoryId?: number; unit: string; costCents: number; priceCents: number; stockQuantity?: number; minimumStock: number; active: boolean; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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

export async function deleteProduct(productId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product[0]) throw new Error("Produto não encontrado");
  const usedInTabs = await db.select({ id: tabItems.id }).from(tabItems).where(eq(tabItems.productId, productId)).limit(1);
  const usedInStock = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.productId, productId)).limit(1);
  if (usedInTabs[0] || usedInStock[0]) {
    await db.update(products).set({ active: false, updatedAt: new Date() }).where(eq(products.id, productId));
    await writeAudit(userId, "DEACTIVATE_PRODUCT", "product", productId, `Desativou ${product[0].name} para preservar o histórico`);
    return { success: true, deleted: false };
  }
  await db.delete(productPriceRules).where(eq(productPriceRules.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
  await writeAudit(userId, "DELETE_PRODUCT", "product", productId, `Removeu ${product[0].name}`);
  return { success: true, deleted: true };
}

export async function setProductActive(productId: number, active: boolean, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product[0]) throw new Error("Produto não encontrado");
  await db.update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, productId));
  await writeAudit(userId, active ? "ACTIVATE_PRODUCT" : "DEACTIVATE_PRODUCT", "product", productId, `${active ? "Ativou" : "Desativou"} ${product[0].name}`);
  return { success: true, active };
}

export async function adjustStock(input: { productId: number; quantity: number; direction: "in" | "out"; reason: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product[0]) throw new Error("Produto não encontrado");
    const change = input.direction === "in" ? input.quantity : -input.quantity;
    const systemSettings = await tx.select().from(settings).limit(1);
    if (change < 0 && systemSettings[0]?.preventNegativeStock && product[0].stockQuantity + change < 0) throw new Error("Ajuste resultaria em estoque negativo");
    await tx.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${change}` }).where(eq(products.id, input.productId));
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: input.direction, reason: input.reason, createdBy: userId });
    await tx.insert(auditLogs).values({ userId, action: "ADJUST_STOCK", entityType: "product", entityId: input.productId, description: `${input.direction === "in" ? "Entrada" : "Saída"}: ${input.reason}` });
  });
}

export async function listStockMovements() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({
    id: stockMovements.id,
    quantity: stockMovements.quantity,
    direction: stockMovements.direction,
    reason: stockMovements.reason,
    createdAt: stockMovements.createdAt,
    productName: products.name,
    userName: users.name,
  }).from(stockMovements).innerJoin(products, eq(stockMovements.productId, products.id)).leftJoin(users, eq(stockMovements.createdBy, users.id)).orderBy(desc(stockMovements.createdAt)).limit(100);
}

export async function createExpense(input: { description: string; category: string; amountCents: number; method: "pix" | "cash" | "debit" | "credit" | "other"; notes?: string; occurredAt: Date }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const inserted = await db.insert(expenses).values({ ...input, notes: input.notes || null, createdBy: userId }).returning({ id: expenses.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_EXPENSE", "expense", id, `Registrou despesa: ${input.description}`);
  return { id };
}

export async function listExpenses() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({
    id: expenses.id,
    description: expenses.description,
    category: expenses.category,
    amountCents: expenses.amountCents,
    method: expenses.method,
    notes: expenses.notes,
    occurredAt: expenses.occurredAt,
    userName: users.name,
  }).from(expenses).leftJoin(users, eq(expenses.createdBy, users.id)).orderBy(desc(expenses.occurredAt)).limit(100);
}

export async function getDashboard(rangeDays = 30) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = new Date();
  const normalizedRange = Number.isInteger(rangeDays) && rangeDays > 0 ? Math.min(365, rangeDays) : 30;
  const start = saoPauloDayStart(addDaysToSaoPauloDateKey(saoPauloDateKey(now), -normalizedRange + 1));
  const [paymentRows, expenseRows, itemRows, openTabs, inventory] = await Promise.all([
    db.select({ amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt, tabId: payments.tabId }).from(payments).where(gte(payments.createdAt, start)),
    db.select().from(expenses).where(gte(expenses.occurredAt, start)),
    db.select().from(tabItems).where(gte(tabItems.createdAt, start)),
    db.select().from(tabs).where(eq(tabs.status, "open")),
    db.select().from(products).where(eq(products.active, true)),
  ]);
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  const costCents = itemRows.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
  const pendingDetails = await Promise.all(openTabs.map((tab) => getTabDetails(tab.id)));
  const pendingCents = pendingDetails.reduce((sum, tab) => sum + tab.balanceCents, 0);
  const paymentMethods = ["pix", "cash", "debit", "credit", "other"].map((method) => ({
    method,
    totalCents: paymentRows.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amountCents, 0),
  }));
  const productMap = new Map<string, { name: string; quantity: number; totalCents: number }>();
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
    lowStockProducts: inventory.filter((product) => product.stockQuantity <= product.minimumStock)
      .sort((a, b) => (a.stockQuantity - a.minimumStock) - (b.stockQuantity - b.minimumStock))
      .slice(0, 3)
      .map(({ name, stockQuantity, minimumStock }) => ({ name, stockQuantity, minimumStock })),
    paymentMethods,
    topProducts: Array.from(productMap.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 5),
    dailyRevenue: buildDailyRevenue(normalizedRange, paymentRows, now),
  };
}

export async function listAudit() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    description: auditLogs.description,
    createdAt: auditLogs.createdAt,
    userName: users.name,
  }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(100);
}

export async function listProductHistory(productId?: number, from?: Date, to?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const filters = [productId ? eq(tabItems.productId, productId) : undefined, from ? gte(tabItems.createdAt, from) : undefined, to ? lte(tabItems.createdAt, to) : undefined].filter(Boolean);
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
    tableNumber: loungeTables.number,
  }).from(tabItems).innerJoin(tabs, eq(tabItems.tabId, tabs.id)).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(filters.length ? and(...filters) : undefined).orderBy(desc(tabItems.createdAt)).limit(200);
  return rows;
}

export async function getReportSummary(from?: Date, to?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const closedTabFilters = [eq(tabs.status, "closed"), from ? gte(tabs.closedAt, from) : undefined, to ? lte(tabs.closedAt, to) : undefined].filter(Boolean);
  const expenseFilters = [from ? gte(expenses.occurredAt, from) : undefined, to ? lte(expenses.occurredAt, to) : undefined].filter(Boolean);
  const paymentFilters = [from ? gte(payments.createdAt, from) : undefined, to ? lte(payments.createdAt, to) : undefined].filter(Boolean);
  const [closedTabs, expenseRows] = await Promise.all([
    db.select({ id: tabs.id, tabCode: tabs.tabCode, customerName: tabs.customerName, closedAt: tabs.closedAt, tipCents: tabs.tipCents, discountCents: tabs.discountCents, manualAdjustmentCents: tabs.manualAdjustmentCents, adjustmentReason: tabs.adjustmentReason, tableNumber: loungeTables.number })
      .from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).where(and(...closedTabFilters)).orderBy(desc(tabs.closedAt)),
    db.select({ amountCents: expenses.amountCents }).from(expenses).where(expenseFilters.length ? and(...expenseFilters) : undefined),
  ]);
  const tabIds = closedTabs.map((tab) => tab.id);
  const [salesPaymentRows, productRows, periodPaymentRows] = await Promise.all([
    tabIds.length ? db.select({ tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt })
      .from(payments).where(inArray(payments.tabId, tabIds)).orderBy(asc(payments.createdAt)) : Promise.resolve([]),
    tabIds.length ? db.select({ id: tabItems.id, tabId: tabItems.tabId, productName: tabItems.productName, quantity: tabItems.quantity, unitPriceCents: tabItems.unitPriceCents, unitCostCents: tabItems.unitCostCents })
      .from(tabItems).where(inArray(tabItems.tabId, tabIds)).orderBy(asc(tabItems.id)) : Promise.resolve([]),
    db.select({ tabId: payments.tabId, amountCents: payments.amountCents, method: payments.method, createdAt: payments.createdAt, tabCode: tabs.tabCode, tabStatus: tabs.status, tableNumber: loungeTables.number })
      .from(payments).innerJoin(tabs, eq(payments.tabId, tabs.id)).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id))
      .where(paymentFilters.length ? and(...paymentFilters) : undefined).orderBy(desc(payments.createdAt)),
  ]);

  const productsMap = new Map<string, { productName: string; quantity: number; totalCents: number }>();
  const itemsByTab = new Map<number, typeof productRows>();
  for (const item of productRows) {
    const items = itemsByTab.get(item.tabId) ?? [];
    items.push(item);
    itemsByTab.set(item.tabId, items);
    const current = productsMap.get(item.productName) ?? { productName: item.productName, quantity: 0, totalCents: 0 };
    current.quantity += item.quantity;
    current.totalCents += item.quantity * item.unitPriceCents;
    productsMap.set(item.productName, current);
  }
  const paymentsByTab = new Map<number, typeof salesPaymentRows>();
  const paymentMap = new Map<string, { method: string; totalCents: number; count: number }>();
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
    const receivedCents = paymentsForTab.reduce((sum, payment) => sum + payment.amountCents, 0);
    return {
      id: tab.id, tabCode: tab.tabCode, tableNumber: tab.tableNumber, customerName: tab.customerName,
      closedAt: tab.closedAt, subtotalCents, tipCents: tab.tipCents, discountCents: tab.discountCents,
      manualAdjustmentCents: tab.manualAdjustmentCents, adjustmentReason: tab.adjustmentReason,
      salesCents, receivedCents, balanceCents: Math.max(0, salesCents - receivedCents),
      items: items.map(({ id, productName, quantity, unitPriceCents, unitCostCents }) => ({ id, productName, quantity, unitPriceCents, totalCents: quantity * unitPriceCents, costCents: quantity * unitCostCents })),
      payments: paymentsForTab.map(({ amountCents, method, createdAt }) => ({ amountCents, method, createdAt })),
    };
  });
  const receivedCents = periodPaymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  const expensesCents = expenseRows.reduce((sum, expense) => sum + expense.amountCents, 0);
  const financialTotals = calculateReportFinancialTotals(sales, productRows, expensesCents);
  return {
    ...financialTotals, receivedCents, outstandingCents: sales.reduce((sum, tab) => sum + tab.balanceCents, 0),
    salesCount: sales.length, productUnits: productRows.reduce((sum, item) => sum + item.quantity, 0),
    expensesCents,
    paymentMethods: Array.from(paymentMap.values()).sort((a, b) => b.totalCents - a.totalCents),
    products: Array.from(productsMap.values()).sort((a, b) => b.quantity - a.quantity), sales,
    receipts: periodPaymentRows.map(({ tabId, amountCents, method, createdAt, tabCode, tabStatus, tableNumber }) => ({ tabId, amountCents, method, createdAt, tabCode, tabStatus, tableNumber })),
  };
}

export async function listUserAccess() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: users.id, name: users.name, email: users.email, systemRole: users.role, localRole: userProfiles.localRole, active: userProfiles.active, username: localCredentials.username })
    .from(users).innerJoin(userProfiles, eq(userProfiles.userId, users.id)).innerJoin(localCredentials, eq(localCredentials.userId, users.id)).orderBy(asc(users.name));
}

export async function updateUserAccess(input: { userId: number; localRole: "administrator" | "manager" | "attendant"; active: boolean }, actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.insert(userProfiles).values({ userId: input.userId, localRole: input.localRole, active: input.active }).onConflictDoUpdate({ target: userProfiles.userId, set: { localRole: input.localRole, active: input.active } });
  await writeAudit(actorId, "UPDATE_ACCESS", "user", input.userId, `Atualizou permissão para ${auditRoleLabel(input.localRole)} (${input.active ? "ativo" : "inativo"})`);
  return { success: true };
}

export async function deleteLocalUser(userId: number, actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const credential = await db.select({ username: localCredentials.username, name: users.name }).from(localCredentials).innerJoin(users, eq(users.id, localCredentials.userId)).where(eq(localCredentials.userId, userId)).limit(1);
  if (!credential[0]) throw new Error("Usuário não encontrado");
  if (credential[0].username === "admin") throw new Error("O perfil admin não pode ser excluído");
  await db.transaction(async (tx) => {
    await tx.delete(localCredentials).where(eq(localCredentials.userId, userId));
    await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
  });
  await writeAudit(actorId, "DELETE_USER", "user", userId, `Excluiu o acesso de ${credential[0].name || credential[0].username}; histórico operacional preservado`);
  return { success: true };
}

export async function createProductCategory(name: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const inserted = await db.insert(productCategories).values({ name: name.trim(), active: true }).returning({ id: productCategories.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_CATEGORY", "product_category", id, `Criou a categoria ${name.trim()}`);
  return { id, name: name.trim() };
}

export async function listProductPriceRules() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: productPriceRules.id, productId: productPriceRules.productId, productName: products.name, name: productPriceRules.name, startTime: productPriceRules.startTime, endTime: productPriceRules.endTime, daysOfWeek: productPriceRules.daysOfWeek, weekdaysMask: productPriceRules.weekdaysMask, priceCents: productPriceRules.priceCents, active: productPriceRules.active })
    .from(productPriceRules).innerJoin(products, eq(productPriceRules.productId, products.id)).orderBy(asc(products.name), asc(productPriceRules.startTime));
}

export async function createProductPriceRule(input: { productId: number; name: string; startTime: string; endTime: string; daysOfWeek: number[]; weekdaysMask: number; priceCents: number }, userId: number) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (parseTime(input.startTime) === null || parseTime(input.endTime) === null || parseTime(input.startTime) === parseTime(input.endTime)) {
    throw new Error("Informe horários válidos e diferentes para início e fim");
  }
  const product = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto não encontrado");
  const daysOfWeek = Array.from(new Set(input.daysOfWeek)).sort((a, b) => a - b);
  if (!daysOfWeek.length || daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || input.weekdaysMask !== weekdaysToMask(daysOfWeek)) throw new Error("Os dias selecionados da promoção são inválidos");
  const inserted = await db.insert(productPriceRules).values({ ...input, daysOfWeek, weekdaysMask: input.weekdaysMask, active: true, createdBy: userId }).returning({ id: productPriceRules.id });
  const id = Number(inserted[0].id);
  const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  await writeAudit(userId, "CREATE_PRICE_RULE", "product_price_rule", id, `Criou preço programado para ${product[0].name}: ${input.startTime}-${input.endTime} (${daysOfWeek.map((day) => dayNames[day]).join(", ")})`);
  return { id };
}

export async function updateProductPriceRule(input: { ruleId: number; productId: number; name: string; startTime: string; endTime: string; daysOfWeek: number[]; weekdaysMask: number; priceCents: number }, userId: number) {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (parseTime(input.startTime) === null || parseTime(input.endTime) === null || parseTime(input.startTime) === parseTime(input.endTime)) {
    throw new Error("Informe horários válidos e diferentes para início e fim");
  }
  const daysOfWeek = Array.from(new Set(input.daysOfWeek)).sort((a, b) => a - b);
  if (!daysOfWeek.length || daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || input.weekdaysMask !== weekdaysToMask(daysOfWeek)) throw new Error("Os dias selecionados da promoção são inválidos");
  const product = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto não encontrado");
  const rule = await db.select({ id: productPriceRules.id }).from(productPriceRules).where(eq(productPriceRules.id, input.ruleId)).limit(1);
  if (!rule[0]) throw new Error("Regra de preço não encontrada");
  const result = await db.update(productPriceRules).set({
    productId: input.productId,
    name: input.name.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    daysOfWeek,
    weekdaysMask: input.weekdaysMask,
    priceCents: input.priceCents,
  }).where(eq(productPriceRules.id, input.ruleId));
  const affected = (result as unknown as { rowCount: number }).rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de preço não encontrada");
  const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  await writeAudit(userId, "UPDATE_PRICE_RULE", "product_price_rule", input.ruleId, `Editou o preço programado de ${product[0].name}: ${input.startTime}-${input.endTime} (${daysOfWeek.map((day) => dayNames[day]).join(", ")}) por R$ ${(input.priceCents / 100).toFixed(2).replace(".", ",")}`);
  return { success: true };
}

export async function setProductPriceRuleActive(ruleId: number, active: boolean, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.update(productPriceRules).set({ active }).where(eq(productPriceRules.id, ruleId));
  const affected = (result as unknown as { rowCount: number }).rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de preço não encontrada");
  await writeAudit(userId, active ? "ACTIVATE_PRICE_RULE" : "DEACTIVATE_PRICE_RULE", "product_price_rule", ruleId, `${active ? "Ativou" : "Desativou"} regra de preço`);
  return { success: true };
}

export async function deleteProductPriceRule(ruleId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.delete(productPriceRules).where(eq(productPriceRules.id, ruleId));
  const affected = (result as unknown as { rowCount: number }).rowCount ?? 0;
  if (affected !== 1) throw new Error("Regra de preço não encontrada");
  await writeAudit(userId, "DELETE_PRICE_RULE", "product_price_rule", ruleId, "Excluiu regra de preço");
  return { success: true };
}


export async function getCommercialSettings() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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
    updatedAt: new Date(),
  };
}

export async function updateTableLimit(maxTables: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const normalized = Math.min(100, Math.max(1, Math.round(maxTables)));
  await ensureInitialData();
  return db.transaction(async (tx) => {
    const openOutsideLimit = await tx.select({ id: tabs.id, number: loungeTables.number })
      .from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id))
      .where(and(eq(tabs.status, "open"), sql`${loungeTables.number} > ${normalized}`)).limit(1);
    if (openOutsideLimit[0]) throw new Error(`Feche ou transfira a comanda da mesa ${openOutsideLimit[0].number} antes de reduzir o limite`);
    const existingTables = await tx.select({ number: loungeTables.number }).from(loungeTables).orderBy(asc(loungeTables.number));
    const existingNumbers = new Set(existingTables.map((table) => table.number));
    const missingTables = Array.from({ length: normalized }, (_, index) => index + 1).filter((number) => !existingNumbers.has(number)).map((number) => ({ number }));
    if (missingTables.length) await tx.insert(loungeTables).values(missingTables).onConflictDoNothing({ target: loungeTables.number });
    await tx.insert(settings).values({ id: 1, maxTables: normalized }).onConflictDoUpdate({ target: settings.id, set: { maxTables: normalized, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TABLE_LIMIT", entityType: "settings", entityId: 1, description: `Definiu o limite de mesas em ${normalized}` });
    return { maxTables: normalized };
  });
}

export async function updateNegativeStockPolicy(preventNegativeStock: boolean, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.insert(settings).values({ id: 1, preventNegativeStock }).onConflictDoUpdate({
    target: settings.id,
    set: { preventNegativeStock, updatedAt: new Date() },
  });
  await writeAudit(userId, "UPDATE_SETTINGS", "settings", 1, `${preventNegativeStock ? "Ativou" : "Desativou"} a proteção contra estoque negativo`);
  return getCommercialSettings();
}

export async function updateCommercialSettings(input: {
  happyHourEnabled: boolean;
  happyHourStart: string;
  happyHourEnd: string;
  happyHourDiscountPercent: number;
}, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (parseTime(input.happyHourStart) === null || parseTime(input.happyHourEnd) === null || parseTime(input.happyHourStart) === parseTime(input.happyHourEnd)) {
    throw new Error("Informe horários válidos e diferentes para o Happy Hour");
  }
  await db.insert(settings).values({
    id: 1,
    happyHourEnabled: input.happyHourEnabled,
    happyHourStart: input.happyHourStart,
    happyHourEnd: input.happyHourEnd,
    happyHourDiscountPercent: input.happyHourDiscountPercent,
  }).onConflictDoUpdate({
    target: settings.id,
    set: {
      happyHourEnabled: input.happyHourEnabled,
      happyHourStart: input.happyHourStart,
      happyHourEnd: input.happyHourEnd,
      happyHourDiscountPercent: input.happyHourDiscountPercent,
      updatedAt: new Date(),
    },
  });
  await writeAudit(userId, "UPDATE_SETTINGS", "settings", 1, "Atualizou as configurações de Happy Hour");
  return getCommercialSettings();
}
