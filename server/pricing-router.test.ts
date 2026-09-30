import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";

const sampleRule = {
  productId: 7,
  name: "Promo de terça e quinta",
  startTime: "18:00",
  endTime: "22:00",
  daysOfWeek: [2, 4],
  priceCents: 1200,
};

describe("pricing router", () => {
  it("registra a procedure de atualização usada pela interface", () => {
    expect(appRouter._def.procedures["pricing.updateRule"]).toBeDefined();
  });

  it.each([
    ["createRule", { ...sampleRule }],
    ["updateRule", { ...sampleRule, ruleId: 23 }],
  ])("preserva apenas os dias enviados pelo cliente em %s", (path, input) => {
    const procedure = appRouter._def.procedures[`pricing.${path}`] as any;
    const parsed = procedure._def.inputs[0].parse(input);
    expect(parsed.daysOfWeek).toEqual([2, 4]);
  });
});
