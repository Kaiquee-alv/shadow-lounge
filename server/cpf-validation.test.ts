import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";
import { formatCpf, isValidCpf, normalizeCpf } from "@shared/cpf";

const saveCustomerProcedure = appRouter._def.procedures["customers.save"] as any;
const parser = saveCustomerProcedure._def.inputs[0];
const customer = { name: "Cliente Exemplo", phone: "", notes: "" };

describe("validação de CPF", () => {
  it("aceita CPF válido com ou sem pontuação", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita dígitos verificadores incorretos e números repetidos", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
  it("normaliza e formata a digitação progressivamente", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299a82")).toBe("529.982");
  });
  it("rejeita CPFs inválidos na rota de salvar cliente", () => {
    expect(() => parser.parse({ ...customer, cpf: "111.111.111-11" })).toThrow();
    expect(() => parser.parse({ ...customer, cpf: "529.982.247-24" })).toThrow();
    expect(() => parser.parse({ ...customer, cpf: "529.982.247-25" })).not.toThrow();
  });
});
