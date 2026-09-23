import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../server/db.js";
import { products } from "../drizzle/schema.js";

const KEEP_NAMES = ["Heineken Long Neck", "Budweiser Long Neck", "Red Bull", "REFRIGETANTES 350"];

const db = await getDb();
if (!db) throw new Error("Banco de dados indisponível");

const allProducts = await db.select({ id: products.id, name: products.name }).from(products);
const keep = allProducts.filter((product) => KEEP_NAMES.some((name) => name.localeCompare(product.name.trim(), "pt-BR", { sensitivity: "base" }) === 0));
const missing = KEEP_NAMES.filter((name) => !keep.some((product) => product.name.trim().localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0));
if (missing.length) throw new Error(`Produtos não encontrados; nenhum dado foi alterado: ${missing.join(", ")}`);
if (keep.length !== 4) throw new Error("Foram encontrados nomes duplicados ou ambíguos; nenhum dado foi alterado");

const keepIds = keep.map((product) => sql`${product.id}`);
const keepList = sql.join(keepIds, sql`, `);
await db.transaction(async (tx) => {
  await tx.execute(sql`DELETE FROM payments`);
  await tx.execute(sql`DELETE FROM tab_items`);
  await tx.execute(sql`DELETE FROM tabs`);
  await tx.execute(sql`DELETE FROM stock_movements`);
  await tx.execute(sql`DELETE FROM expenses`);
  await tx.execute(sql`DELETE FROM audit_logs`);
  await tx.execute(sql`DELETE FROM product_price_rules WHERE "productId" NOT IN (${keepList})`);
  await tx.execute(sql`DELETE FROM products WHERE id NOT IN (${keepList})`);
  await tx.execute(sql`UPDATE lounge_tables SET status = 'free', "activeTabId" = NULL, "updatedAt" = NOW()`);
  await tx.execute(sql`UPDATE products SET "stockQuantity" = 0, "updatedAt" = NOW()`);
});

const counts = await Promise.all([
  db.execute(sql`SELECT COUNT(*)::int AS count FROM tabs`),
  db.execute(sql`SELECT COUNT(*)::int AS count FROM tab_items`),
  db.execute(sql`SELECT COUNT(*)::int AS count FROM payments`),
  db.execute(sql`SELECT COUNT(*)::int AS count FROM expenses`),
  db.execute(sql`SELECT COUNT(*)::int AS count FROM audit_logs`),
  db.select({ id: products.id, name: products.name, stockQuantity: products.stockQuantity }).from(products),
]);
console.log(JSON.stringify({ preservedProducts: counts[5], emptyOperationalTables: counts.slice(0, 5).map((result: any) => result.rows?.[0]?.count ?? 0) }));
