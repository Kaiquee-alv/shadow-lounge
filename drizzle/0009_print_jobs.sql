CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id" serial PRIMARY KEY,
  "requestKey" varchar(36) NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "kind" varchar(16) NOT NULL CHECK ("kind" IN ('tab', 'barista')),
  "payload" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'leased', 'printed')),
  "createdBy" integer NOT NULL REFERENCES "users"("id"),
  "claimedBy" integer REFERENCES "users"("id"),
  "stationId" varchar(80),
  "claimTokenHash" varchar(64),
  "leaseExpiresAt" timestamp,
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "printedAt" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_request_key_unique" ON "print_jobs" ("requestKey");
CREATE INDEX IF NOT EXISTS "print_jobs_queue_idx" ON "print_jobs" ("status", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "print_jobs_station_idx" ON "print_jobs" ("claimedBy", "stationId", "status");
