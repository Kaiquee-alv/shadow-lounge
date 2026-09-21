ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "offlineKey" varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS "tabs_offline_key_unique" ON "tabs" USING btree ("offlineKey");
