import { getDb } from "../server/db.js";
import { settings, productCategories, products } from "../drizzle/schema.js";
const db = await getDb();
if (!db) throw new Error("Banco indisponível");
console.log(JSON.stringify({ settings: await db.select({ id: settings.id }).from(settings), categories: await db.select({ id: productCategories.id }).from(productCategories), products: await db.select({ id: products.id }).from(products) }));
