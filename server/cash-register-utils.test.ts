import { describe, expect, it } from "vitest";
import { calculateCashDifferenceCents, calculateCashSessionTotals, isCashOutflowAllowed } from "./cash-register-utils.js";

describe("regras de saldo do caixa", () => {
  it("permite saídas até o dinheiro esperado e rejeita valor maior, zero ou inválido", () => {
    expect(isCashOutflowAllowed(2500, 2500)).toBe(true);
    expect(isCashOutflowAllowed(1, 2500)).toBe(true);
    expect(isCashOutflowAllowed(2501, 2500)).toBe(false);
    expect(isCashOutflowAllowed(1, -1)).toBe(false);
    expect(isCashOutflowAllowed(0, 2500)).toBe(false);
    expect(isCashOutflowAllowed(Number.NaN, 2500)).toBe(false);
  });

  it("calcula diferença positiva, negativa ou zerada entre contado e esperado", () => {
    expect(calculateCashDifferenceCents(11_000, 10_000)).toBe(1_000);
    expect(calculateCashDifferenceCents(9_000, 10_000)).toBe(-1_000);
    expect(calculateCashDifferenceCents(10_000, 10_000)).toBe(0);
  });
});

describe("calculateCashSessionTotals", () => {
  it("calcula o dinheiro esperado incluindo fundo, recebimentos, suprimentos, sangrias, devoluções e despesas em espécie", () => {
    const summary = calculateCashSessionTotals({
      openingFloatCents: 10_000,
      payments: [
        { amountCents: 5_000, method: "cash" },
        { amountCents: 4_000, method: "pix" },
        { amountCents: 2_000, method: "credit" },
      ],
      movements: [
        { amountCents: 2_000, kind: "supply" },
        { amountCents: 1_000, kind: "withdrawal" },
        { amountCents: 500, kind: "refund" },
      ],
      expenses: [
        { amountCents: 1_000, method: "cash" },
        { amountCents: 3_000, method: "pix" },
      ],
    });

    expect(summary.expectedCashCents).toBe(14_500);
    expect(summary.receivedCents).toBe(11_000);
    expect(summary.cashPaymentsCents).toBe(5_000);
    expect(summary.suppliesCents).toBe(2_000);
    expect(summary.withdrawalsCents).toBe(1_000);
    expect(summary.refundsCents).toBe(500);
    expect(summary.cashExpensesCents).toBe(1_000);
    expect(summary.nonCashExpensesCents).toBe(3_000);
  });

  it("totaliza cada forma de pagamento sem somar pagamentos digitais ao dinheiro físico", () => {
    const summary = calculateCashSessionTotals({
      openingFloatCents: 0,
      payments: [
        { amountCents: 1_200, method: "cash" },
        { amountCents: 5_000, method: "pix" },
        { amountCents: 2_500, method: "debit" },
        { amountCents: 3_300, method: "credit" },
        { amountCents: 700, method: "other" },
      ],
      movements: [],
      expenses: [],
    });

    expect(summary.expectedCashCents).toBe(1_200);
    expect(summary.paymentTotals).toEqual([
      { method: "pix", totalCents: 5_000, count: 1 },
      { method: "cash", totalCents: 1_200, count: 1 },
      { method: "debit", totalCents: 2_500, count: 1 },
      { method: "credit", totalCents: 3_300, count: 1 },
      { method: "other", totalCents: 700, count: 1 },
    ]);
  });
});
