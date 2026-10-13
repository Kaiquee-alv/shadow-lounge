import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLocalRole: vi.fn(),
  getReportSummary: vi.fn(),
  listCustomers: vi.fn(),
  saveCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  getRolePermissions: vi.fn(),
  adjustTabValue: vi.fn(),
  listStockMovements: vi.fn(),
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
    getRolePermissions: mocks.getRolePermissions,
    adjustTabValue: mocks.adjustTabValue,
    listStockMovements: mocks.listStockMovements,
  };
});

import { appRouter } from "./routers.js";
import { DEFAULT_ROLE_PERMISSIONS } from "@shared/role-permissions";

const caller = appRouter.createCaller({
  user: { id: 52, role: "user", name: "Atendente" },
  req: {} as any,
  res: {} as any,
} as any);

describe("permissões de atendente para clientes e relatórios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalRole.mockResolvedValue({ localRole: "attendant", active: true });
    mocks.getRolePermissions.mockResolvedValue(DEFAULT_ROLE_PERMISSIONS);
    mocks.getReportSummary.mockResolvedValue({ sales: [], receipts: [] });
    mocks.listCustomers.mockResolvedValue([{ id: 23, name: "Cliente" }]);
    mocks.saveCustomer.mockResolvedValue({ id: 24, success: true });
    mocks.deleteCustomer.mockResolvedValue({ success: true });
    mocks.adjustTabValue.mockResolvedValue({ success: true });
    mocks.listStockMovements.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
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


  it("bloqueia chamadas da API quando a funcionalidade foi removida do perfil", async () => {
    mocks.getRolePermissions.mockResolvedValue({ ...DEFAULT_ROLE_PERMISSIONS, attendant: [] });
    await expect(caller.customers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });

  it("só permite alterar o total da comanda quando a permissão específica está concedida", async () => {
    const input = { tabId: 12, newTotalCents: 5500, reason: "Ajuste autorizado" };
    await expect(caller.lounge.adjustTabValue(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.adjustTabValue).not.toHaveBeenCalled();

    mocks.getRolePermissions.mockResolvedValue({
      ...DEFAULT_ROLE_PERMISSIONS,
      attendant: [...DEFAULT_ROLE_PERMISSIONS.attendant, "adjustTabValue"],
    });
    await expect(caller.lounge.adjustTabValue(input)).resolves.toEqual({ success: true });
    expect(mocks.adjustTabValue).toHaveBeenCalledWith(input, 52);
  });

  it("consulta páginas de movimentações filtradas pelo período e pelo produto", async () => {
    const from = new Date("2026-10-12T03:00:00.000Z");
    const to = new Date("2026-10-13T02:59:59.999Z");
    const resultPage = { items: [{ id: 26 }], total: 31, page: 2, pageSize: 25, totalPages: 2 };
    mocks.getRolePermissions.mockResolvedValue({
      ...DEFAULT_ROLE_PERMISSIONS,
      attendant: [...DEFAULT_ROLE_PERMISSIONS.attendant, "stock"],
    });
    mocks.listStockMovements.mockResolvedValue(resultPage);
    await expect(caller.inventory.movements({ from, to, productId: 9, page: 2 })).resolves.toEqual(resultPage);
    expect(mocks.listStockMovements).toHaveBeenCalledWith({ from, to, productId: 9, page: 2 });
  });

  it("permite desativar um cliente pela operação de cliente", async () => {
    const result = await caller.customers.delete({ customerId: 23 });
    expect(result).toEqual({ success: true });
    expect(mocks.deleteCustomer).toHaveBeenCalledWith(23, 52);
  });
});
