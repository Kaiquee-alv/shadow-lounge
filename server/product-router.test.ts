import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";

const saveProductProcedure = appRouter._def.procedures["inventory.saveProduct"] as any;
const parser = saveProductProcedure._def.inputs[0];
const product = {
  name: "Produto de teste",
  code: "TEST-1",
  unit: "un",
  costCents: 500,
  priceCents: 1000,
  minimumStock: 0,
  active: true,
};

describe("inventory.saveProduct", () => {
  it("permite editar preço de produto com saldo legado negativo sem exigir estoque no payload", () => {
    expect(() => parser.parse({ ...product, id: 11, stockQuantity: -2 })).not.toThrow();
    expect(() => parser.parse({ ...product, id: 11 })).not.toThrow();
  });

  it("continua impedindo estoque inicial negativo em produto novo", () => {
    expect(() => parser.parse({ ...product, stockQuantity: -2 })).toThrow();
  });
});
