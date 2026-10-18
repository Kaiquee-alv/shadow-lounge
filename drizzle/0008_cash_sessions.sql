CREATE TABLE IF NOT EXISTS "cash_sessions" (
  "id" serial PRIMARY KEY,
  "status" varchar(20) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'closed')),
  "openingFloatCents" integer NOT NULL CHECK ("openingFloatCents" >= 0),
  "openedBy" integer NOT NULL REFERENCES "users"("id"),
  "openedAt" timestamp NOT NULL DEFAULT now(),
  "closedBy" integer REFERENCES "users"("id"),
  "closedAt" timestamp,
  "countedCashCents" integer,
  "expectedCashCents" integer,
  "differenceCents" integer,
  "closeNote" varchar(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_single_open_unique" ON "cash_sessions" ("status") WHERE "status" = 'open';
CREATE INDEX IF NOT EXISTS "cash_sessions_opened_idx" ON "cash_sessions" ("openedAt");

CREATE TABLE IF NOT EXISTS "cash_movements" (
  "id" serial PRIMARY KEY,
  "sessionId" integer NOT NULL REFERENCES "cash_sessions"("id"),
  "kind" varchar(20) NOT NULL CHECK ("kind" IN ('supply', 'withdrawal', 'refund')),
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  "description" varchar(240) NOT NULL,
  "createdBy" integer NOT NULL REFERENCES "users"("id"),
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "cash_movements_session_created_idx" ON "cash_movements" ("sessionId", "createdAt");

ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineKey" varchar(80);
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineFingerprint" varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "tabs_offline_key_unique" ON "tabs" USING btree ("offlineKey");
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cashSessionId" integer REFERENCES "cash_sessions"("id");
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "cashSessionId" integer REFERENCES "cash_sessions"("id");
CREATE INDEX IF NOT EXISTS "payments_cash_session_idx" ON "payments" ("cashSessionId");
CREATE INDEX IF NOT EXISTS "expenses_cash_session_idx" ON "expenses" ("cashSessionId");

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "rolePermissions" jsonb NOT NULL DEFAULT '{"manager":["dashboard","tables","adjustTabValue","customers","products","stock","finance","cash","reports","settings"],"attendant":["tables","customers","cash","reports"]}'::jsonb;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "rolePermissionsVersion" integer NOT NULL DEFAULT 1;
ALTER TABLE "settings" ALTER COLUMN "rolePermissionsVersion" SET DEFAULT 3;
ALTER TABLE "settings" ALTER COLUMN "rolePermissions" SET DEFAULT '{"manager":["dashboard","tables","adjustTabValue","customers","products","stock","finance","cash","reports","settings"],"attendant":["tables","customers","cash","reports"]}'::jsonb;
UPDATE "settings"
SET "rolePermissions" = jsonb_set("rolePermissions", '{manager}', COALESCE("rolePermissions"->'manager', '[]'::jsonb) || '["adjustTabValue"]'::jsonb, true), "rolePermissionsVersion" = 2
WHERE "rolePermissionsVersion" < 2;
UPDATE "settings"
SET "rolePermissions" = jsonb_set(
  jsonb_set("rolePermissions", '{manager}', COALESCE("rolePermissions"->'manager', '[]'::jsonb) || '["cash"]'::jsonb, true),
  '{attendant}', COALESCE("rolePermissions"->'attendant', '[]'::jsonb) || '["cash"]'::jsonb, true
), "rolePermissionsVersion" = 3
WHERE "rolePermissionsVersion" < 3;
