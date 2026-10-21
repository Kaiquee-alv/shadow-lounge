# Plano de evolução do Shadow Lounge

## Caixa por turno

Implementar no Shadow Lounge um caixa simples por sessão/turno, que pode atravessar a meia-noite. Haverá no máximo uma sessão aberta por estabelecimento. A sessão organiza o fundo inicial, os recebimentos de comandas, as entradas/saídas manuais, despesas e a conferência no fechamento.

### Escopo funcional
- Abrir sessão informando fundo de troco; guardar horário e operador.
- Vincular novos recebimentos de comandas à sessão vigente; exigir as permissões de Mesas e Caixa para receber; bloquear recebimentos quando não houver sessão aberta.
- Registrar suprimento e sangria como movimentos append-only em dinheiro, com descrição, valor e operador.
- Permitir que um perfil com Caixa registre uma despesa paga em dinheiro diretamente na tela do Caixa, sem exigir acesso geral ao Financeiro; vincular despesas em dinheiro à sessão e incluir lançamentos não monetários como informação da sessão, sem alterar o cálculo físico do caixa.
- Fechar a sessão sem fechar comandas; exigir o valor físico contado e guardar esperado, contado, diferença, horário e operador.
- Mostrar totais por forma de pagamento, valor esperado em espécie, lançamentos e histórico de sessões fechadas; permitir imprimir o resumo.
- Proteger a página/API com a permissão configurável `cash`, habilitada nos defaults de gerente e atendente. A administração ainda pode removê-la por perfil.
- Preservar transações históricas: novos vínculos são nullable e registros antigos permanecem sem sessão.

### Regras e decisões
- Valores monetários persistidos em centavos inteiros.
- Uma sessão ativa global, garantida por transação e índice único parcial; não há reinício automático por data e o turno pode passar da meia-noite.
- Caixa esperado em dinheiro = fundo inicial + recebimentos em dinheiro + suprimentos − sangrias/devoluções em dinheiro − despesas pagas em dinheiro.
- PIX, débito, crédito e outros são totalizados separadamente e não aumentam o dinheiro esperado.
- Movimentos manuais são imutáveis: sem rotas de edição ou exclusão; correções futuras deverão ser novos lançamentos compensatórios auditados.
- Fechar caixa não fecha comandas nem exige saldo zero nelas. Pagamentos parciais em uma comanda pertencem ao turno em que foram recebidos; pagamentos posteriores podem pertencer ao turno seguinte.
- A sincronização de pagamentos offline só associa valores à sessão aberta no momento da sincronização; se não houver sessão, o servidor rejeita a sincronização dos pagamentos. Repetições concorrentes usam lock transacional por chave offline e fingerprint do payload; requestKeys de pagamento são revalidadas após obter o lock do caixa. O cliente conserva a requestKey de uma tentativa de pagamento até confirmação e o retry duplicado pode ser confirmado após o fechamento sem criar novo lançamento.
- Venda direta sem comanda fica fora desta primeira etapa; os recebimentos são originados das comandas existentes.
- Com caixa fechado, ainda é permitido abrir uma comanda vazia sem percentual de gorjeta aplicado (com caixa aberto, novas comandas mantêm o padrão de 10%), mas lançar/remover/alterar quantidades de produtos, alterar gorjeta ou total, registrar pagamentos, cadastrar despesas de qualquer forma de pagamento e fazer movimentos de caixa exigem sessão aberta. A interface informa o bloqueio; API e transações do banco validam a sessão para evitar concorrência com o fechamento. Sincronização offline com itens ou pagamentos exige sessão aberta; se rejeitada, a fila local deve permanecer preservada.

### Implementação e estrutura
- `drizzle/schema.ts` e migrações SQL adicionam sessões e movimentos e os vínculos nullable em pagamentos/despesas; o bootstrap idempotente mantém instalações existentes compatíveis.
- `server/db.ts` implementa abertura, resumo, movimentos, fechamento e histórico com transações/locks e auditoria.
- `server/routers.ts` expõe procedures protegidas pela feature `cash`, exige essa permissão também nos recebimentos e oferece o cadastro de despesa em dinheiro no Caixa.
- `shared/role-permissions.ts` registra a feature nos defaults e na normalização de permissões salvas.
- `client/src/pages/Home.tsx` integra navegação, consultas, ações e páginas seguindo os padrões atuais; `client/src/index.css` fornece layout responsivo e impressão.
- `shared/audit-labels.ts` nomeia ações em português; utilitários puros em `server/` cobrem saldo, idempotência e cálculo.

## Impressão direta pelo Windows

### Objetivo e fluxo
- A ação de impressão no celular enfileira o trabalho no servidor; não chama `window.print()`, não abre pop-up de impressão nem exige confirmação no Windows.
- Um agente PowerShell no Windows faz conexões HTTPS de saída, busca um job por vez e envia bytes ESC/POS RAW ao spooler da impressora KP-IM602 instalada. O telefone não precisa conectar-se diretamente à impressora; PC e celular precisam acessar o sistema, e o PC precisa estar ligado para imprimir.
- A fila Windows/driver deve estar configurada para aceitar ESC/POS em RAW. O agente envia a codificação PC850, formatação e corte automático; não usa `PrintDocument` nem depende de janelas do navegador.
- Comandas offline ainda não sincronizadas não podem entrar na fila central; a interface informa a limitação, sem fallback silencioso para impressão no navegador.
- Tipos de job: comanda, pedido do barista e resumo da sessão do caixa (aberta ou fechada).

### Segurança e persistência
- `drizzle/schema.ts`, `drizzle/0009_print_agent.sql` e o bootstrap idempotente adicionam o agente único e a fila persistente no PostgreSQL. O servidor mantém somente hashes SHA-256 dos tokens; o token em texto é entregue uma vez no pareamento e protegido com DPAPI `CurrentUser` no Windows.
- Um administrador autenticado gera código aleatório de uso único, com validade de 10 minutos, ou revoga o agente. O status do agente é visível somente a administradores; nunca são expostos token/hash no browser ou logs.
- Usuários com acesso a Mesas podem enfileirar comandas/pedidos do barista; usuários com Caixa podem enfileirar resumos do caixa. Os endpoints de polling e resultado exigem Bearer token, e o agente só altera jobs vinculados a seu identificador.
- A reivindicação usa transação e `FOR UPDATE SKIP LOCKED`. Se o processo perder a conexão enquanto um job está sendo impresso, ele passa a `uncertain` após cinco minutos e não é reenviado automaticamente, reduzindo duplicatas. `printed` significa que o spooler Windows aceitou o job, não confirmação física do papel.

### Estrutura principal
- `client/src/pages/Home.tsx`: envio à fila de comandas e tickets do barista, com feedback da espera do agente.
- `client/src/pages/CashPage.tsx`: envio de resumo de caixa atual e de sessões fechadas.
- `client/src/pages/Home.tsx` (painel em configurações): status de agente, código temporário e revogação, restritos ao administrador.
- `server/app.ts`: endpoints HTTPS REST de pareamento, claim/polling e resultado do agente.
- `server/db.ts`, `drizzle/schema.ts` e `drizzle/0009_print_agent.sql`: persistência da fila, segurança do token, expiração e bootstrap de banco existente.
- `scripts/windows-print-agent/`: guia de instalação, instalador PowerShell e worker oculto agendado no logon.
- `server/routers.ts`: procedures tRPC protegidas para status e administração do agente, autorização funcional do usuário e enfileiramento a partir dos dados de banco (sem confiar em totais enviados pelo navegador).

### Verificação
- TypeScript, build de produção e testes unitários foram executados no Sandbox.
- Continua necessário validar pareamento e impressão física com a KP-IM602 específica e o driver Windows instalado. Referências e premissas de hardware estão em `scripts/windows-print-agent/README.md`.

### Design
Reutilizar a linguagem visual atual do painel. Mostrar instruções de pareamento curtas, estado conectado/desconectado e feedback claro quando a impressão não puder ser enfileirada; não introduzir imagens ou serviços de terceiros. A instalação do agente no PC é uma etapa explícita, não uma confirmação para cada impressão.

## Estrutura principal do projeto
- `client/src/pages/`: interface principal e páginas operacionais.
- `client/src/lib/`: suporte a operação local/offline.
- `server/`: procedures, persistência e regras de negócio.
- `shared/`: catálogo compartilhado de permissões, tipos e rótulos.
- `drizzle/`: schema e migrações versionadas do PostgreSQL.
- `scripts/windows-print-agent/`: ponte local para a impressora conectada ao Windows.
