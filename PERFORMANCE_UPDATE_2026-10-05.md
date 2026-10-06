# Otimização de desempenho — Shadow Lounge

## Alterações

| Área | Otimização |
|---|---|
| Abrir mesa | A mutação retorna o detalhe inicial completo da comanda; a interface preenche os caches antes de abrir a tela e evita a busca imediata do detalhe. A leitura com lock da mesa virou uma só consulta e foi removida uma atualização intermediária redundante. |
| Lançar produtos | Inclusão de 1 unidade sem observação agora pode ser feita em um toque; o fluxo separado ainda permite editar quantidade e observação. Item e estoque atualizam otimisticamente, e o servidor retorna preço efetivo, promoção, totais, versão e auditoria para reconciliar sem recarregar o detalhe inteiro. Lançamentos de produtos distintos não bloqueiam uns aos outros. |
| Consistência | O servidor mantém transações e locks como autoridade para estoque e comanda. Versões monotônicas impedem que uma resposta atrasada reverta os totais de uma comanda com solicitações simultâneas. |
| Consultas | `ensureInitialData` executa migrações e seed uma vez por instância (com retry se falhar). A grade recebe apenas projeções necessárias e agregados do PostgreSQL, em lugar de transferir e filtrar todas as linhas para cada mesa. As leituras independentes iniciais são paralelizadas. |
| Navegação | Polling da grade fica ativo a cada 10 segundos somente quando a grade está aberta e visível. Dashboard, produtos, clientes e detalhes carregam apenas nas telas pertinentes, com cache curto para evitar buscas repetidas. |
| Banco | Adicionado índice idempotente para status de comandas, refletido também em `drizzle/schema.ts`. |

## Validação

`pnpm check` passou; `pnpm test` passou com **32 testes em 10 arquivos**; `pnpm build:vercel` gerou os bundles atualizados de frontend e API; `git diff --check` passou. O build mantém um aviso não bloqueante sobre o bundle principal acima de 500 kB.

Não executei benchmark de rede contra uma cópia de produção, portanto não atribuo tempos ou percentuais de ganho. As melhorias são de interação imediata e redução explícita de round-trips, payload e trabalho repetido.

## Publicação

As alterações estão compiladas no workspace, mas **não foram publicadas em produção**. O contexto da tarefa registra resposta 403 por falta de autorização ao escopo Vercel do projeto; não tentei contornar o bloqueio.
