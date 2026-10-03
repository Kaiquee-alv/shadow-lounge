import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLocalRole: vi.fn(),
  getReportSummary: vi.fn(),
  listCustomers: vi.fn(),
  saveCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

vi.mock("./db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.js")>();
  return {
    ...actual,
    getLocalRole: mocks.getLocalRole,
    getReportSummary: mocks.getReportSummary,
    listCustomers: mocks.listCustomers,
    saveCustomer: mocks.saveCustomer,
    deleteCustomer: mocks.deleteCustomer,
  };
});

import { appRouter } from "./routers.js";

const caller = appRouter.createCaller({
  user: { id: 52, role: "user", name: "Atendente" },
  req: {} as any,
  res: {} as any,
} as any);

describe("permissões de atendente para clientes e relatórios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalRole.mockResolvedValue({ localRole: "attendant", active: true });
    mocks.getReportSummary.mockResolvedValue({ sales: [], receipts: [] });
    mocks.listCustomers.mockResolvedValue([{ id: 23, name: "Cliente" }]);
    mocks.saveCustomer.mockResolvedValue({ id: 24, success: true });
    mocks.deleteCustomer.mockResolvedValue({ success: true });
  });

  it("permite listar e cadastrar clientes mantendo a validação de CPF", async () => {
    await expect(caller.customers.list()).resolves.toEqual([{ id: 23, name: "Cliente" }]);
    await expect(caller.customers.save({ name: "Cliente Teste", cpf: "529.982.247-25" })).resolves.toEqual({ id: 24, success: true });
    expect(mocks.listCustomers).toHaveBeenCalledOnce();
    expect(mocks.saveCustomer).toHaveBeenCalledWith({ name: "Cliente Teste", cpf: "529.982.247-25" }, 52);
    await expect(caller.customers.save({ name: "Cliente Teste", cpf: "111.111.111-11" })).rejects.toThrow();
  });

  it("permite consultar o relatório financeiro", async () => {
    const result = await caller.reports.summary({});
    expect(result).toEqual({ sales: [], receipts: [] });
    expect(mocks.getReportSummary).toHaveBeenCalledOnce();
  });

  it("permite desativar um cliente pela operação de cliente", async () => {
    const result = await caller.customers.delete({ customerId: 23 });
    expect(result).toEqual({ success: true });
    expect(mocks.deleteCustomer).toHaveBeenCalledWith(23, 52);
  });
});
