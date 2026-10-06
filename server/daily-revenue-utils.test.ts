import { describe, expect, it } from "vitest";
import { buildDailyRevenue } from "./daily-revenue-utils.js";

describe("série diária do dashboard", () => {
  it("agrega pagamentos pela data local de São Paulo e inclui dias sem receita", () => {
    const result = buildDailyRevenue(3, [
      { amountCents: 500, createdAt: "2026-10-05T02:30:00.000Z" }, // 04/10, 23:30 em São Paulo
      { amountCents: 700, createdAt: "2026-10-05T03:05:00.000Z" }, // 05/10, 00:05 em São Paulo
      { amountCents: 300, createdAt: "2026-10-06T01:00:00.000Z" }, // 05/10, 22:00 em São Paulo
    ], new Date("2026-10-06T01:30:00.000Z"));

    expect(result.map(({ dateKey, totalCents }) => [dateKey, totalCents])).toEqual([
      ["2026-10-03", 0],
      ["2026-10-04", 500],
      ["2026-10-05", 1000],
    ]);
  });

  it("limita o intervalo a 365 pontos e normaliza intervalos inválidos para 30 dias", () => {
    expect(buildDailyRevenue(0, [], new Date("2026-10-06T12:00:00.000Z"))).toHaveLength(30);
    expect(buildDailyRevenue(500, [], new Date("2026-10-06T12:00:00.000Z"))).toHaveLength(365);
  });
});
