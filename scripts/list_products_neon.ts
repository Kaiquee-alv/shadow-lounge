import { getDb } from "../server/db.js";
import { products } from "../drizzle/schema.js";
const db = await getDb();
if (!db) throw new Error("Banco indisponível");
console.log(JSON.stringify(await db.select({ id: products.id, name: products.name }).from(products).orderBy(products.id)));
