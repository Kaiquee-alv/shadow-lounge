ALTER TABLE "product_price_rules"
  ADD COLUMN IF NOT EXISTS "daysOfWeek" integer[] NOT NULL
  DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[];
