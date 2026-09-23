import { sql } from "drizzle-orm";
import { getDb } from "../server/db.js";

const db = await getDb();
if (!db) throw new Error("Banco indisponível");
await db.transaction(async (tx) => {
  await tx.execute(sql`DELETE FROM product_price_rules`);
  await tx.execute(sql`DELETE FROM tab_items`);
  await tx.execute(sql`DELETE FROM stock_movements`);
  await tx.execute(sql`DELETE FROM products`);
});
const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM products`);
console.log(JSON.stringify({ productsRemaining: result.rows[0]?.count ?? 0 }));
