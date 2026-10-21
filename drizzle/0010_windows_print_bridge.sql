CREATE TABLE IF NOT EXISTS "windows_print_agents" (
  "id" integer PRIMARY KEY,
  CONSTRAINT "windows_print_agents_singleton_check" CHECK ("id" = 1),
  "computerName" varchar(120) NOT NULL,
  "printerName" varchar(160) NOT NULL,
  "pairingCodeHash" varchar(64),
  "pairingCodeExpiresAt" timestamp,
  "tokenHash" varchar(64),
  "enabled" boolean NOT NULL DEFAULT true,
  "lastSeenAt" timestamp,
  "pairedAt" timestamp,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "windows_print_agents_token_hash_unique" ON "windows_print_agents" ("tokenHash");

CREATE TABLE IF NOT EXISTS "windows_print_jobs" (
  "id" serial PRIMARY KEY,
  "agentId" integer NOT NULL REFERENCES "windows_print_agents"("id"),
  "kind" varchar(20) NOT NULL CHECK ("kind" IN ('tab', 'barista', 'cash')),
  "status" varchar(20) NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'processing', 'printed', 'failed', 'uncertain')),
  "payload" jsonb NOT NULL,
  "requestedBy" integer NOT NULL REFERENCES "users"("id"),
  "attempts" integer NOT NULL DEFAULT 0,
  "lastError" varchar(500),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "claimedAt" timestamp,
  "completedAt" timestamp
);
CREATE INDEX IF NOT EXISTS "windows_print_jobs_queue_idx" ON "windows_print_jobs" ("agentId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "windows_print_jobs_created_idx" ON "windows_print_jobs" ("createdAt");
