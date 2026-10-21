# Plano: Caixa por turno

## Objetivo
Implementar no Shadow Lounge um caixa simples por sessão/turno, que pode atravessar a meia-noite. Haverá no máximo uma sessão aberta por estabelecimento. A sessão organiza o fundo inicial, os recebimentos de comandas, as entradas/saídas manuais, despesas e a conferência no fechamento.

## Escopo funcional
- Abrir sessão informando fundo de troco; guardar horário e operador.
- Vincular novos recebimentos de comandas à sessão vigente; exigir as permissões de Mesas e Caixa para receber; bloquear recebimentos quando não houver sessão aberta.
- Registrar suprimento e sangria como movimentos append-only em dinheiro, com descrição, valor e operador.
- Permitir que um perfil com Caixa registre uma despesa paga em dinheiro diretamente na tela do Caixa, sem exigir acesso geral ao Financeiro; vincular despesas em dinheiro à sessão e incluir lançamentos não monetários como informação da sessão, sem alterar o cálculo físico do caixa.
- Fechar a sessão sem fechar comandas; exigir o valor físico contado e guardar esperado, contado, diferença, horário e operador.
- Mostrar totais por forma de pagamento, valor esperado em espécie, lançamentos e histórico de sessões fechadas; permitir imprimir o resumo.
- Proteger a página/API com a permissão configurável `cash`, habilitada nos defaults de gerente e atendente. A administração ainda pode removê-la por perfil.
- Preservar transações históricas: novos vínculos são nullable e registros antigos permanecem sem sessão.

## Regras e decisões
- Valores monetários persistidos em centavos inteiros.
- Uma sessão ativa global, garantida por transação e índice único parcial; não há reinício automático por data e o turno pode passar da meia-noite.
- Caixa esperado em dinheiro = fundo inicial + recebimentos em dinheiro + suprimentos − sangrias/devoluções em dinheiro − despesas pagas em dinheiro.
- PIX, débito, crédito e outros são totalizados separadamente e não aumentam o dinheiro esperado.
- Movimentos manuais são imutáveis: sem rotas de edição ou exclusão; correções futuras deverão ser novos lançamentos compensatórios auditados.
- Fechar caixa não fecha comandas nem exige saldo zero nelas. Pagamentos parciais em uma comanda pertencem ao turno em que foram recebidos; pagamentos posteriores podem pertencer ao turno seguinte.
- A sincronização de pagamentos offline só associa valores à sessão aberta no momento da sincronização; se não houver sessão, o servidor rejeita a sincronização dos pagamentos. Repetições concorrentes usam lock transacional por chave offline e fingerprint do payload; requestKeys de pagamento são revalidadas após obter o lock do caixa. O cliente conserva a requestKey de uma tentativa de pagamento até confirmação e o retry duplicado pode ser confirmado após o fechamento sem criar novo lançamento.
- Venda direta sem comanda fica fora desta primeira etapa; os recebimentos são originados das comandas existentes.
- Com caixa fechado, ainda é permitido abrir uma comanda vazia sem percentual de gorjeta aplicado (com caixa aberto, novas comandas mantêm o padrão de 10%), mas lançar/remover/alterar quantidades de produtos, alterar gorjeta ou total, registrar pagamentos, cadastrar despesas de qualquer forma de pagamento e fazer movimentos de caixa exigem sessão aberta. A interface informa o bloqueio; API e transações do banco validam a sessão para evitar concorrência com o fechamento. Sincronização offline com itens ou pagamentos exige sessão aberta; se rejeitada, a fila local deve permanecer preservada.

## Implementação e estrutura
- `drizzle/schema.ts` e uma nova migração SQL adicionam sessões e movimentos e os vínculos nullable em pagamentos/despesas; o bootstrap existente recebe SQL idempotente para bancos instalados, pois o script de inicialização não executa migrações normais em bancos já existentes. Migração e bootstrap também asseguram o índice único de `tabs.offlineKey` declarado no schema.
- `server/db.ts` implementa abertura, resumo, movimentos, fechamento e histórico com transações/locks e auditoria.
- `server/routers.ts` expõe procedures protegidas pela feature `cash`, exige essa permissão também nos recebimentos e oferece o cadastro de despesa em dinheiro no Caixa.
- `shared/role-permissions.ts` registra a nova feature nos defaults e na normalização de permissões salvas.
- `client/src/pages/Home.tsx` integra navegação, consultas, ações e página visual seguindo os padrões atuais; `client/src/index.css` fornece layout responsivo e impressão.
- `shared/audit-labels.ts` nomeia as ações de caixa em português; `server/payment-idempotency-utils.ts` normaliza e compara chaves idempotentes.
- Testes unitários cobrem regras puras de saldo, diferença, fingerprint ausente e compatibilidade de chaves, além de testes de autorização das procedures. Locks e constraints no PostgreSQL asseguram a serialização; não se escreve no banco compartilhado durante a validação.

## Impressão pelo PC principal
- Como o aplicativo fica na Vercel e a impressora está numa rede local, os dispositivos móveis criarão trabalhos numa fila PostgreSQL; o PC manterá uma página autenticada da aplicação aberta e consultará a fila por conexões HTTPS de saída. Nenhuma porta do PC ou impressora será publicada na internet.
- `shared/print-job.ts` define e valida payloads estruturados de comanda e pedido de preparo; a fila persiste status, origem, consumidor, expiração da reserva e horário de confirmação para permitir recuperação sem duplicar consumidores concorrentes.
- `server/db.ts`, `server/routers.ts`, `drizzle/schema.ts` e uma migração/bootstrap idempotente implementam entrada autenticada, reserva transacional, confirmação ou liberação de jobs. Operadores autorizados em Mesas podem enviar pedidos; somente administradores/gerentes podem operar a estação.
- `client/src/pages/Home.tsx` enviará os dois fluxos de impressão à fila. `client/src/pages/PrintStationPage.tsx` busca um job e abre o comprovante térmico no navegador do PC para imprimir pela fila/drivers instalados no Windows; após fechar a caixa de impressão, o operador confirma ou devolve o job à fila.
- A página do PC exige sessão ativa e deve permanecer aberta para receber novas comandas; caso o PC fique offline, a fila aguarda sua volta. O site é hospedado na Vercel, então a aplicação do PC atua como consumidora autenticada, sem exposição de serviços locais.

## Design
Reutilizar a linguagem visual existente do painel: interface operacional escura/clara conforme os painéis já implementados, hierarquia com cards compactos, tabelas legíveis e ações primárias explícitas. Priorizar leitura rápida de saldo esperado e diferença; não adicionar ilustrações ou dependências externas.

## Estrutura principal do projeto
- `client/src/pages/`: interface principal e páginas operacionais.
- `client/src/lib/`: suporte a operação local/offline.
- `server/`: procedures, persistência e regras de negócio.
- `shared/`: catálogo compartilhado de permissões, tipos e rótulos.
- `drizzle/`: schema e migrações versionadas do PostgreSQL.
