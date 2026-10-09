import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { isValidCpf } from "@shared/cpf";
import { ACCESS_FEATURES, canAccessFeature, type AccessFeature } from "@shared/role-permissions";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import {
  addTabItem,
  adjustStock,
  adjustTabValue,
  closeTab,
  createExpense,
  ensureInitialData,
  getDashboard,
  getReportSummary,
  getLocalRole,
  getTabDetails,
  listProductHistory,
  listProductPriceRules,
  listUserAccess,
  registerLocally,
  listCategories,
  loginLocally,
  listAudit,
  listExpenses,
  listProducts,
  listStockMovements,
  listTables,
  openTab,
  syncOfflineTab,
  registerPayment,
  saveProduct,
  setTabItemQuantity,
  setTabCharges,
  setTabCustomerName,
  listCustomers,
  saveCustomer,
  deleteCustomer,
  assignTabCustomer,
  transferTab,
  createProductCategory,
  deleteProduct,
  setProductActive,
  updateUserAccess,
  createProductPriceRule,
  setProductPriceRuleActive,
  deleteProductPriceRule,
  updateProductPriceRule,
  createLocalUser,
  deleteLocalUser,
  getCommercialSettings,
  updateNegativeStockPolicy,
  updateCommercialSettings,
  updateTableLimit,
  getRolePermissions,
  updateRolePermissions,
} from "./db.js";
import { weekdaysToMask } from "./price-rule-utils.js";

const paymentMethod = z.enum(["pix", "cash", "debit", "credit", "other"]);
const localRole = z.enum(["administrator", "manager", "attendant"]);

async function operator(ctx: { user: NonNullable<Parameters<typeof protectedProcedure.query>[0]> extends never ? never : any }) {
  const profile = await getLocalRole(ctx.user.id, ctx.user.role);
  if (!profile.active) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário inativo" });
  return profile;
}

async function requireRole(ctx: any, accepted: Array<z.infer<typeof localRole>>) {
  const profile = await operator(ctx);
  if (!accepted.includes(profile.localRole)) throw new TRPCError({ code: "FORBIDDEN", message: "Esta ação exige permissão de gerente ou administrador" });
  return profile;
}

async function requireFeature(ctx: any, feature: AccessFeature) {
  const profile = await operator(ctx);
  if (profile.localRole === "administrator") return profile;
  const permissions = await getRolePermissions();
  if (!canAccessFeature(profile.localRole, permissions, feature)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não tem acesso a esta funcionalidade" });
  }
  return profile;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req as never);
      (ctx.res as any).clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  localAuth: router({
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/),
      password: z.string().min(12).max(128),
    })).mutation(async ({ ctx, input }) => {
      const session = await registerLocally(input);
      if (!session) throw new TRPCError({ code: "CONFLICT", message: "Este usuário já está cadastrado" });
      (ctx.res as any).cookie("shadow_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12,
        path: "/",
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    login: publicProcedure.input(z.object({ username: z.string().trim().toLowerCase().min(3).max(64), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const session = await loginLocally(input.username, input.password);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      (ctx.res as any).cookie("shadow_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12,
        path: "/",
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      (ctx.res as any).cookie("shadow_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        expires: new Date(0),
        maxAge: 0,
        path: "/",
      });
      return { success: true } as const;
    }),
  }),
  workspace: router({
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      await ensureInitialData();
      const profile = await operator(ctx);
      return { localRole: profile.localRole, name: ctx.user.name ?? "Operador", rolePermissions: await getRolePermissions() };
    }),
  }),
  lounge: router({
    dashboard: protectedProcedure.input(z.object({ rangeDays: z.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "dashboard");
      return getDashboard(input.rangeDays);
    }),
    tables: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "tables");
      return listTables();
    }),
    tab: protectedProcedure.input(z.object({ tabId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return getTabDetails(input.tabId);
    }),
    setCustomerName: protectedProcedure.input(z.object({ tabId: z.number().int().positive(), customerName: z.string().trim().max(120).nullable() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return setTabCustomerName(input.tabId, input.customerName, ctx.user.id);
    }),
    assignCustomer: protectedProcedure.input(z.object({ tabId: z.number().int().positive(), customerId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "customers");
      return assignTabCustomer(input.tabId, input.customerId, ctx.user.id);
    }),
    openTab: protectedProcedure.input(z.object({ tableId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return openTab(input.tableId, ctx.user.id, ctx.user.name ?? "Operador");
    }),
    syncOfflineTab: protectedProcedure.input(z.object({
      offlineKey: z.string().min(8).max(80),
      deviceId: z.string().min(3).max(120),
      tableId: z.number().int().positive(),
      customerName: z.string().trim().max(120).nullable().optional(),
      tipPercent: z.union([z.literal(0), z.literal(10)]),
      items: z.array(z.object({ productId: z.number().int().positive(), productName: z.string().max(160), quantity: z.number().int().min(1).max(99), note: z.string().max(500).nullable().optional(), createdAt: z.string().datetime().optional() })).max(100),
      payments: z.array(z.object({ amountCents: z.number().int().positive(), method: paymentMethod, requestKey: z.string().min(8).max(80) })).max(20),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return syncOfflineTab(input, ctx.user.id);
    }),
    transferTab: protectedProcedure.input(z.object({ tabId: z.number().int().positive(), destinationTableId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return transferTab(input.tabId, input.destinationTableId, ctx.user.id);
    }),
    addItem: protectedProcedure.input(z.object({
      tabId: z.number().int().positive(), productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99), note: z.string().max(500).optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return addTabItem(input, ctx.user.id, ctx.user.name ?? "Operador");
    }),
    setItemQuantity: protectedProcedure.input(z.object({
      itemId: z.number().int().positive(), quantity: z.number().int().min(0).max(99), note: z.string().max(500).optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return setTabItemQuantity(input, ctx.user.id);
    }),
    pay: protectedProcedure.input(z.object({
      tabId: z.number().int().positive(), amountCents: z.number().int().positive(), method: paymentMethod, requestKey: z.string().min(8).max(80),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return registerPayment(input, ctx.user.id);
    }),
    closeTab: protectedProcedure.input(z.object({ tabId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return closeTab(input.tabId, ctx.user.id);
    }),
    setCharges: protectedProcedure.input(z.object({ tabId: z.number().int().positive(), tipPercent: z.union([z.literal(0), z.literal(10)]) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return setTabCharges(input, ctx.user.id);
    }),
    adjustTabValue: protectedProcedure.input(z.object({
      tabId: z.number().int().positive(),
      newTotalCents: z.number().int().min(0).max(100_000_000),
      reason: z.string().trim().min(5).max(500),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "tables");
      return adjustTabValue(input, ctx.user.id);
    }),
  }),
  inventory: router({
    categories: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "products");
      return listCategories();
    }),
    createCategory: protectedProcedure.input(z.object({ name: z.string().min(2).max(100) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return createProductCategory(input.name, ctx.user.id);
    }),
    products: protectedProcedure.input(z.object({ query: z.string().max(160).optional() }).optional()).query(async ({ ctx, input }) => {
      const profile = await operator(ctx);
      if (profile.localRole !== "administrator") {
        const permissions = await getRolePermissions();
        if (!canAccessFeature(profile.localRole, permissions, "products") && !canAccessFeature(profile.localRole, permissions, "tables") && !canAccessFeature(profile.localRole, permissions, "stock")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não tem acesso aos produtos" });
      }
      return listProducts(input?.query);
    }),
    movements: protectedProcedure.input(z.object({ from: z.date().optional(), to: z.date().optional() }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual à data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "stock");
      return listStockMovements(input?.from, input?.to);
    }),
    saveProduct: protectedProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().min(2).max(160), code: z.string().min(2).max(64), categoryId: z.number().int().positive().optional(), unit: z.string().min(1).max(24),
      costCents: z.number().int().min(0), priceCents: z.number().int().min(0), stockQuantity: z.number().int().optional(), minimumStock: z.number().int().min(0), active: z.boolean(), notes: z.string().max(2000).optional(),
    }).superRefine((input, refinement) => {
      if (!input.id && input.stockQuantity !== undefined && input.stockQuantity < 0) {
        refinement.addIssue({ code: "custom", path: ["stockQuantity"], message: "O estoque inicial não pode ser negativo" });
      }
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return saveProduct(input, ctx.user.id);
    }),
    deleteProduct: protectedProcedure.input(z.object({ productId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return deleteProduct(input.productId, ctx.user.id);
    }),
    setProductActive: protectedProcedure.input(z.object({ productId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return setProductActive(input.productId, input.active, ctx.user.id);
    }),
    adjust: protectedProcedure.input(z.object({
      productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000), direction: z.enum(["in", "out"]), reason: z.string().min(2).max(120),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "stock");
      return adjustStock(input, ctx.user.id);
    }),
  }),
  finance: router({
    expenses: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "finance");
      return listExpenses();
    }),
    createExpense: protectedProcedure.input(z.object({
      description: z.string().min(2).max(240), category: z.string().min(2).max(100), amountCents: z.number().int().positive(), method: paymentMethod, notes: z.string().max(2000).optional(), occurredAt: z.date(),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "finance");
      return createExpense(input, ctx.user.id);
    }),
  }),
  audit: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return listAudit();
    }),
  }),
  access: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return listUserAccess();
    }),
    update: protectedProcedure.input(z.object({ userId: z.number().int().positive(), localRole, active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return updateUserAccess(input, ctx.user.id);
    }),
    updateRolePermissions: protectedProcedure.input(z.object({
      manager: z.array(z.enum(ACCESS_FEATURES.map(({ id }) => id) as [AccessFeature, ...AccessFeature[]])).max(ACCESS_FEATURES.length),
      attendant: z.array(z.enum(ACCESS_FEATURES.map(({ id }) => id) as [AccessFeature, ...AccessFeature[]])).max(ACCESS_FEATURES.length),
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return updateRolePermissions(input, ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/), password: z.string().min(12).max(128), localRole })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return createLocalUser(input, ctx.user.id);
    }),
    delete: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator"]);
      return deleteLocalUser(input.userId, ctx.user.id);
    }),
  }),
  productHistory: router({
    list: protectedProcedure.input(z.object({ productId: z.number().int().positive().optional(), from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "products");
      return listProductHistory(input?.productId, input?.from, input?.to);
    }),
  }),
  reports: router({
    summary: protectedProcedure.input(z.object({ from: z.date().optional(), to: z.date().optional() }).refine(({ from, to }) => !from || !to || from <= to, { message: "A data inicial deve ser anterior ou igual à data final" }).optional()).query(async ({ ctx, input }) => {
      await requireFeature(ctx, "reports");
      return getReportSummary(input?.from, input?.to);
    }),
  }),
  pricing: router({
    rules: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "settings");
      return listProductPriceRules();
    }),
    createRule: protectedProcedure.input(z.object({ productId: z.number().int().positive(), name: z.string().min(2).max(140), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, { message: "Remova dias repetidos" }), weekdaysMask: z.number().int().min(1).max(127), priceCents: z.number().int().positive() }).refine((input) => weekdaysToMask(input.daysOfWeek) === input.weekdaysMask, { message: "Os dias selecionados não correspondem à regra" })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return createProductPriceRule(input, ctx.user.id);
    }),
    updateRule: protectedProcedure.input(z.object({ ruleId: z.number().int().positive(), productId: z.number().int().positive(), name: z.string().trim().min(2).max(140), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length, { message: "Remova dias repetidos" }), weekdaysMask: z.number().int().min(1).max(127), priceCents: z.number().int().positive() }).refine((input) => weekdaysToMask(input.daysOfWeek) === input.weekdaysMask, { message: "Os dias selecionados não correspondem à regra" })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateProductPriceRule(input, ctx.user.id);
    }),
    setActive: protectedProcedure.input(z.object({ ruleId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return setProductPriceRuleActive(input.ruleId, input.active, ctx.user.id);
    }),
    deleteRule: protectedProcedure.input(z.object({ ruleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return deleteProductPriceRule(input.ruleId, ctx.user.id);
    }),
  }),
  commercial: router({
    updateNegativeStockPolicy: protectedProcedure.input(z.object({ preventNegativeStock: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateNegativeStockPolicy(input.preventNegativeStock, ctx.user.id);
    }),
    updateTableLimit: protectedProcedure.input(z.object({ maxTables: z.number().int().min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateTableLimit(input.maxTables, ctx.user.id);
    }),
    settings: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx, "settings");
      return getCommercialSettings();
    }),
    updateSettings: protectedProcedure.input(z.object({
      happyHourEnabled: z.boolean(),
      happyHourStart: z.string().regex(/^\d{2}:\d{2}$/),
      happyHourEnd: z.string().regex(/^\d{2}:\d{2}$/),
      happyHourDiscountPercent: z.number().int().min(0).max(100),
    })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx, "settings");
      return updateCommercialSettings(input, ctx.user.id);
    }),
  }),
  customers: router({
    list: protectedProcedure.query(async ({ ctx }) => { await requireFeature(ctx, "customers"); return listCustomers(); }),
    save: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(2).max(160), cpf: z.string().min(11).max(18).refine(isValidCpf, "CPF inválido. Confira os 11 dígitos e tente novamente."), phone: z.string().max(30).optional(), notes: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => { await requireFeature(ctx, "customers"); return saveCustomer(input, ctx.user.id); }),
    delete: protectedProcedure.input(z.object({ customerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { await requireFeature(ctx, "customers"); return deleteCustomer(input.customerId, ctx.user.id); }),
  }),
});

export type AppRouter = typeof appRouter;
