-- Shadow Lounge: reset operacional para início da operação
-- Mantém: Cerveja Heineken, Coca-Cola e Água 500ml
-- Mantém usuários, perfis, configurações, categorias e demais dados cadastrais.
-- Atenção: execute no banco correto. A operação remove históricos operacionais.

-- Se uma execução anterior falhou, libera a transação abortada.
ROLLBACK;
BEGIN;

CREATE TEMP TABLE _shadow_keep_products ON COMMIT DROP AS
SELECT id, "name"
FROM products
WHERE replace(replace(lower(trim("name")), '-', ''), ' ', '') IN ('cervejaheineken', 'cocacola', 'água500ml', 'agua500ml');

DO $$
DECLARE
  kept_count integer;
  found_names text;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg("name", ', ' ORDER BY "name"), '(nenhum)')
    INTO kept_count, found_names
    FROM _shadow_keep_products;
  IF kept_count <> 3 THEN
    RAISE EXCEPTION 'Abortado: esperados exatamente 3 produtos, encontrados % (%). Verifique os nomes cadastrados.', kept_count, found_names;
  END IF;
END $$;

-- Remove os dados que começam novamente hoje.
DELETE FROM payments;
DELETE FROM tab_items;
DELETE FROM tabs;
DELETE FROM stock_movements;
DELETE FROM expenses;
DELETE FROM audit_logs;

-- Remove regras de preço de produtos que não serão mantidos.
DELETE FROM product_price_rules
WHERE "productId" NOT IN (SELECT id FROM _shadow_keep_products);

-- Mantém somente os três produtos confirmados.
DELETE FROM products
WHERE id NOT IN (SELECT id FROM _shadow_keep_products);

-- Os produtos mantidos começam sem estoque lançado.
UPDATE products
SET "stockQuantity" = 0,
    "updatedAt" = NOW();

-- Todas as mesas começam livres e sem comanda vinculada.
UPDATE lounge_tables
SET status = 'free',
    "activeTabId" = NULL,
    "updatedAt" = NOW();

COMMIT;

-- Conferência final.
SELECT 'tabs' AS tabela, COUNT(*) AS registros FROM tabs
UNION ALL SELECT 'tab_items', COUNT(*) FROM tab_items
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL SELECT 'products_preserved', COUNT(*) FROM products;

SELECT id, "name", "stockQuantity", active
FROM products
ORDER BY "name";

SELECT COUNT(*) AS users_preserved FROM users;
SELECT COUNT(*) AS tables_available FROM lounge_tables WHERE status = 'free';
