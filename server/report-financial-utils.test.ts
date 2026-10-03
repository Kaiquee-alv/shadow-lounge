import { describe, expect, it } from "vitest";
import { calculateReportFinancialTotals } from "./report-financial-utils.js";

describe("totais financeiros do relatório", () => {
  it("soma gorjetas e vendas dos itens e separa gorjetas do resultado da casa", () => {
    const result = calculateReportFinancialTotals(
      [
        { salesCents: 11_000, tipCents: 1_000 },
        { salesCents: 5_500, tipCents: 500 },
      ],
      [
        { quantity: 2, unitPriceCents: 5_000, unitCostCents: 2_000 },
        { quantity: 1, unitPriceCents: 5_000, unitCostCents: 2_500 },
      ],
      1_000,
    );

    expect(result).toEqual({
      salesCents: 16_500,
      tipCents: 1_500,
      productSalesCents: 15_000,
      costCents: 6_500,
      resultCents: 7_500,
    });
  });

  it("retorna zero para vendas, gorjetas e produtos sem comandas no período", () => {
    expect(calculateReportFinancialTotals([], [], 0)).toEqual({
      salesCents: 0,
      tipCents: 0,
      productSalesCents: 0,
      costCents: 0,
      resultCents: 0,
    });
  });
});
