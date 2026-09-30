import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";
import { weekdaysFromMask, weekdaysToMask } from "./price-rule-utils.js";

const sampleRule = {
  productId: 7,
  name: "Promo de terça e quinta",
  startTime: "18:00",
  endTime: "22:00",
  daysOfWeek: [2, 4],
  weekdaysMask: 20,
  priceCents: 1200,
};

describe("máscara de dias da semana", () => {
  it("converte os dias selecionados em uma máscara explícita e recupera o mesmo conjunto", () => {
    expect(weekdaysToMask([2, 4])).toBe(20);
    expect(weekdaysFromMask(20)).toEqual([2, 4]);
    expect(weekdaysFromMask(127)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdaysFromMask(0)).toBeNull();
    expect(weekdaysFromMask(128)).toBeNull();
  });
});

describe("pricing router", () => {
  it("registra a procedure de atualização usada pela interface", () => {
    expect(appRouter._def.procedures["pricing.updateRule"]).toBeDefined();
  });

  it.each([
    ["createRule", { ...sampleRule }],
    ["updateRule", { ...sampleRule, ruleId: 23 }],
  ])("preserva os dias enviados pelo cliente em %s", (path, input) => {
    const procedure = appRouter._def.procedures[`pricing.${path}`] as any;
    const parsed = procedure._def.inputs[0].parse(input);
    expect(parsed.daysOfWeek).toEqual([2, 4]);
    expect(parsed.weekdaysMask).toBe(20);
  });

  it("rejeita array e máscara com dias diferentes", () => {
    const procedure: any = appRouter._def.procedures["pricing.createRule"];
    expect(() => procedure._def.inputs[0].parse({ ...sampleRule, weekdaysMask: 127 })).toThrow();
  });
});
