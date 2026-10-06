import { describe, expect, it } from "vitest";
import { formatDateTimeInSaoPaulo, formatTimeInSaoPaulo, firstOfMonthInSaoPaulo, saoPauloDateKey, saoPauloDayEnd, saoPauloDayStart } from "../shared/sao-paulo-time.js";

describe("formatação de data e hora do lounge", () => {
  it("mostra o horário no fuso America/Sao_Paulo independentemente do fuso do servidor", () => {
    expect(formatTimeInSaoPaulo("2026-10-06T01:05:00.000Z")).toBe("22:05");
    expect(formatDateTimeInSaoPaulo("2026-10-06T01:05:00.000Z")).toBe("05 de out., 22:05");
  });

  it("trata horários nulos ou inválidos sem quebrar a interface", () => {
    expect(formatTimeInSaoPaulo(null)).toBe("—");
    expect(formatTimeInSaoPaulo("data inválida")).toBe("—");
  });

  it("calcula início, fim e mês com base na data de São Paulo", () => {
    const now = new Date("2026-10-06T01:05:00.000Z");
    expect(saoPauloDateKey(now)).toBe("2026-10-05");
    expect(firstOfMonthInSaoPaulo(now)).toBe("2026-10-01");
    expect(saoPauloDayStart("2026-10-05").toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(saoPauloDayEnd("2026-10-05").toISOString()).toBe("2026-10-06T02:59:59.999Z");
  });
});
