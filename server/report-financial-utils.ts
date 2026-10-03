export type ReportSaleFinancials = { salesCents: number; tipCents: number };
export type ReportItemFinancials = { quantity: number; unitPriceCents: number; unitCostCents: number };

export function calculateReportFinancialTotals(
  sales: ReportSaleFinancials[],
  items: ReportItemFinancials[],
  expensesCents: number,
) {
  const salesCents = sales.reduce((total, sale) => total + sale.salesCents, 0);
  const tipCents = sales.reduce((total, sale) => total + sale.tipCents, 0);
  const productSalesCents = items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
  const costCents = items.reduce((total, item) => total + item.quantity * item.unitCostCents, 0);

  return {
    salesCents,
    tipCents,
    productSalesCents,
    costCents,
    resultCents: salesCents - tipCents - costCents - expensesCents,
  };
}
