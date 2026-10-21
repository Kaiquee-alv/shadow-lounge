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
  listExpenses: vi.fn(),
  getCurrentCashSession: vi.fn(),
  getCashSessionStatus: vi.fn(),
  listCashSessions: vi.fn(),
  getCashSessionDetails: vi.fn(),
  openCashSession: vi.fn(),
  addCashMovement: vi.fn(),
  closeCashSession: vi.fn(),
  registerPayment: vi.fn(),
  openTab: vi.fn(),
  addTabItem: vi.fn(),
  setTabItemQuantity: vi.fn(),
  setTabCharges: vi.fn(),
  syncOfflineTab: vi.fn(),
  createExpense: vi.fn(),
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
    listExpenses: mocks.listExpenses,
    getCurrentCashSession: mocks.getCurrentCashSession,
    getCashSessionStatus: mocks.getCashSessionStatus,
    listCashSessions: mocks.listCashSessions,
    getCashSessionDetails: mocks.getCashSessionDetails,
    openCashSession: mocks.openCashSession,
    addCashMovement: mocks.addCashMovement,
    closeCashSession: mocks.closeCashSession,
    registerPayment: mocks.registerPayment,
    openTab: mocks.openTab,
    addTabItem: mocks.addTabItem,
    setTabItemQuantity: mocks.setTabItemQuantity,
    setTabCharges: mocks.setTabCharges,
    syncOfflineTab: mocks.syncOfflineTab,
    createExpense: mocks.createExpense,
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
    mocks.getReportSummary.mockResolvedValue({ sales: [] });
    mocks.listCustomers.mockResolvedValue([{ id: 23, name: "Cliente" }]);
    mocks.saveCustomer.mockResolvedValue({ id: 24, success: true });
    mocks.deleteCustomer.mockResolvedValue({ success: true });
    mocks.adjustTabValue.mockResolvedValue({ success: true });
    mocks.listStockMovements.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    mocks.listExpenses.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    mocks.getCurrentCashSession.mockResolvedValue(null);
    mocks.getCashSessionStatus.mockResolvedValue({ open: true });
    mocks.listCashSessions.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    mocks.getCashSessionDetails.mockResolvedValue({ id: 15 });
    mocks.openCashSession.mockResolvedValue({ id: 15 });
    mocks.addCashMovement.mockResolvedValue({ id: 16 });
    mocks.closeCashSession.mockResolvedValue({ id: 15, differenceCents: 0 });
    mocks.registerPayment.mockResolvedValue({ paymentId: 42, duplicate: false });
    mocks.openTab.mockResolvedValue({ id: 41, tabCode: "#000041", tipPercent: 0 });
    mocks.addTabItem.mockResolvedValue({ id: 42 });
    mocks.setTabItemQuantity.mockResolvedValue({ success: true });
    mocks.setTabCharges.mockResolvedValue({ success: true });
    mocks.syncOfflineTab.mockResolvedValue({ tabId: 43, tabCode: "#000043", duplicate: false });
    mocks.createExpense.mockResolvedValue({ id: 44 });
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
    expect(result).toEqual({ sales: [] });
    expect(result).not.toHaveProperty("receipts");
    expect(mocks.getReportSummary).toHaveBeenCalledWith(undefined, undefined, false);
  });


  it("bloqueia chamadas da API quando a funcionalidade foi removida do perfil", async () => {
    mocks.getRolePermissions.mockResolvedValue({ ...DEFAULT_ROLE_PERMISSIONS, attendant: [] });
    await expect(caller.customers.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });

  it("exige a permissão Caixa para criar uma despesa em dinheiro pelo Financeiro", async () => {
    mocks.getRolePermissions.mockResolvedValue({
      ...DEFAULT_ROLE_PERMISSIONS,
      attendant: [...DEFAULT_ROLE_PERMISSIONS.attendant.filter((feature) => feature !== "cash"), "finance"],
    });
    const expense = { description: "Compra de gelo", category: "Fornecedores", amountCents: 1800, method: "cash" as const, occurredAt: new Date("2026-10-18T18:00:00.000Z") };
    await expect(caller.finance.createExpense(expense)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.createExpense).not.toHaveBeenCalled();
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

  it("carrega resumo e despesas detalhadas somente com acesso Financeiro", async () => {
    const from = new Date("2026-10-01T03:00:00.000Z");
    const to = new Date("2026-10-13T02:59:59.999Z");
    const summary = { salesCents: 15000, receivedCents: 12500, outstandingCents: 2300, tipCents: 500, costCents: 4000, expensesCents: 2100, resultCents: 8400, paymentMethods: [{ method: "pix", totalCents: 12500, count: 2 }], expenseCategories: [{ category: "Fornecedores", totalCents: 2100 }], receipts: [{ tabId: 8, amountCents: 12500 }], sales: [{ id: 1 }], products: [{ productName: "Água" }] };
    const financeSummary = { receivedCents: summary.receivedCents, outstandingCents: summary.outstandingCents, costCents: summary.costCents, expensesCents: summary.expensesCents, resultCents: summary.resultCents, paymentMethods: summary.paymentMethods, expenseCategories: summary.expenseCategories, receipts: summary.receipts };
    const expenses = { items: [{ id: 4, amountCents: 2100 }], total: 1, page: 1, pageSize: 25, totalPages: 1 };
    await expect(caller.finance.summary({ from, to })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getReportSummary).not.toHaveBeenCalled();
    mocks.getRolePermissions.mockResolvedValue({
      ...DEFAULT_ROLE_PERMISSIONS,
      attendant: [...DEFAULT_ROLE_PERMISSIONS.attendant, "finance"],
    });
    mocks.getReportSummary.mockResolvedValue(summary);
    mocks.listExpenses.mockResolvedValue(expenses);
    const financeResult = await caller.finance.summary({ from, to });
    expect(financeResult).toEqual(financeSummary);
    expect(financeResult).not.toHaveProperty("sales");
    expect(financeResult).not.toHaveProperty("products");
    expect(financeResult).not.toHaveProperty("salesCents");
    expect(financeResult).not.toHaveProperty("tipCents");
    await expect(caller.finance.expenses({ from, to, page: 1 })).resolves.toEqual(expenses);
    expect(mocks.getReportSummary).toHaveBeenCalledWith(from, to, true);
    expect(mocks.listExpenses).toHaveBeenCalledWith({ from, to, page: 1 });
  });

  it("permite desativar um cliente pela operação de cliente", async () => {
    const result = await caller.customers.delete({ customerId: 23 });
    expect(result).toEqual({ success: true });
    expect(mocks.deleteCustomer).toHaveBeenCalledWith(23, 52);
  });

  it("permite consultar e operar o caixa quando o perfil recebeu essa funcionalidade", async () => {
    const move = { kind: "supply" as const, amountCents: 2500, description: "Reforço de troco" };
    const close = { sessionId: 15, countedCashCents: 12_500, note: "Conferido" };
    const payment = { tabId: 20, amountCents: 1000, method: "cash" as const, requestKey: "payment-key-123" };
    const offlineSync = {
      offlineKey: "offline-key-123",
      deviceId: "device-123",
      tableId: 2,
      tipPercent: 0 as const,
      items: [],
      payments: [{ amountCents: 500, method: "cash" as const, requestKey: "offline-payment-123" }],
    };
    mocks.listCashSessions.mockResolvedValueOnce({ items: [], total: 40, page: 2, pageSize: 20, totalPages: 2 });
    await expect(caller.cash.current()).resolves.toBeNull();
    await expect(caller.cash.history({ page: 2 })).resolves.toEqual({ items: [], total: 40, page: 2, pageSize: 20, totalPages: 2 });
    await expect(caller.cash.details({ sessionId: 15 })).resolves.toEqual({ id: 15 });
    await expect(caller.cash.open({ openingFloatCents: 10_000 })).resolves.toEqual({ id: 15 });
    await expect(caller.cash.addMovement(move)).resolves.toEqual({ id: 16 });
    await expect(caller.cash.close(close)).resolves.toEqual({ id: 15, differenceCents: 0 });
    expect(mocks.openCashSession).toHaveBeenCalledWith(10_000, 52);
    expect(mocks.addCashMovement).toHaveBeenCalledWith(move, 52);
    expect(mocks.closeCashSession).toHaveBeenCalledWith(close, 52);
    const expense = { description: "Compra de gelo", category: "Fornecedores", amountCents: 1800, notes: "Reposição" };
    await expect(caller.cash.addExpense(expense)).resolves.toEqual({ id: 44 });
    expect(mocks.createExpense).toHaveBeenCalledWith({ ...expense, method: "cash", occurredAt: expect.any(Date) }, 52);
    await expect(caller.lounge.pay(payment)).resolves.toEqual({ paymentId: 42, duplicate: false });
    await expect(caller.lounge.syncOfflineTab(offlineSync)).resolves.toEqual({ tabId: 43, tabCode: "#000043", duplicate: false });
    expect(mocks.registerPayment).toHaveBeenCalledWith(payment, 52);
    expect(mocks.syncOfflineTab).toHaveBeenCalledWith(offlineSync, 52);
  });

  it("permite abrir uma comanda vazia com o caixa fechado e bloqueia operações que alteram valores", async () => {
    mocks.getCashSessionStatus.mockResolvedValue({ open: false });
    mocks.registerPayment.mockImplementation(async (input: any) => {
      if (input.requestKey === "payment-already-committed-123") return { paymentId: 42, duplicate: true };
      const status = await mocks.getCashSessionStatus();
      if (!status.open) throw new Error("Abra o caixa antes de realizar operações financeiras");
      return { paymentId: 42, duplicate: false };
    });
    mocks.syncOfflineTab.mockImplementation(async (input: any) => {
      if (input.offlineKey === "offline-already-synced-123") return { tabId: 43, tabCode: "#000043", duplicate: true };
      const status = await mocks.getCashSessionStatus();
      if (!status.open && (input.items.length > 0 || input.payments.length > 0 || input.tipPercent === 10)) {
        throw new Error("Abra o caixa antes de realizar operações financeiras");
      }
      return { tabId: 43, tabCode: "#000043", duplicate: false };
    });
    await expect(caller.lounge.cashStatus()).resolves.toEqual({ open: false });
    await expect(caller.lounge.openTab({ tableId: 2 })).resolves.toEqual({ id: 41, tabCode: "#000041", tipPercent: 0 });

    const operationError = { code: "PRECONDITION_FAILED" };
    await expect(caller.lounge.addItem({ tabId: 41, productId: 3, quantity: 1 })).rejects.toMatchObject(operationError);
    await expect(caller.lounge.setItemQuantity({ itemId: 9, quantity: 2 })).rejects.toMatchObject(operationError);
    await expect(caller.lounge.setCharges({ tabId: 41, tipPercent: 10 })).rejects.toMatchObject(operationError);
    await expect(caller.lounge.pay({ tabId: 41, amountCents: 1000, method: "pix", requestKey: "payment-key-123" })).rejects.toMatchObject(operationError);
    await expect(caller.lounge.pay({ tabId: 41, amountCents: 1000, method: "pix", requestKey: "payment-already-committed-123" })).resolves.toMatchObject({ duplicate: true });
    await expect(caller.lounge.syncOfflineTab({
      offlineKey: "offline-key-123", deviceId: "device-123", tableId: 2, tipPercent: 0,
      items: [{ productId: 3, productName: "Água", quantity: 1 }],
      payments: [],
    })).rejects.toMatchObject(operationError);
    const emptyOfflineTab = { offlineKey: "offline-empty-123", deviceId: "device-123", tableId: 4, tipPercent: 0 as const, items: [], payments: [] };
    await expect(caller.lounge.syncOfflineTab(emptyOfflineTab)).resolves.toEqual({ tabId: 43, tabCode: "#000043", duplicate: false });
    expect(mocks.syncOfflineTab).toHaveBeenCalledWith(emptyOfflineTab, 52);
    const emptyTabWithTip = { ...emptyOfflineTab, offlineKey: "offline-tip-123", tipPercent: 10 as const };
    await expect(caller.lounge.syncOfflineTab(emptyTabWithTip)).rejects.toMatchObject(operationError);
    const offlinePayment = { offlineKey: "offline-payment-123", deviceId: "device-123", tableId: 3, tipPercent: 0 as const, items: [], payments: [{ amountCents: 500, method: "cash" as const, requestKey: "offline-pay-key-123" }] };
    await expect(caller.lounge.syncOfflineTab(offlinePayment)).rejects.toMatchObject(operationError);
    const previouslyCommitted = { offlineKey: "offline-already-synced-123", deviceId: "device-123", tableId: 2, tipPercent: 0 as const, items: [{ productId: 3, productName: "Água", quantity: 1 }], payments: [] };
    await expect(caller.lounge.syncOfflineTab(previouslyCommitted)).resolves.toMatchObject({ duplicate: true });
    mocks.getRolePermissions.mockResolvedValue({ ...DEFAULT_ROLE_PERMISSIONS, attendant: [...DEFAULT_ROLE_PERMISSIONS.attendant, "adjustTabValue", "finance"] });
    await expect(caller.lounge.adjustTabValue({ tabId: 41, newTotalCents: 1000, reason: "Correção autorizada" })).rejects.toMatchObject(operationError);
    await expect(caller.finance.createExpense({
      description: "Compra de gelo", category: "Fornecedores", amountCents: 1800, method: "pix", occurredAt: new Date("2026-10-18T18:00:00Z"),
    })).rejects.toMatchObject(operationError);
    await expect(caller.cash.addMovement({ kind: "supply", amountCents: 500, description: "Reforço" })).rejects.toMatchObject(operationError);
    await expect(caller.cash.addExpense({ description: "Gelo", category: "Fornecedores", amountCents: 500 })).rejects.toMatchObject(operationError);
    expect(mocks.openTab).toHaveBeenCalledOnce();
    expect(mocks.addTabItem).not.toHaveBeenCalled();
    expect(mocks.setTabItemQuantity).not.toHaveBeenCalled();
    expect(mocks.setTabCharges).not.toHaveBeenCalled();
    expect(mocks.registerPayment).toHaveBeenCalledTimes(2);
    expect(mocks.syncOfflineTab).toHaveBeenCalledTimes(5);
    expect(mocks.adjustTabValue).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
    expect(mocks.addCashMovement).not.toHaveBeenCalled();
  });

  it("bloqueia a API do caixa quando o administrador remove a funcionalidade do perfil", async () => {
    mocks.getRolePermissions.mockResolvedValue({
      ...DEFAULT_ROLE_PERMISSIONS,
      attendant: DEFAULT_ROLE_PERMISSIONS.attendant.filter((feature) => feature !== "cash"),
    });
    await expect(caller.cash.current()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.cash.open({ openingFloatCents: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.cash.addExpense({ description: "Compra de gelo", category: "Fornecedores", amountCents: 1800 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.lounge.pay({ tabId: 20, amountCents: 1000, method: "cash", requestKey: "payment-key-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.lounge.syncOfflineTab({
      offlineKey: "offline-key-123",
      deviceId: "device-123",
      tableId: 2,
      tipPercent: 0,
      items: [],
      payments: [{ amountCents: 500, method: "cash", requestKey: "offline-payment-123" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getCurrentCashSession).not.toHaveBeenCalled();
    expect(mocks.openCashSession).not.toHaveBeenCalled();
    expect(mocks.createExpense).not.toHaveBeenCalled();
    expect(mocks.registerPayment).not.toHaveBeenCalled();
    expect(mocks.syncOfflineTab).not.toHaveBeenCalled();
  });
});
