# Atualização: ajuste manual do total da comanda

## O que foi incluído

- Administradores e gerentes podem definir um novo total para uma comanda aberta.
- O motivo é obrigatório (mínimo de 5 caracteres; até 500) e fica registrado no log de auditoria.
- O total não pode ser reduzido abaixo dos pagamentos já registrados.
- Os pagamentos, a inclusão/remoção de itens, a gorjeta e o saldo passam a considerar o ajuste manual.
- A comanda exibe o ajuste e a justificativa; o relatório financeiro e o CSV preservam essa informação para vendas encerradas.
- Atendentes não recebem acesso ao campo. A autorização é validada no backend, não apenas na interface.

O campo `manualAdjustmentCents` persiste o delta entre o total calculado pelos itens/gorjeta e o total definido pelo gerente. Ele é armazenado em centavos e pode ser negativo. `adjustmentReason` preserva a justificativa mais recente, e cada mudança também gera um evento de auditoria com valor anterior, novo valor, autor e motivo.

## Banco de dados

A inicialização do servidor executa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para criar as colunas sem apagar dados existentes. Também está incluído o SQL independente em `drizzle/0006_manual_tab_adjustment.sql`, caso a migração precise ser aplicada manualmente:

```sql
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "manualAdjustmentCents" integer NOT NULL DEFAULT 0;
ALTER TABLE "tabs" ADD COLUMN IF NOT EXISTS "adjustmentReason" varchar(500);
```

## Validação feita

- `pnpm check`: passou.
- `pnpm test`: 24 testes passaram em 7 arquivos.
- `pnpm build:vercel`: passou; gerou `api/index.js` e os assets de `dist/public`.

O build ainda exibe avisos já existentes sobre variáveis de analytics ausentes e tamanho de um chunk JavaScript; não impediram a compilação.

## Publicação

Este pacote contém fontes alteradas, migração e artefatos compilados. **A atualização não foi publicada em produção nesta etapa**: o histórico da tarefa registra bloqueio 403 de escrita no repositório GitHub `Kaiquee-alv/shadow-lounge` e necessidade de acesso autorizado ao escopo Vercel. A aplicação da migração é idempotente quando a nova versão do backend inicializar.
