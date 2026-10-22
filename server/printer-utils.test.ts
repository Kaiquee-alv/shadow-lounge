import { describe, expect, it } from "vitest";
import {
  buildBaristaPrintPayload,
  buildCashSessionPrintPayload,
  buildTabPrintPayload,
  createPrinterAgentToken,
  createPrinterPairingCode,
  hashPrinterSecret,
  printerSecretMatches,
  type PrintableTab,
} from "./printer-utils.js";

const tab: PrintableTab = {
  id: 42,
  tabCode: "#000042",
  tableNumber: 7,
  customerName: "Cliente",
  openedAt: "2026-10-20T21:00:00.000Z",
  items: [{ id: 3, productName: "Água com gás", quantity: 2, unitPriceCents: 500, note: "Sem gelo", addedByName: "Ana", createdAt: "2026-10-20T21:05:00.000Z" }],
  payments: [{ method: "pix", amountCents: 300 }],
  subtotalCents: 1000,
  tipCents: 100,
  paidCents: 300,
  totalCents: 1100,
  balanceCents: 800,
};

describe("impressão direta", () => {
  it("gera códigos de pareamento e tokens longos e imprevisíveis", () => {
    const code = createPrinterPairingCode();
    const token = createPrinterAgentToken();
    expect(code.length).toBeGreaterThanOrEqual(20);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(createPrinterPairingCode()).not.toBe(code);
    expect(createPrinterAgentToken()).not.toBe(token);
  });

  it("armazena e compara hashes sem aceitar outro segredo", () => {
    const token = createPrinterAgentToken();
    const hash = hashPrinterSecret(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(printerSecretMatches(token, hash)).toBe(true);
    expect(printerSecretMatches(`${token}x`, hash)).toBe(false);
    expect(printerSecretMatches(token, null)).toBe(false);
  });

  it("compõe recibo de comanda com detalhes, valores e pagamentos", () => {
    const payload = buildTabPrintPayload(tab);
    const text = payload.lines.map((entry) => entry.text).join("\n");
    expect(payload.kind).toBe("tab");
    expect(text).toContain("COMANDA #000042");
    expect(text).toContain("2x Água com gás");
    expect(text).toContain("Obs.: Sem gelo");
    expect(text).toContain("SALDO:");
    expect(text).toContain("PIX:");
  });

  it("gera resumo térmico da sessão do caixa com conferência e formas de pagamento", () => {
    const payload = buildCashSessionPrintPayload({
      id: 12, status: "closed", openedAt: "2026-10-20T21:00:00.000Z", closedAt: "2026-10-21T01:00:00.000Z",
      openedByName: "Ana", closedByName: "Bruno", openingFloatCents: 5000, receivedCents: 12000,
      cashPaymentsCents: 4000, suppliesCents: 1000, withdrawalsCents: 500, refundsCents: 0,
      cashExpensesCents: 300, nonCashExpensesCents: 200, expectedCashCents: 9200,
      countedCashCents: 9000, differenceCents: -200, closeNote: "Conferido",
      paymentTotals: [{ method: "pix", totalCents: 8000 }, { method: "cash", totalCents: 4000 }],
    });
    const text = payload.lines.map((entry) => entry.text).join("\n");
    expect(payload.kind).toBe("cash");
    expect(text).toContain("SESSÃO #12");
    expect(text).toContain("Dinheiro esperado: R$");
    expect(text).toContain("Dinheiro contado:");
    expect(text).toContain("Diferença:");
    expect(text).toContain("PIX:");
  });

  it("gera pedido do barista apenas para item pertencente à comanda", () => {
    const payload = buildBaristaPrintPayload(tab, 3);
    expect(payload.kind).toBe("barista");
    expect(payload.lines.map((entry) => entry.text).join("\n")).toContain("PEDIDO PARA O BARISTA");
    expect(payload.lines.find((entry) => entry.text === "PEDIDO PARA O BARISTA")).toMatchObject({ size: "normal", bold: true });
    expect(payload.lines.find((entry) => entry.text === "OBSERVAÇÃO")).toMatchObject({ size: "large", bold: true });
    expect(payload.lines.find((entry) => entry.text === "Sem gelo")).toMatchObject({ size: "xlarge", bold: true });
    expect(payload.lines.find((entry) => entry.text === "2x")).toMatchObject({ size: "large", bold: true });
    expect(() => buildBaristaPrintPayload(tab, 99)).toThrow("não pertence a esta comanda");
  });
});
