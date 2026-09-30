import { describe, expect, it } from "vitest";
import { priceRuleAppliesAt, saoPauloClock, timeInWindow } from "./price-rule-utils.js";

describe("regras de preço por horário", () => {
  it("aplica nos dias selecionados, incluindo o início e excluindo o fim", () => {
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 5, 18 * 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 4, 20 * 60)).toBe(false);
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 5, 22 * 60)).toBe(false);
  });

  it("não aplica um período diurno às 00:00", () => {
    expect(priceRuleAppliesAt([0, 1, 2, 3, 4, 5, 6], "15:00", "22:00", 3, 0)).toBe(false);
    expect(timeInWindow(0, "15:00", "22:00")).toBe(false);
  });

  it("encerra exatamente à meia-noite um período 22:00–00:00", () => {
    expect(priceRuleAppliesAt([6], "22:00", "00:00", 6, 23 * 60 + 59)).toBe(true);
    expect(priceRuleAppliesAt([6], "22:00", "00:00", 0, 0)).toBe(false);
    expect(priceRuleAppliesAt([6], "22:00", "00:00", 0, 1)).toBe(false);
    expect(timeInWindow(0, "22:00", "00:00")).toBe(false);
  });

  it("inclui 00:00 quando a janela noturna realmente termina depois disso", () => {
    expect(priceRuleAppliesAt([6], "22:00", "02:00", 6, 23 * 60 + 59)).toBe(true);
    expect(priceRuleAppliesAt([6], "22:00", "02:00", 0, 0)).toBe(true);
    expect(priceRuleAppliesAt([6], "22:00", "02:00", 0, 2 * 60)).toBe(false);
    expect(timeInWindow(0, "22:00", "02:00")).toBe(true);
  });

  it("mantém regras legadas sem dias como válidas todos os dias", () => {
    expect(priceRuleAppliesAt(undefined, "15:00", "21:00", 0, 18 * 60)).toBe(true);
    expect(priceRuleAppliesAt(null, "15:00", "21:00", 6, 18 * 60)).toBe(true);
  });

  it("mantém o trecho pós-meia-noite vinculado ao dia de início selecionado", () => {
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 5, 23 * 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 6, 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 6, 23 * 60)).toBe(false);
  });

  it("usa uma leitura consistente do dia e hora de São Paulo na virada do dia", () => {
    expect(saoPauloClock(new Date("2026-09-27T02:59:00.000Z"))).toEqual({ weekday: 6, minutes: 1439 });
    expect(saoPauloClock(new Date("2026-09-27T03:00:00.000Z"))).toEqual({ weekday: 0, minutes: 0 });
  });
});
