ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "manualAdjustmentCents" integer NOT NULL DEFAULT 0;
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "adjustmentReason" varchar(500);
