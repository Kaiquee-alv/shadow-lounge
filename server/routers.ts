import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import {
  addTabItem,
  adjustStock,
  closeTab,
  createExpense,
  ensureInitialData,
  getDashboard,
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
  registerPayment,
  saveProduct,
  setTabItemQuantity,
  setTabCharges,
  createProductCategory,
  updateUserAccess,
  createProductPriceRule,
  setProductPriceRuleActive,
  deleteProductPriceRule,
} from "./db.js";

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
      ctx.res.cookie("shadow_session", session.token, {
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
      ctx.res.cookie("shadow_session", session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12,
        path: "/",
      });
      return { success: true, expiresAt: session.expiresAt };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie("shadow_session", { path: "/" });
      return { success: true } as const;
    }),
  }),
  workspace: router({
    bootstrap: protectedProcedure.query(async ({ ctx }) => {
      await ensureInitialData();
      const profile = await operator(ctx);
      return { localRole: profile.localRole, name: ctx.user.name ?? "Operador" };
    }),
  }),
  lounge: router({
    dashboard: protectedProcedure.input(z.object({ rangeDays: z.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return getDashboard(input.rangeDays);
    }),
    tables: protectedProcedure.query(async ({ ctx }) => {
      await operator(ctx);
      return listTables();
    }),
    tab: protectedProcedure.input(z.object({ tabId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await operator(ctx);
      return getTabDetails(input.tabId);
    }),
    openTab: protectedProcedure.input(z.object({ tableId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return openTab(input.tableId, ctx.user.id);
    }),
    addItem: protectedProcedure.input(z.object({
      tabId: z.number().int().positive(), productId: z.number().int().positive(), quantity: z.number().int().min(1).max(99), note: z.string().max(500).optional(),
    })).mutation(async ({ ctx, input }) => {
      const profile = await operator(ctx);
      return addTabItem(input, ctx.user.id, profile.localRole);
    }),
    setItemQuantity: protectedProcedure.input(z.object({
      itemId: z.number().int().positive(), quantity: z.number().int().min(0).max(99), note: z.string().max(500).optional(),
    })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return setTabItemQuantity(input, ctx.user.id);
    }),
    pay: protectedProcedure.input(z.object({
      tabId: z.number().int().positive(), amountCents: z.number().int().positive(), method: paymentMethod, requestKey: z.string().min(8).max(80),
    })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return registerPayment(input, ctx.user.id);
    }),
    closeTab: protectedProcedure.input(z.object({ tabId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return closeTab(input.tabId, ctx.user.id);
    }),
    setCharges: protectedProcedure.input(z.object({ tabId: z.number().int().positive(), tipPercent: z.union([z.literal(0), z.literal(10)]) })).mutation(async ({ ctx, input }) => {
      await operator(ctx);
      return setTabCharges(input, ctx.user.id);
    }),
  }),
  inventory: router({
    categories: protectedProcedure.query(async ({ ctx }) => {
      await operator(ctx);
      return listCategories();
    }),
    createCategory: protectedProcedure.input(z.object({ name: z.string().min(2).max(100) })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createProductCategory(input.name, ctx.user.id);
    }),
    products: protectedProcedure.input(z.object({ query: z.string().max(160).optional() }).optional()).query(async ({ ctx, input }) => {
      await operator(ctx);
      return listProducts(input?.query);
    }),
    movements: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listStockMovements();
    }),
    saveProduct: protectedProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      name: z.string().min(2).max(160), code: z.string().min(2).max(64), categoryId: z.number().int().positive().optional(), unit: z.string().min(1).max(24),
      costCents: z.number().int().min(0), priceCents: z.number().int().min(0), stockQuantity: z.number().int().min(0), minimumStock: z.number().int().min(0), active: z.boolean(), notes: z.string().max(2000).optional(),
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return saveProduct(input, ctx.user.id);
    }),
    adjust: protectedProcedure.input(z.object({
      productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000), direction: z.enum(["in", "out"]), reason: z.string().min(2).max(120),
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return adjustStock(input, ctx.user.id);
    }),
  }),
  finance: router({
    expenses: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listExpenses();
    }),
    createExpense: protectedProcedure.input(z.object({
      description: z.string().min(2).max(240), category: z.string().min(2).max(100), amountCents: z.number().int().positive(), method: paymentMethod, notes: z.string().max(2000).optional(), occurredAt: z.date(),
    })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createExpense(input, ctx.user.id);
    }),
  }),
  audit: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator"]);
      return listAudit();
    }),
  }),
  commercial: router({
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
  }),
  productHistory: router({
    list: protectedProcedure.input(z.object({ productId: z.number().int().positive().optional(), from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ ctx, input }) => {
      await operator(ctx);
      return listProductHistory(input?.productId, input?.from, input?.to);
    }),
  }),
  pricing: router({
    rules: protectedProcedure.query(async ({ ctx }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return listProductPriceRules();
    }),
    createRule: protectedProcedure.input(z.object({ productId: z.number().int().positive(), name: z.string().min(2).max(140), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), priceCents: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return createProductPriceRule(input, ctx.user.id);
    }),
    setActive: protectedProcedure.input(z.object({ ruleId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return setProductPriceRuleActive(input.ruleId, input.active, ctx.user.id);
    }),
    deleteRule: protectedProcedure.input(z.object({ ruleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireRole(ctx, ["administrator", "manager"]);
      return deleteProductPriceRule(input.ruleId, ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
