import { describe, expect, it } from "vitest";
import { planTabTotalAdjustment } from "./tab-adjustment-utils.js";

describe("ajuste manual de total de comanda", () => {
  it("calcula o delta necessário para chegar ao total solicitado", () => {
    expect(planTabTotalAdjustment({
      baseTotalCents: 10_000,
      currentAdjustmentCents: 500,
      newTotalCents: 9_000,
      paidCents: 2_000,
    })).toEqual({ currentTotalCents: 10_500, newTotalCents: 9_000, adjustmentCents: -1_000 });
  });

  it("permite zerar o total antes de qualquer pagamento", () => {
    expect(planTabTotalAdjustment({
      baseTotalCents: 1_500,
      currentAdjustmentCents: 0,
      newTotalCents: 0,
      paidCents: 0,
    }).adjustmentCents).toBe(-1_500);
  });

  it("rejeita novo total abaixo do recebido e valores inválidos", () => {
    expect(() => planTabTotalAdjustment({ baseTotalCents: 10_000, currentAdjustmentCents: 0, newTotalCents: 4_999, paidCents: 5_000 }))
      .toThrow("O novo total não pode ficar abaixo do valor já pago");
    expect(() => planTabTotalAdjustment({ baseTotalCents: 10_000, currentAdjustmentCents: 0, newTotalCents: -1, paidCents: 0 }))
      .toThrow("Informe um novo total válido");
  });
});
