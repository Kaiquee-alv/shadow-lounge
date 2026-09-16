import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  auditLogs,
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

const productsSeed = [
  { name: "Heineken Long Neck", code: "HEI-330", category: "Cervejas", cost: 850, price: 1500, stock: 48, minimum: 12 },
  { name: "Budweiser Long Neck", code: "BUD-330", category: "Cervejas", cost: 650, price: 1200, stock: 36, minimum: 10 },
  { name: "Red Bull", code: "RED-250", category: "Energéticos", cost: 900, price: 1800, stock: 17, minimum: 12 },
  { name: "Coca-Cola Lata", code: "COCA-350", category: "Refrigerantes", cost: 380, price: 700, stock: 62, minimum: 15 },
  { name: "Narguilé Premium", code: "NARG-PRM", category: "Narguilé", cost: 1100, price: 4500, stock: 20, minimum: 4 },
  { name: "Essência Mint Ice", code: "ESS-MINT", category: "Essências", cost: 900, price: 2200, stock: 8, minimum: 10 },
  { name: "Carvão Cúbico", code: "CARV-1", category: "Carvões", cost: 450, price: 1200, stock: 28, minimum: 8 },
  { name: "Porção da Casa", code: "PET-001", category: "Petiscos", cost: 1500, price: 3900, stock: 14, minimum: 5 },
];

export async function ensureInitialData() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.insert(loungeTables).values(Array.from({ length: 20 }, (_, index) => ({ number: index + 1 }))).onConflictDoNothing({ target: loungeTables.number });
  await db.insert(productCategories).values(categoriesSeed.map((name) => ({ name }))).onConflictDoUpdate({ target: productCategories.name,
    set: { active: true },
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
      minimumStock: product.minimum,
    }).onConflictDoUpdate({ target: products.code, set: { code: product.code } });
  }
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
    username: "atendente",
    name: "Atendente",
    password: process.env.FIXED_ATTENDANT_PASSWORD ?? "v7Xc6Rbc64dVgmZtPhR7NCt_",
    localRole: "attendant" as const,
  },
  {
    username: "gerente",
    name: "Gerente",
    password: process.env.FIXED_MANAGER_PASSWORD ?? "UZlNDUD8YPkacwEvCB2eQnpZ",
    localRole: "manager" as const,
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
  }).from(localCredentials).where(eq(localCredentials.username, normalizeUsername(username))).limit(1);
  if (!credential[0] || !validatePassword(password, credential[0].passwordHash)) return null;
  return createLocalSession(credential[0].userId);
}

function centsOf(items: Array<{ quantity: number; unitPriceCents: number }>) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}

function tabTotals(items: Array<{ quantity: number; unitPriceCents: number }>, tab: { tipPercent?: number; tipCents?: number }) {
  const subtotalCents = centsOf(items);
  const discountCents = 0;
  const tipCents = tab.tipCents ?? Math.round(subtotalCents * (tab.tipPercent ?? 0) / 100);
  return { subtotalCents, discountCents, tipCents, totalCents: subtotalCents + tipCents };
}

function timeInWindow(currentMinutes: number, startTime: string, endTime: string) {
  const toMinutes = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return start <= end ? currentMinutes >= start && currentMinutes <= end : currentMinutes >= start || currentMinutes <= end;
}

export async function listTables() {
  await ensureInitialData();
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const tableRows = await db.select().from(loungeTables).orderBy(asc(loungeTables.number));
  const openTabs = await db.select().from(tabs).where(eq(tabs.status, "open"));
  const tabIds = openTabs.map((tab) => tab.id);
  const [allItems, allPayments] = tabIds.length
    ? await Promise.all([
        db.select().from(tabItems).where(inArray(tabItems.tabId, tabIds)),
        db.select().from(payments).where(inArray(payments.tabId, tabIds)),
      ])
    : [[], []];
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
    status: tabs.status,
    openedAt: tabs.openedAt,
    closedAt: tabs.closedAt,
    discountPercent: tabs.discountPercent,
    discountCents: tabs.discountCents,
    tipPercent: tabs.tipPercent,
    tipCents: tabs.tipCents,
    tableNumber: loungeTables.number,
    tableId: loungeTables.id,
    openedByName: users.name,
  }).from(tabs).innerJoin(loungeTables, eq(tabs.tableId, loungeTables.id)).leftJoin(users, eq(tabs.openedBy, users.id)).where(eq(tabs.id, tabId)).limit(1);
  if (!tab[0]) throw new Error("Comanda não encontrada");

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
      createdAt: tabItems.createdAt,
    }).from(tabItems).where(eq(tabItems.tabId, tabId)).orderBy(desc(tabItems.createdAt)),
    db.select({
      id: payments.id,
      amountCents: payments.amountCents,
      method: payments.method,
      createdAt: payments.createdAt,
      receivedByName: users.name,
    }).from(payments).leftJoin(users, eq(payments.receivedBy, users.id)).where(eq(payments.tabId, tabId)).orderBy(desc(payments.createdAt)),
  ]);
  const totals = tabTotals(items, tab[0]);
  const totalCents = totals.totalCents;
  const paidCents = paymentRows.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...tab[0], items, payments: paymentRows, ...totals, paidCents, balanceCents: Math.max(totalCents - paidCents, 0) };
}

export async function openTab(tableId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const changed = await tx.update(loungeTables).set({ status: "occupied" }).where(and(eq(loungeTables.id, tableId), eq(loungeTables.status, "free")));
    const affected = (changed as unknown as { rowCount: number }).rowCount ?? 0;
    if (affected !== 1) throw new Error("Esta mesa já possui uma comanda aberta");
    const inserted = await tx.insert(tabs).values({ tableId, tabCode: `ABERTA-${Date.now()}`, openedBy: userId }).returning({ id: tabs.id });
    const tabId = Number(inserted[0].id);
    const tabCode = `#${String(tabId).padStart(6, "0")}`;
    await tx.update(tabs).set({ tabCode }).where(eq(tabs.id, tabId));
    await tx.update(loungeTables).set({ activeTabId: tabId, status: "occupied" }).where(eq(loungeTables.id, tableId));
    await tx.insert(auditLogs).values({ userId, action: "OPEN_TAB", entityType: "tab", entityId: tabId, description: `Abriu a comanda ${tabCode}` });
    return { id: tabId, tabCode };
  });
}

export async function addTabItem(input: { tabId: number; productId: number; quantity: number; note?: string }, userId: number, localRole: "administrator" | "manager" | "attendant") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tabs WHERE id = ${input.tabId} FOR UPDATE`);
    const tab = await tx.select().from(tabs).where(eq(tabs.id, input.tabId)).limit(1);
    if (!tab[0] || tab[0].status !== "open") throw new Error("Esta comanda está encerrada");
    await tx.execute(sql`SELECT id FROM products WHERE id = ${input.productId} FOR UPDATE`);
    const product = await tx.select().from(products).where(eq(products.id, input.productId)).limit(1);
    if (!product[0] || !product[0].active) throw new Error("Produto indisponível");
    const systemSettings = await tx.select().from(settings).limit(1);
    if (systemSettings[0]?.preventNegativeStock && product[0].stockQuantity < input.quantity) throw new Error("Estoque insuficiente para este lançamento");

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduledRules = await tx.select().from(productPriceRules).where(and(eq(productPriceRules.productId, input.productId), eq(productPriceRules.active, true)));
    const scheduledRule = scheduledRules.find((rule) => timeInWindow(currentMinutes, rule.startTime, rule.endTime));
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
    const existing = await tx.select().from(tabItems).where(and(eq(tabItems.tabId, input.tabId), eq(tabItems.productId, input.productId))).limit(1);
    if (existing[0]) {
      await tx.update(tabItems).set({
        quantity: sql`${tabItems.quantity} + ${input.quantity}`,
        unitPriceCents,
        discountPercent,
        discountReason,
        note: input.note ?? existing[0].note,
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
        addedBy: userId,
      });
    }
    await tx.insert(stockMovements).values({ productId: input.productId, quantity: input.quantity, direction: "out", reason: "Venda em comanda", referenceType: "tab", referenceId: input.tabId, createdBy: userId });
    await tx.update(tabs).set({ version: sql`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "ADD_ITEM", entityType: "tab", entityId: input.tabId, description: `Adicionou ${input.quantity}x ${product[0].name}` });
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
    await tx.update(tabs).set({ version: sql`${tabs.version} + 1` }).where(eq(tabs.id, item[0].tabId));
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
    const totals = tabTotals(items, { tipPercent: input.tipPercent });
    const paidCents = paymentsRows.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents > totals.totalCents) throw new Error("O novo total não pode ficar abaixo do valor já pago");
    await tx.update(tabs).set({ discountPercent: 0, discountCents: 0, tipPercent: input.tipPercent, tipCents: totals.tipCents, version: sql`${tabs.version} + 1` }).where(eq(tabs.id, input.tabId));
    await tx.insert(auditLogs).values({ userId, action: "UPDATE_TAB_CHARGES", entityType: "tab", entityId: input.tabId, description: `Aplicou 10% de gorjeta` });
    return { ...totals, paidCents, balanceCents: totals.totalCents - paidCents };
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

export async function saveProduct(input: { id?: number; name: string; code: string; categoryId?: number; unit: string; costCents: number; priceCents: number; stockQuantity: number; minimumStock: number; active: boolean; notes?: string }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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
  const start = new Date();
  start.setDate(start.getDate() - Math.max(rangeDays - 1, 0));
  start.setHours(0, 0, 0, 0);
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
    paymentMethods,
    topProducts: Array.from(productMap.values()).sort((a, b) => b.totalCents - a.totalCents).slice(0, 5),
  };
}

export async function listAudit() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    entityType: auditLogs.entityType,
    description: auditLogs.description,
    createdAt: auditLogs.createdAt,
    userName: users.name,
  }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(100);
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

export async function listUserAccess() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: users.id, name: users.name, email: users.email, systemRole: users.role, localRole: userProfiles.localRole, active: userProfiles.active, username: localCredentials.username })
    .from(users).leftJoin(userProfiles, eq(userProfiles.userId, users.id)).leftJoin(localCredentials, eq(localCredentials.userId, users.id)).orderBy(asc(users.name));
}

export async function updateUserAccess(input: { userId: number; localRole: "administrator" | "manager" | "attendant"; active: boolean }, actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.insert(userProfiles).values({ userId: input.userId, localRole: input.localRole, active: input.active }).onConflictDoUpdate({ target: userProfiles.userId, set: { localRole: input.localRole, active: input.active } });
  await writeAudit(actorId, "UPDATE_ACCESS", "user", input.userId, `Atualizou permissão para ${input.localRole} (${input.active ? "ativo" : "inativo"})`);
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
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: productPriceRules.id, productId: productPriceRules.productId, productName: products.name, name: productPriceRules.name, startTime: productPriceRules.startTime, endTime: productPriceRules.endTime, priceCents: productPriceRules.priceCents, active: productPriceRules.active })
    .from(productPriceRules).innerJoin(products, eq(productPriceRules.productId, products.id)).orderBy(asc(products.name), asc(productPriceRules.startTime));
}

export async function createProductPriceRule(input: { productId: number; name: string; startTime: string; endTime: string; priceCents: number }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const product = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product[0]) throw new Error("Produto não encontrado");
  const inserted = await db.insert(productPriceRules).values({ ...input, active: true, createdBy: userId }).returning({ id: productPriceRules.id });
  const id = Number(inserted[0].id);
  await writeAudit(userId, "CREATE_PRICE_RULE", "product_price_rule", id, `Criou preço programado para ${product[0].name}: ${input.startTime}-${input.endTime}`);
  return { id };
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
    allowManualDiscount: true,
    defaultDiscountPercent: 10,
    happyHourEnabled: false,
    happyHourStart: "17:00",
    happyHourEnd: "19:00",
    happyHourDiscountPercent: 10,
    updatedAt: new Date(),
  };
}

export async function updateCommercialSettings(input: {
  happyHourEnabled: boolean;
  happyHourStart: string;
  happyHourEnd: string;
  happyHourDiscountPercent: number;
}, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
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
