import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não encontrada. Crie um arquivo .env na raiz do projeto."
  );
}

const useSsl = /neon\.tech|sslmode=require/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

const result = await pool.query(
  "SELECT to_regclass('public.audit_logs') AS table_name"
);

await pool.end();

if (result.rows[0]?.table_name) {
  console.log("[Database] Existing PostgreSQL schema detected; skipping automatic push.");
} else {
  console.log("[Database] Empty PostgreSQL schema detected; applying Drizzle schema.");
  execFileSync("pnpm", ["drizzle-kit", "push", "--force"], {
    stdio: "inherit",
  });
}
