ALTER TABLE "product_price_rules"
  ADD COLUMN IF NOT EXISTS "weekdaysMask" integer NOT NULL DEFAULT 127;

UPDATE "product_price_rules" AS rule
SET "weekdaysMask" = COALESCE(
  (
    SELECT bit_or(1 << value)
    FROM unnest(COALESCE(rule."daysOfWeek", ARRAY[]::integer[])) AS selected_day(value)
  ),
  127
);
