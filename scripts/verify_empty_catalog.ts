import { listProducts } from "../server/db.ts";
console.log(JSON.stringify({ products: await listProducts() }));
