import { describe, expect, it } from "vitest";
import { priceRuleAppliesAt } from "./price-rule-utils.js";

describe("priceRuleAppliesAt", () => {
  it("aplica a regra somente nos dias selecionados, incluindo o início e excluindo o fim", () => {
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 5, 18 * 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 4, 20 * 60)).toBe(false);
    expect(priceRuleAppliesAt([5], "18:00", "22:00", 5, 22 * 60)).toBe(false);
  });

  it("mantém regras legadas sem dias como válidas todos os dias", () => {
    expect(priceRuleAppliesAt(undefined, "15:00", "21:00", 0, 18 * 60)).toBe(true);
    expect(priceRuleAppliesAt(null, "15:00", "21:00", 6, 18 * 60)).toBe(true);
  });

  it("mantém o trecho após meia-noite vinculado ao dia em que a regra começa", () => {
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 5, 23 * 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 6, 60)).toBe(true);
    expect(priceRuleAppliesAt([5], "22:00", "02:00", 6, 23 * 60)).toBe(false);
  });
});
