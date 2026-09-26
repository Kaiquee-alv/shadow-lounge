# Relatórios financeiros — Shadow Lounge

A tela **Relatórios** separa três bases de data para que o período seja interpretável e auditável:

- **Venda/faturamento:** comandas com status encerrada, filtradas pela data de encerramento (`tabs.closedAt`). O valor da venda é calculado pelos itens registrados, mais gorjeta e menos descontos.
- **Recebimentos/caixa:** pagamentos registrados no período, filtrados por `payments.createdAt`. Cada recebimento informa comanda, mesa, situação da comanda, método, valor e horário. Inclui pagamentos feitos em comandas ainda em andamento; por isso o total de recebimentos do período pode diferir do valor vendido no mesmo intervalo.
- **Despesas:** data em que a despesa ocorreu (`expenses.occurredAt`).

O **custo dos produtos** é calculado pelo custo unitário histórico gravado em cada item das comandas encerradas no período. O **resultado estimado** é vendas de comandas encerradas menos esse custo e despesas ocorridas no período. Não é uma demonstração contábil; os cartões mostram seus componentes para conferência.

As linhas de **Comandas encerradas** permitem abrir o lastro item a item, com os pagamentos da comanda e eventual saldo. O **Extrato de caixa** é a relação de cada recebimento do período. O botão **Exportar CSV** baixa as comandas detalhadas e os recebimentos do intervalo.

## Validação executada

- `pnpm check` — TypeScript sem erros.
- `pnpm test` — testes automatizados aprovados.
- `pnpm build` — compilação de produção concluída.
