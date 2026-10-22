import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import CashPage from "@/pages/CashPage";
import { formatCpf, isValidCpf, normalizeCpf } from "@shared/cpf";
import { auditActionLabel, auditDescriptionInPortuguese } from "@shared/audit-labels";
import { ACCESS_FEATURES, canAccessFeature, DEFAULT_ROLE_PERMISSIONS, type AccessFeature, type RolePermissions } from "@shared/role-permissions";
import { addDaysToSaoPauloDateKey, firstOfMonthInSaoPaulo, formatDateTimeInSaoPaulo, formatTimeInSaoPaulo, saoPauloDateKey, saoPauloDayEnd, saoPauloDayStart } from "@shared/sao-paulo-time";
import { cached, createOfflineTab, getOfflineTabById, getOfflineTabByTable, getOfflineTabs, isOffline, offlineTabView, offlineTotals, removeOfflineTab, saveOfflineTab } from "@/lib/offline";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ArrowRightLeft, BarChart3, Banknote, Beer, ChevronLeft, Download, LoaderCircle, Printer,
  ClipboardList, Clock3, CreditCard, FileText, Flame, LayoutDashboard, LogIn, Menu,
  Package, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Table2, Pencil, Trash2,
  TrendingUp, Users, WalletCards, Zap, Eye, EyeOff,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Page = "dashboard" | "tables" | "customers" | "products" | "stock" | "cash" | "finance" | "reports" | "users" | "settings";
type Method = "pix" | "cash" | "debit" | "credit" | "other";
type PendingOnlinePayment = { tabId: number; amountCents: number; method: Method; requestKey: string };
const PENDING_ONLINE_PAYMENT_KEY = "shadow-lounge.pending-online-payment.v1";
function readPendingOnlinePayment(): PendingOnlinePayment | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_ONLINE_PAYMENT_KEY) ?? "null");
    if (!value || !Number.isInteger(value.tabId) || !Number.isInteger(value.amountCents) || typeof value.requestKey !== "string") return null;
    if (!["pix", "cash", "debit", "credit", "other"].includes(value.method)) return null;
    return value as PendingOnlinePayment;
  } catch { return null; }
}
function savePendingOnlinePayment(value: PendingOnlinePayment) {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(PENDING_ONLINE_PAYMENT_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}
function clearPendingOnlinePayment(requestKey: string) {
  if (typeof window === "undefined") return;
  try {
    const pending = readPendingOnlinePayment();
    if (pending?.requestKey === requestKey) window.localStorage.removeItem(PENDING_ONLINE_PAYMENT_KEY);
  } catch { /* Mantém a tela utilizável mesmo se o navegador bloquear o storage. */ }
}

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dateTime = formatDateTimeInSaoPaulo;
const dateInputValue = (value: Date) => saoPauloDateKey(value);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
const methodLabel: Record<Method, string> = { pix: "PIX", cash: "Dinheiro", debit: "Débito", credit: "Crédito", other: "Outros" };
const expensesCategories = ["Fornecedores", "Aluguel", "Energia", "Água", "Internet", "Funcionários", "Manutenção", "Marketing", "Outros"];
const weekdayOptions = [
  { value: 1, label: "Seg", name: "segunda-feira" }, { value: 2, label: "Ter", name: "terça-feira" },
  { value: 3, label: "Qua", name: "quarta-feira" }, { value: 4, label: "Qui", name: "quinta-feira" },
  { value: 5, label: "Sex", name: "sexta-feira" }, { value: 6, label: "Sáb", name: "sábado" },
  { value: 0, label: "Dom", name: "domingo" },
];
const weekdayValuesFromRule = (rule: any): number[] => {
  if (Number.isInteger(rule?.weekdaysMask) && rule.weekdaysMask >= 1 && rule.weekdaysMask <= 127) {
    return weekdayOptions.filter((day) => (rule.weekdaysMask & (1 << day.value)) !== 0).map((day) => day.value);
  }
  if (Array.isArray(rule?.daysOfWeek)) return Array.from(new Set(rule.daysOfWeek.filter((day: unknown): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)));
  return [];
};
const formatWeekdays = (days: number[]) => {
  const selected = Array.from(new Set(days));
  if (selected.length === 7) return "Todos os dias";
  if (!selected.length) return "Dias não definidos";
  return weekdayOptions.filter((day) => selected.includes(day.value)).map((day) => day.name).join(", ");
};

const demoTables = Array.from({ length: 20 }, (_, index) => {
  const number = index + 1;
  if (number === 3) return { id: number, number, status: "occupied", tabId: 103, tabCode: "#000154", totalCents: 8400, paidCents: 2000, balanceCents: 6400, openedAt: new Date(Date.now() - 108 * 60 * 1000) };
  if (number === 7) return { id: number, number, status: "partial", tabId: 107, tabCode: "#000155", totalCents: 27000, paidCents: 10000, balanceCents: 17000, openedAt: new Date(Date.now() - 64 * 60 * 1000) };
  if (number === 12) return { id: number, number, status: "occupied", tabId: 112, tabCode: "#000156", totalCents: 11900, paidCents: 0, balanceCents: 11900, openedAt: new Date(Date.now() - 26 * 60 * 1000) };
  return { id: number, number, status: "free", tabId: null, tabCode: null, totalCents: 0, paidCents: 0, balanceCents: 0, openedAt: null };
});

const demoProducts = [
  { id: 1, name: "Heineken Long Neck", code: "HEI-330", categoryName: "Cervejas", priceCents: 1500, costCents: 850, stockQuantity: 48, minimumStock: 12, active: true },
  { id: 2, name: "Budweiser Long Neck", code: "BUD-330", categoryName: "Cervejas", priceCents: 1200, costCents: 650, stockQuantity: 36, minimumStock: 10, active: true },
  { id: 3, name: "Red Bull", code: "RED-250", categoryName: "Energéticos", priceCents: 1800, costCents: 900, stockQuantity: 17, minimumStock: 12, active: true },
  { id: 4, name: "Coca-Cola Lata", code: "COCA-350", categoryName: "Refrigerantes", priceCents: 700, costCents: 380, stockQuantity: 62, minimumStock: 15, active: true },
  { id: 5, name: "Narguilé Premium", code: "NARG-PRM", categoryName: "Narguilé", priceCents: 4500, costCents: 1100, stockQuantity: 20, minimumStock: 4, active: true },
  { id: 6, name: "Essência Mint Ice", code: "ESS-MINT", categoryName: "Essências", priceCents: 2200, costCents: 900, stockQuantity: 8, minimumStock: 10, active: true },
  { id: 7, name: "Carvão Cúbico", code: "CARV-1", categoryName: "Carvões", priceCents: 1200, costCents: 450, stockQuantity: 28, minimumStock: 8, active: true },
  { id: 8, name: "Porção da Casa", code: "PET-001", categoryName: "Petiscos", priceCents: 3900, costCents: 1500, stockQuantity: 14, minimumStock: 5, active: true },
];

const demoDashboard = {
  paidCents: 153840, expensesCents: 28450, costCents: 47200, resultCents: 78190, salesCount: 46, openTabs: 3, pendingCents: 23400, averageTicketCents: 3344, lowStock: 1,
  paymentMethods: [{ method: "pix", totalCents: 69500 }, { method: "cash", totalCents: 38100 }, { method: "debit", totalCents: 20940 }, { method: "credit", totalCents: 25300 }, { method: "other", totalCents: 0 }],
  topProducts: [{ name: "Heineken Long Neck", quantity: 37, totalCents: 55500 }, { name: "Narguilé Premium", quantity: 18, totalCents: 81000 }, { name: "Red Bull", quantity: 22, totalCents: 39600 }, { name: "Porção da Casa", quantity: 11, totalCents: 42900 }],
};

const demoTab = {
  id: 103, tabCode: "#000154", status: "open", tableNumber: 3, openedAt: new Date(Date.now() - 108 * 60 * 1000), openedByName: "Marina Costa", totalCents: 8400, paidCents: 2000, balanceCents: 6400,
  items: [
    { id: 1, productId: 1, productName: "Heineken Long Neck", quantity: 2, unitPriceCents: 1500, unitCostCents: 850, note: null, createdAt: new Date() },
    { id: 2, productId: 5, productName: "Narguilé Premium", quantity: 1, unitPriceCents: 4500, unitCostCents: 1100, note: "Menta + gelo", createdAt: new Date() },
    { id: 3, productId: 4, productName: "Coca-Cola Lata", quantity: 2, unitPriceCents: 700, unitCostCents: 380, note: null, createdAt: new Date() },
  ],
  payments: [{ id: 1, amountCents: 2000, method: "pix" as Method, createdAt: new Date(Date.now() - 30 * 60 * 1000), receivedByName: "Marina Costa" }],
};

const nav = [
  { id: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard },
  { id: "tables" as Page, label: "Mesas", icon: Table2 },
  { id: "customers" as Page, label: "Clientes", icon: Users },
  { id: "products" as Page, label: "Produtos", icon: Beer },
  { id: "stock" as Page, label: "Estoque", icon: Package },
  { id: "cash" as Page, label: "Caixa", icon: Banknote },
  { id: "finance" as Page, label: "Financeiro", icon: WalletCards },
  { id: "reports" as Page, label: "Relatórios", icon: BarChart3 },
  { id: "users" as Page, label: "Usuários", icon: Users },
];

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [page, setPage] = useState<Page>("tables");
  const [loginOpen, setLoginOpen] = useState(false);
  const [credentials, setCredentials] = useState({ name: "", username: "", password: "" });
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDestination, setTransferDestination] = useState<number | null>(null);
  const [customerNameOpen, setCustomerNameOpen] = useState(false);
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", cpf: "", phone: "", notes: "" });
  const [noteOpen, setNoteOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [baristaPrintOrder, setBaristaPrintOrder] = useState<any>(null);
  const [itemNote, setItemNote] = useState("");
  const [launchQuantity, setLaunchQuantity] = useState("1");
  const [productSearch, setProductSearch] = useState("");
  const [tipEnabled, setTipEnabled] = useState(true);
  const [historyFrom, setHistoryFrom] = useState(() => firstOfMonthInSaoPaulo(new Date()));
  const [historyTo, setHistoryTo] = useState(() => saoPauloDateKey(new Date()));
  const [financePeriod, setFinancePeriod] = useState<"today" | "7days" | "month" | "custom">("month");
  const [financeFrom, setFinanceFrom] = useState(() => firstOfMonthInSaoPaulo(new Date()));
  const [financeTo, setFinanceTo] = useState(() => saoPauloDateKey(new Date()));
  const [financeExpensesPage, setFinanceExpensesPage] = useState(1);
  const [stockMovementPeriod, setStockMovementPeriod] = useState<"2" | "3" | "7" | "30" | "90" | "all" | "custom">("2");
  const [stockMovementProduct, setStockMovementProduct] = useState("all");
  const [stockMovementsPage, setStockMovementsPage] = useState(1);
  const [stockMovementFrom, setStockMovementFrom] = useState(() => addDaysToSaoPauloDateKey(saoPauloDateKey(new Date()), -1));
  const [stockMovementTo, setStockMovementTo] = useState(() => saoPauloDateKey(new Date()));
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Method>(() => readPendingOnlinePayment()?.method ?? "pix");
  const [paymentValue, setPaymentValue] = useState(() => { const pending = readPendingOnlinePayment(); return pending ? (pending.amountCents / 100).toFixed(2) : ""; });
  const [launchingProductIds, setLaunchingProductIds] = useState<Set<number>>(() => new Set());
  const [updatingItemId, setUpdatingItemId] = useState<number | null>(null);
  const [stockSheet, setStockSheet] = useState(false);
  const [stockProduct, setStockProduct] = useState<any>(null);
  const [stockQty, setStockQty] = useState("1");
  const [stockDirection, setStockDirection] = useState<"in" | "out">("in");
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [newProduct, setNewProduct] = useState({ name: "", code: "", categoryId: 1, unit: "un", cost: "", price: "", stock: "", minimum: "" });
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expense, setExpense] = useState({ description: "", category: "Fornecedores", amount: "", method: "pix" as Method, notes: "" });
  const [connectionOnline, setConnectionOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [offlineTabs, setOfflineTabs] = useState(() => getOfflineTabs());
  const [offlineSyncBlocked, setOfflineSyncBlocked] = useState(false);
  const [offlineSyncWaitingForCash, setOfflineSyncWaitingForCash] = useState(false);
  const [offlineCashWaitDataUpdatedAt, setOfflineCashWaitDataUpdatedAt] = useState<number | null>(null);
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [userCreateOpen, setUserCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", username: "", password: "", localRole: "attendant" as "administrator" | "manager" | "attendant" });
  const [printerPairing, setPrinterPairing] = useState<{ pairingCode: string; expiresAt: Date | string } | null>(null);
  const utils = trpc.useUtils();

  const dashboardQuery = trpc.lounge.dashboard.useQuery({ rangeDays: 30 }, { enabled: isAuthenticated && page === "dashboard", retry: false, staleTime: 30000 });
  const tablesQuery = trpc.lounge.tables.useQuery(undefined, { enabled: isAuthenticated && (page === "tables" || page === "dashboard"), retry: false, staleTime: 5000, refetchInterval: isAuthenticated && page === "tables" && !selectedTabId ? 10000 : false });
  const cashStatusQuery = trpc.lounge.cashStatus.useQuery(undefined, { enabled: isAuthenticated && (page === "tables" || page === "finance" || offlineTabs.length > 0), retry: false, staleTime: 3000, refetchInterval: isAuthenticated && (page === "tables" || page === "finance" || offlineTabs.length > 0) ? 7000 : false });
  const cashIsOpen = cashStatusQuery.data?.open === true;
  const productsQuery = trpc.inventory.products.useQuery({}, { enabled: isAuthenticated && (page === "tables" || page === "products" || page === "stock"), retry: false, staleTime: 15000 });
  const stockMovementsInput = useMemo(() => {
    if (stockMovementPeriod === "all") return {};
    const toKey = stockMovementPeriod === "custom" ? stockMovementTo : saoPauloDateKey(new Date());
    const fromKey = stockMovementPeriod === "custom"
      ? stockMovementFrom
      : addDaysToSaoPauloDateKey(toKey, -(Number(stockMovementPeriod) - 1));
    if (!fromKey || !toKey || fromKey > toKey) return null;
    return { from: saoPauloDayStart(fromKey), to: saoPauloDayEnd(toKey) };
  }, [stockMovementPeriod, stockMovementFrom, stockMovementTo]);
  const stockMovementsQueryInput = useMemo(() => stockMovementsInput === null ? undefined : ({
    ...stockMovementsInput,
    page: stockMovementsPage,
    ...(stockMovementProduct === "all" ? {} : { productId: Number(stockMovementProduct) }),
  }), [stockMovementsInput, stockMovementsPage, stockMovementProduct]);
  const stockMovementsQuery = trpc.inventory.movements.useQuery(stockMovementsQueryInput, { enabled: isAuthenticated && page === "stock" && stockMovementsInput !== null, retry: false });
  const categoriesQuery = trpc.inventory.categories.useQuery(undefined, { enabled: isAuthenticated && (productOpen || page === "products"), retry: false });
  const commercialSettingsQuery = trpc.commercial.settings.useQuery(undefined, { enabled: isAuthenticated && page === "settings", retry: false });
  const customersQuery = trpc.customers.list.useQuery(undefined, { enabled: isAuthenticated && page === "customers", retry: false, staleTime: 60000 });
  const financeRangeInput = useMemo(() => {
    const today = saoPauloDateKey(new Date());
    const toKey = financePeriod === "custom" ? financeTo : today;
    const fromKey = financePeriod === "custom" ? financeFrom : financePeriod === "today" ? today : financePeriod === "7days" ? addDaysToSaoPauloDateKey(today, -6) : firstOfMonthInSaoPaulo(new Date());
    if (!fromKey || !toKey || fromKey > toKey) return null;
    return { from: saoPauloDayStart(fromKey), to: saoPauloDayEnd(toKey) };
  }, [financePeriod, financeFrom, financeTo]);
  const financeSummaryQuery = trpc.finance.summary.useQuery(financeRangeInput ?? undefined, { enabled: isAuthenticated && page === "finance" && financeRangeInput !== null, retry: false });
  const financeExpensesInput = useMemo(() => financeRangeInput === null ? undefined : ({ ...financeRangeInput, page: financeExpensesPage }), [financeRangeInput, financeExpensesPage]);
  const financeExpensesQuery = trpc.finance.expenses.useQuery(financeExpensesInput, { enabled: isAuthenticated && page === "finance" && financeRangeInput !== null, retry: false });
  const auditQuery = trpc.audit.list.useQuery(undefined, { enabled: isAuthenticated && page === "users", retry: false });
  const accessQuery = trpc.access.list.useQuery(undefined, { enabled: isAuthenticated && page === "users", retry: false });
  const historyInput = useMemo(() => ({ from: historyFrom ? saoPauloDayStart(historyFrom) : undefined, to: historyTo ? saoPauloDayEnd(historyTo) : undefined }), [historyFrom, historyTo]);
  const reportSummaryQuery = trpc.reports.summary.useQuery(historyInput, { enabled: isAuthenticated && page === "reports", retry: false });
  const pricingRulesQuery = trpc.pricing.rules.useQuery(undefined, { enabled: isAuthenticated && page === "settings", retry: false });
  const tabQuery = trpc.lounge.tab.useQuery({ tabId: selectedTabId && selectedTabId > 0 ? selectedTabId : 1 }, { enabled: isAuthenticated && page === "tables" && !!selectedTabId && selectedTabId > 0, retry: false, staleTime: 3000 });
  const workspaceQuery = trpc.workspace.bootstrap.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const printerStatusQuery = trpc.printer.status.useQuery(undefined, { enabled: isAuthenticated && page === "settings" && workspaceQuery.data?.localRole === "administrator", retry: false, refetchInterval: isAuthenticated && page === "settings" && workspaceQuery.data?.localRole === "administrator" ? 15_000 : false });
  const printerTabJobs = (printerStatusQuery.data?.jobs ?? []).filter((job) => job.kind === "tab");
  const printerOtherJobs = (printerStatusQuery.data?.jobs ?? []).filter((job) => job.kind !== "tab").slice(0, 5);

  const refreshOperationalData = (keys: { tables?: boolean; dashboard?: boolean; products?: boolean } = {}) => {
    if (keys.tables) void utils.lounge.tables.invalidate();
    if (keys.dashboard) void utils.lounge.dashboard.invalidate();
    if (keys.products) void utils.inventory.products.invalidate();
  };
  const openTabMutation = trpc.lounge.openTab.useMutation({ onSuccess: (tab, variables) => {
    utils.lounge.tab.setData({ tabId: tab.id }, tab);
    utils.lounge.tables.setData(undefined, (previous) => previous?.map((table) => table.id === variables.tableId ? { ...table, status: "occupied", tabId: tab.id, tabCode: tab.tabCode, customerName: null, openedAt: tab.openedAt, totalCents: 0, paidCents: 0, balanceCents: 0 } : table));
    void utils.lounge.dashboard.invalidate();
    setSelectedTabId(tab.id);
    toast.success("Comanda aberta com sucesso");
  }, onError: (error) => toast.error(error.message) });
  const addItemMutation = trpc.lounge.addItem.useMutation({
    onMutate: async (variables) => {
      await Promise.all([
        utils.lounge.tab.cancel({ tabId: variables.tabId }),
        utils.inventory.products.cancel({}),
      ]);
      const previousTab = utils.lounge.tab.getData({ tabId: variables.tabId });
      const product = products.find((item: any) => item.id === variables.productId);
      const optimisticItemId = -Date.now() - Math.floor(Math.random() * 1000);
      if (previousTab && product) {
        const items = [...previousTab.items, { id: optimisticItemId, productId: product.id, productName: product.name, quantity: variables.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, note: variables.note ?? null, addedByName: user?.name || "Operador", createdAt: new Date() }];
        const subtotalCents = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPriceCents, 0);
        const tipCents = Math.round(subtotalCents * ((previousTab as any).tipPercent ?? 0) / 100);
        const paidCents = previousTab.paidCents ?? 0;
        utils.lounge.tab.setData({ tabId: variables.tabId }, { ...previousTab, items, subtotalCents, tipCents, totalCents: Math.max(0, subtotalCents + tipCents + (previousTab as any).manualAdjustmentCents), balanceCents: Math.max(subtotalCents + tipCents + (previousTab as any).manualAdjustmentCents - paidCents, 0) } as any);
      }
      utils.inventory.products.setData({}, (current) => current?.map((item: any) => item.id === variables.productId ? { ...item, stockQuantity: item.stockQuantity - variables.quantity } : item));
      setNoteOpen(false); setPendingProduct(null); setItemNote("");
      return { tabId: variables.tabId, productId: variables.productId, quantity: variables.quantity, optimisticItemId };
    },
    onSuccess: (result, _variables, context) => {
      utils.lounge.tab.setData({ tabId: context.tabId }, (current: any) => {
        if (!current) return current;
        const applyTotals = result.version >= (current.version ?? 0);
        const paidCents = current.paidCents ?? 0;
        const subtotalCents = applyTotals ? result.subtotalCents : current.subtotalCents;
        const totalCents = applyTotals ? result.totalCents : current.totalCents;
        return { ...current, items: [...current.items.filter((item: any) => item.id !== context.optimisticItemId), result.item], version: Math.max(current.version ?? 0, result.version), subtotalCents, tipCents: applyTotals ? result.tipCents : current.tipCents, totalCents, manualAdjustmentCents: applyTotals ? result.manualAdjustmentCents : current.manualAdjustmentCents, balanceCents: Math.max(totalCents - paidCents, 0), launchHistory: [result.audit, ...(current.launchHistory ?? [])].slice(0, 100) };
      });
      utils.inventory.products.setData({}, (current) => current?.map((item: any) => item.id === result.product.id ? { ...item, stockQuantity: result.product.stockQuantity } : item));
      utils.lounge.tables.setData(undefined, (current) => current?.map((table) => table.tabId === context.tabId && result.version >= (table.version ?? 0) ? { ...table, version: result.version, totalCents: result.totalCents, balanceCents: Math.max(result.totalCents - (table.paidCents ?? 0), 0) } : table));
      void utils.lounge.dashboard.invalidate();
      void utils.inventory.movements.invalidate();
      setLaunchingProductIds((current) => { const next = new Set(current); next.delete(result.item.productId); return next; });
      setNoteOpen(false); setPendingProduct(null); setItemNote(""); setLaunchQuantity("1");
    },
    onError: (error, _variables, context) => {
      setLaunchQuantity("1");
      setLaunchingProductIds((current) => { const next = new Set(current); next.delete(_variables.productId); return next; });
      if (context) {
        utils.inventory.products.setData({}, (current) => current?.map((item: any) => item.id === context.productId ? { ...item, stockQuantity: item.stockQuantity + context.quantity } : item));
        void utils.lounge.tab.invalidate({ tabId: context.tabId }, { refetchType: "active" });
      }
      toast.error(error.message);
    },
  });
  const setItemMutation = trpc.lounge.setItemQuantity.useMutation({
    onMutate: async (variables) => {
      if (!selectedTabId || selectedTabId < 0) return { previousTab: undefined };
      await utils.lounge.tab.cancel({ tabId: selectedTabId });
      const previousTab = utils.lounge.tab.getData({ tabId: selectedTabId });
      if (previousTab) {
        const items = previousTab.items.map((item: any) => item.id === variables.itemId ? { ...item, quantity: variables.quantity } : item).filter((item: any) => item.quantity > 0);
        const subtotalCents = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPriceCents, 0);
        const tipCents = Math.round(subtotalCents * ((previousTab as any).tipPercent ?? 0) / 100);
        utils.lounge.tab.setData({ tabId: selectedTabId }, { ...previousTab, items, subtotalCents, tipCents, totalCents: Math.max(0, subtotalCents + tipCents + ((previousTab as any).manualAdjustmentCents ?? 0)), balanceCents: Math.max(subtotalCents + tipCents + ((previousTab as any).manualAdjustmentCents ?? 0) - (previousTab.paidCents ?? 0), 0) } as any);
      }
      return { previousTab };
    },
    onSuccess: () => { setUpdatingItemId(null); void utils.lounge.tab.invalidate(undefined, { refetchType: "active" }); void utils.inventory.products.invalidate(undefined, { refetchType: "active" }); void utils.inventory.movements.invalidate(); },
    onError: (error, _variables, context) => { setUpdatingItemId(null); if (selectedTabId && selectedTabId > 0 && context?.previousTab) utils.lounge.tab.setData({ tabId: selectedTabId }, context.previousTab); toast.error(error.message); },
  });
  const createPrinterPairingCodeMutation = trpc.printer.createPairingCode.useMutation({
    onSuccess: (result) => { setPrinterPairing(result); void printerStatusQuery.refetch(); toast.success("Código de pareamento criado; ele expira em 10 minutos e só pode ser usado uma vez."); },
    onError: (error) => toast.error(error.message),
  });
  const revokePrinterAgentMutation = trpc.printer.revoke.useMutation({
    onSuccess: () => { setPrinterPairing(null); void printerStatusQuery.refetch(); toast.success("Acesso do agente Windows revogado."); },
    onError: (error) => toast.error(error.message),
  });
  const enqueuePrintMutation = trpc.printer.printTab.useMutation({
    onSuccess: (result) => toast.success(result.agentOnline ? "Comanda enfileirada para impressão no Windows." : "Comanda enfileirada; será impressa quando o computador estiver conectado."),
    onError: (error) => toast.error(error.message),
  });
  const payMutation = trpc.lounge.pay.useMutation({ onSuccess: (_result, variables) => { clearPendingOnlinePayment(variables.requestKey); void utils.lounge.tab.invalidate({ tabId: variables.tabId }); void utils.cash.current.invalidate(); void utils.finance.summary.invalidate(); refreshOperationalData({ tables: true, dashboard: true }); setPaymentOpen(false); setPaymentValue(""); toast.success("Pagamento registrado. A mesa permanece aberta."); }, onError: (error, variables) => { if (error.data?.code === "PRECONDITION_FAILED") clearPendingOnlinePayment(variables.requestKey); toast.error(error.message); } });
  const closeMutation = trpc.lounge.closeTab.useMutation({ onSuccess: (_result, variables) => { void utils.finance.summary.invalidate(); setSelectedTabId(null); void utils.lounge.tab.invalidate({ tabId: variables.tabId }); void utils.lounge.tables.refetch(); void utils.lounge.dashboard.invalidate(); toast.success("Comanda encerrada e mesa liberada"); }, onError: (error) => toast.error(error.message) });
  const transferMutation = trpc.lounge.transferTab.useMutation({ onSuccess: (result) => { setTransferOpen(false); setTransferDestination(null); void utils.lounge.tables.refetch(); void utils.lounge.tab.invalidate({ tabId: result.tabId }); toast.success(`Comanda transferida para a mesa ${result.tableNumber}`); }, onError: (error) => toast.error(error.message) });
  const customerNameMutation = trpc.lounge.setCustomerName.useMutation({ onSuccess: () => { setCustomerNameOpen(false); void utils.lounge.tab.invalidate(); void utils.lounge.tables.invalidate(); toast.success("Nome da mesa atualizado"); }, onError: (error) => toast.error(error.message) });
  const saveCustomerMutation = trpc.customers.save.useMutation({ onSuccess: () => { void customersQuery.refetch(); setCustomerFormOpen(false); setCustomerForm({ name: "", cpf: "", phone: "", notes: "" }); toast.success("Cliente cadastrado"); }, onError: (error) => toast.error(error.message) });
  const deleteCustomerMutation = trpc.customers.delete.useMutation({ onSuccess: () => { void customersQuery.refetch(); toast.success("Cliente desativado"); }, onError: (error) => toast.error(error.message) });
  const stockMutation = trpc.inventory.adjust.useMutation({ onSuccess: () => { refreshOperationalData({ products: true, dashboard: true }); void utils.inventory.movements.invalidate(); setStockSheet(false); toast.success("Movimentação de estoque registrada"); }, onError: (error) => toast.error(error.message) });
  const saveProductMutation = trpc.inventory.saveProduct.useMutation({ onSuccess: () => { refreshOperationalData({ products: true, dashboard: true }); setProductOpen(false); setEditingProduct(null); setNewProduct({ name: "", code: "", categoryId: 1, unit: "un", cost: "", price: "", stock: "", minimum: "" }); toast.success(editingProduct ? "Produto atualizado" : "Produto cadastrado com sucesso"); }, onError: (error) => toast.error(error.message) });
  const deleteProductMutation = trpc.inventory.deleteProduct.useMutation({ onSuccess: (result) => { refreshOperationalData({ products: true, dashboard: true }); toast.success(result.deleted ? "Produto removido" : "Produto desativado para preservar o histórico"); }, onError: (error) => toast.error(error.message) });
  const setProductActiveMutation = trpc.inventory.setProductActive.useMutation({ onSuccess: (result) => { refreshOperationalData({ products: true, dashboard: true }); toast.success(result.active ? "Produto ativado" : "Produto desativado"); }, onError: (error) => toast.error(error.message) });
  const createCategoryMutation = trpc.inventory.createCategory.useMutation({ onSuccess: () => { void utils.inventory.categories.invalidate(); setCategoryOpen(false); setCategoryName(""); toast.success("Categoria criada com sucesso"); }, onError: (error) => toast.error(error.message) });
  const updateAccessMutation = trpc.access.update.useMutation({ onSuccess: () => { void utils.access.list.invalidate(); toast.success("Permissão atualizada"); }, onError: (error) => toast.error(error.message) });
  const updateRolePermissionsMutation = trpc.access.updateRolePermissions.useMutation({ onSuccess: async () => { await workspaceQuery.refetch(); toast.success("Permissões dos perfis atualizadas"); }, onError: (error) => toast.error(error.message) });
  const createPriceRuleMutation = trpc.pricing.createRule.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Preço por horário criado"); }, onError: (error) => toast.error(error.message) });
  const updatePriceRuleMutation = trpc.pricing.updateRule.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Regra de promoção atualizada"); }, onError: (error) => toast.error(error.message) });
  const setPriceRuleActiveMutation = trpc.pricing.setActive.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Status da regra atualizado"); }, onError: (error) => toast.error(error.message) });
  const deletePriceRuleMutation = trpc.pricing.deleteRule.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Regra excluída"); }, onError: (error) => toast.error(error.message) });
  const updateTableLimitMutation = trpc.commercial.updateTableLimit.useMutation({ onSuccess: (result) => { void utils.commercial.settings.invalidate(); void utils.lounge.tables.invalidate(); toast.success(`Limite atualizado para ${result.maxTables} mesas`); }, onError: (error) => toast.error(error.message) });
  const updateNegativeStockPolicyMutation = trpc.commercial.updateNegativeStockPolicy.useMutation({ onSuccess: (result) => { void utils.commercial.settings.invalidate(); toast.success(result.preventNegativeStock ? "Estoque negativo bloqueado" : "Estoque negativo permitido"); }, onError: (error) => toast.error(error.message) });
  const chargesMutation = trpc.lounge.setCharges.useMutation({ onSuccess: () => { refreshOperationalData({ tables: true, dashboard: true }); toast.success("Gorjeta atualizada"); }, onError: (error) => toast.error(error.message) });
  const adjustTabValueMutation = trpc.lounge.adjustTabValue.useMutation({ onSuccess: () => { void utils.finance.summary.invalidate(); void utils.lounge.tab.invalidate(undefined, { refetchType: "active" }); void utils.lounge.tables.invalidate(); void utils.lounge.dashboard.invalidate(); toast.success("Total ajustado e justificativa registrada"); }, onError: (error) => toast.error(error.message) });
  const expenseMutation = trpc.finance.createExpense.useMutation({ onSuccess: () => { void utils.cash.current.invalidate(); void utils.cash.history.invalidate(); void utils.finance.summary.invalidate(); void utils.finance.expenses.invalidate(); void utils.lounge.dashboard.invalidate(); setExpenseOpen(false); setExpense({ description: "", category: "Fornecedores", amount: "", method: "pix", notes: "" }); toast.success("Despesa registrada no financeiro"); }, onError: (error) => toast.error(error.message) });
  const finishAuth = (message: string) => { setLoginOpen(false); setCredentials({ name: "", username: "", password: "" }); void utils.auth.me.invalidate(); toast.success(message); };
  const localLoginMutation = trpc.localAuth.login.useMutation({ onSuccess: () => { void utils.auth.me.invalidate(); void workspaceQuery.refetch(); setLoginOpen(false); setCredentials({ name: "", username: "", password: "" }); toast.success("Acesso liberado"); }, onError: (error) => toast.error(error.message) });
  const createUserMutation = trpc.access.create.useMutation({ onSuccess: () => { void accessQuery.refetch(); setUserCreateOpen(false); setNewUser({ name: "", username: "", password: "", localRole: "attendant" }); toast.success("Usuário criado com sucesso"); }, onError: (error) => toast.error(error.message) });
  const deleteUserMutation = trpc.access.delete.useMutation({ onSuccess: () => { void accessQuery.refetch(); toast.success("Usuário excluído; histórico preservado"); }, onError: (error) => toast.error(error.message) });
  const localLogoutMutation = trpc.localAuth.logout.useMutation({ onSuccess: () => { utils.auth.me.setData(undefined, null); void utils.auth.me.invalidate(); toast.success("Sessão local encerrada"); }, onError: (error) => toast.error(error.message) });
  const syncOfflineMutation = trpc.lounge.syncOfflineTab.useMutation({ onSuccess: (result, variables) => { removeOfflineTab(variables.offlineKey); setOfflineTabs(getOfflineTabs()); setOfflineSyncBlocked(false); setOfflineSyncWaitingForCash(false); setOfflineCashWaitDataUpdatedAt(null); if (selectedTabId && selectedTabId < 0) setSelectedTabId(result.tabId); void utils.cash.current.invalidate(); void utils.lounge.tables.invalidate(); void utils.lounge.tab.invalidate({ tabId: result.tabId }); void utils.inventory.movements.invalidate(); toast.success("Comanda offline sincronizada"); }, onError: (error) => { const waitingForCash = error.message.includes("Abra o caixa antes de realizar operações financeiras"); setOfflineSyncWaitingForCash(waitingForCash); setOfflineCashWaitDataUpdatedAt(waitingForCash ? cashStatusQuery.dataUpdatedAt : null); setOfflineSyncBlocked(true); toast.error(`Sincronização pendente: ${error.message}`); } });

  useEffect(() => {
    const goOnline = () => { setConnectionOnline(true); setOfflineSyncBlocked(false); setOfflineSyncWaitingForCash(false); setOfflineCashWaitDataUpdatedAt(null); };
    const goOffline = () => { setConnectionOnline(false); setOfflineSyncBlocked(false); setOfflineSyncWaitingForCash(false); setOfflineCashWaitDataUpdatedAt(null); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);
  useEffect(() => { if (productsQuery.data) cached("products", productsQuery.data); }, [productsQuery.data]);
  useEffect(() => { if (tablesQuery.data) cached("tables", tablesQuery.data); }, [tablesQuery.data]);

  const cachedTables = cached<any[]>("tables") ?? demoTables;
  const cachedProducts = cached<any[]>("products") ?? demoProducts;
  const tables = (tablesQuery.data ?? cachedTables).map((table: any) => {
    const offlineTab = getOfflineTabByTable(table.id);
    if (!offlineTab) return table;
    const view = offlineTabView(offlineTab);
    return { ...table, status: "occupied", tabId: offlineTab.id, tabCode: offlineTab.tabCode, customerName: offlineTab.customerName, openedAt: offlineTab.createdAt, totalCents: view.totalCents, paidCents: view.paidCents, balanceCents: view.balanceCents };
  });
  const products = productsQuery.data ?? cachedProducts;
  const dashboard = dashboardQuery.data ?? demoDashboard;
  // Não use a comanda demonstrativa como fallback quando uma comanda real foi selecionada:
  // isso fazia os itens lançados aparecerem brevemente enquanto a consulta carregava.
  const activeOfflineTab = selectedTabId && selectedTabId < 0 ? getOfflineTabById(selectedTabId) : null;
  const activeTab = selectedTabId ? (activeOfflineTab ? offlineTabView(activeOfflineTab) : tabQuery.data ?? null) : null;
  const pendingOnlinePayment = readPendingOnlinePayment();
  const pendingOnlinePaymentForActiveTab = Boolean(activeTab && pendingOnlinePayment?.tabId === activeTab.id);
  useEffect(() => { if (activeTab) setTipEnabled((activeTab as any).tipPercent === 10); }, [activeTab?.id, (activeTab as any)?.tipPercent]);
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.code} ${product.categoryName ?? ""}`.toLocaleLowerCase().includes(productSearch.toLocaleLowerCase())), [products, productSearch]);
  const occupiedCount = tables.filter((table) => table.status !== "free").length;

  useEffect(() => {
    const statusRefreshedAfterCashError = offlineCashWaitDataUpdatedAt !== null && cashStatusQuery.dataUpdatedAt > offlineCashWaitDataUpdatedAt;
    if (cashIsOpen && offlineSyncWaitingForCash && statusRefreshedAfterCashError) {
      setOfflineSyncBlocked(false);
      setOfflineSyncWaitingForCash(false);
      setOfflineCashWaitDataUpdatedAt(null);
    }
  }, [cashIsOpen, offlineSyncWaitingForCash, offlineCashWaitDataUpdatedAt, cashStatusQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!connectionOnline || !isAuthenticated || offlineSyncBlocked || syncOfflineMutation.isPending || !offlineTabs.length) return;
    const queued = offlineTabs[0];
    syncOfflineMutation.mutate({ offlineKey: queued.offlineKey, deviceId: queued.deviceId, tableId: queued.tableId, customerName: queued.customerName, tipPercent: queued.tipPercent, items: queued.items.map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, note: item.note ?? null, createdAt: item.createdAt })), payments: queued.payments.map((payment) => ({ amountCents: payment.amountCents, method: payment.method, requestKey: payment.requestKey })) });
  }, [connectionOnline, isAuthenticated, offlineSyncBlocked, offlineTabs, syncOfflineMutation.isPending]);

  const requireAuth = (action: () => void) => {
    if (!isAuthenticated) {
      toast.info("Entre para registrar operações reais.");
      setLoginOpen(true);
      return;
    }
    action();
  };

  const endSession = () => user?.loginMethod?.startsWith("local") ? localLogoutMutation.mutate() : logout();

  const openOfflineTab = (table: any) => {
    const tab = createOfflineTab(table, cashIsOpen);
    saveOfflineTab(tab);
    setOfflineTabs(getOfflineTabs());
    setSelectedTabId(tab.id);
    toast.success(`Comanda offline aberta na mesa ${table.number}`);
  };

  const updateOfflineTab = (tab: any, updater: (current: any) => any) => {
    const current = getOfflineTabById(tab.id);
    if (!current) return;
    const updated = updater(current);
    saveOfflineTab(updated);
    setOfflineTabs(getOfflineTabs());
  };

  const saveTableName = () => {
    if (!activeTab) return;
    const customerName = customerNameInput.trim() || null;
    if (activeTab.id < 0) {
      updateOfflineTab(activeTab, (current) => ({ ...current, customerName }));
      setCustomerNameOpen(false);
      toast.success(customerName ? `Mesa identificada como ${customerName}` : "Nome da mesa removido");
      return;
    }
    customerNameMutation.mutate({ tabId: activeTab.id, customerName });
  };
  const selectTable = (table: any) => {
    if (table.status === "free") {
      requireAuth(() => connectionOnline ? openTabMutation.mutate({ tableId: table.id }) : openOfflineTab(table));
      return;
    }
    if (table.tabId) utils.lounge.tab.setData({ tabId: table.tabId }, undefined);
    setSelectedTabId(table.tabId);
  };

  const addProduct = (product: any) => requireAuth(() => {
    if (!cashIsOpen) { toast.error("Abra o caixa antes de lançar ou vender produtos."); return; }
    if (!selectedTabId) { toast.message("Selecione uma comanda aberta primeiro."); return; }
    setPendingProduct(product);
    setItemNote("");
    setLaunchQuantity("1");
    setNoteOpen(true);
  });

  const commitAddProduct = (product: any, quantity: number, note?: string) => requireAuth(() => {
    if (!cashIsOpen) { toast.error("Abra o caixa antes de lançar ou vender produtos."); return; }
    if (!selectedTabId) { toast.message("Selecione uma comanda aberta primeiro."); return; }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) { toast.error("Informe uma quantidade entre 1 e 99"); return; }
    if (selectedTabId < 0) {
      updateOfflineTab({ id: selectedTabId }, (current) => {
        const createdAt = new Date().toISOString();
        const items = [...current.items, { id: `${current.offlineKey}-${product.id}-${Date.now()}`, productId: product.id, productName: product.name, quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, note: note?.trim() || null, createdAt }];
        return { ...current, items };
      });
      setNoteOpen(false); setPendingProduct(null); setItemNote(""); setLaunchQuantity("1");
      return;
    }
    setLaunchingProductIds((current) => new Set(current).add(product.id));
    addItemMutation.mutate({ tabId: selectedTabId, productId: product.id, quantity, note: note?.trim() || undefined });
  });
  const confirmAddProduct = () => {
    if (!pendingProduct) return;
    const quantity = Math.max(1, Math.floor(Number(launchQuantity)));
    commitAddProduct(pendingProduct, quantity, itemNote);
  };

  const changeItemQuantity = (itemId: number, quantity: number) => {
    if (!cashIsOpen) { toast.error("Abra o caixa antes de alterar itens da comanda."); return; }
    if (selectedTabId && selectedTabId < 0) {
      updateOfflineTab({ id: selectedTabId }, (current) => ({ ...current, items: current.items.map((item: any) => item.id === itemId ? { ...item, quantity } : item).filter((item: any) => item.quantity > 0) }));
      return;
    }
    requireAuth(() => { setUpdatingItemId(itemId); setItemMutation.mutate({ itemId, quantity }); });
  };

  const printBaristaOrder = () => {
    if (!baristaPrintOrder?.tab || !baristaPrintOrder?.item) return;
    const { tab, item } = baristaPrintOrder;
    if (tab.id < 0) { toast.error("Impressão direta indisponível para uma comanda offline ainda não sincronizada."); return; }
    enqueuePrintMutation.mutate({ tabId: tab.id, kind: "barista", itemId: Number(item.id) }, {
      onSuccess: () => setBaristaPrintOrder(null),
    });
  };

  const printTab = () => {
    if (!activeTab) return;
    if (activeTab.id < 0) { toast.error("Impressão direta indisponível para uma comanda offline ainda não sincronizada."); return; }
    enqueuePrintMutation.mutate({ tabId: activeTab.id, kind: "tab" });
  };

  const processPayment = () => requireAuth(() => {
    if (!activeTab) return;
    const cents = Math.round(Number(paymentValue.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { toast.error("Informe um valor de pagamento válido"); return; }
    const existing = readPendingOnlinePayment();
    if (existing && (existing.tabId !== activeTab.id || existing.amountCents !== cents || existing.method !== paymentMethod)) {
      toast.error("Há um pagamento aguardando confirmação. Reenvie o mesmo valor e forma de pagamento antes de iniciar outro.");
      return;
    }
    if (!cashIsOpen && !existing) { toast.error("Abra o caixa antes de registrar pagamentos."); return; }
    if (activeTab.id < 0) {
      const totals = offlineTotals(activeOfflineTab!);
      if (cents > totals.balanceCents) { toast.error("O pagamento não pode superar o saldo pendente"); return; }
      updateOfflineTab(activeTab, (current) => ({ ...current, payments: [...current.payments, { id: `${current.offlineKey}-payment-${Date.now()}`, amountCents: cents, method: paymentMethod, requestKey: `${current.offlineKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() }] }));
      setPaymentOpen(false); setPaymentValue(""); toast.success("Pagamento salvo offline");
      return;
    }
    const intent = existing ?? {
      tabId: activeTab.id,
      amountCents: cents,
      method: paymentMethod,
      requestKey: `PAY-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
    };
    if (!existing && !savePendingOnlinePayment(intent)) {
      toast.error("Não foi possível salvar a confirmação do pagamento neste navegador. Libere o armazenamento local e tente novamente.");
      return;
    }
    payMutation.mutate({ ...intent });
  });

  const toggleTip = (checked: boolean) => {
    if (!cashIsOpen) { toast.error("Abra o caixa antes de alterar valores da comanda."); return; }
    setTipEnabled(checked);
    if (activeOfflineTab) { updateOfflineTab(activeOfflineTab, (current) => ({ ...current, tipPercent: checked ? 10 : 0 })); toast.success("Gorjeta salva offline"); return; }
    if (activeTab) requireAuth(() => chargesMutation.mutate({ tabId: activeTab.id, tipPercent: checked ? 10 : 0 }));
  };

  const navItem = (item: typeof nav[number]) => {
    const Icon = item.icon;
    const active = page === item.id;
    const operationBusy = addItemMutation.isPending || setItemMutation.isPending || updateTableLimitMutation.isPending;
    return <button key={item.id} disabled={operationBusy} onClick={() => { setPage(item.id); setSelectedTabId(null); setMobileNav(false); }} className={`nav-item ${active ? "nav-item-active" : ""}`}><Icon size={19} /><span>{item.label}</span>{item.id === "stock" && dashboard.lowStock > 0 ? <i>{dashboard.lowStock}</i> : null}</button>;
  };

  const localRole = workspaceQuery.data?.localRole;
  const rolePermissions = workspaceQuery.data?.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS;
  const hasFeatureAccess = (feature: AccessFeature) => canAccessFeature(localRole, rolePermissions, feature);
  const visibleNav = nav.filter((item) => item.id === "users" ? localRole === "administrator" : hasFeatureAccess(item.id as AccessFeature));
  const firstPermittedPage = visibleNav[0]?.id ?? (hasFeatureAccess("settings") ? "settings" : "tables");
  const canOpenPage = (target: Page) => target === "settings" ? hasFeatureAccess("settings") : target === "users" ? localRole === "administrator" : visibleNav.some((item) => item.id === target);
  useEffect(() => {
    if (!isAuthenticated || !localRole) return;
    const preferredPage: Page = localRole === "administrator" ? "products" : localRole === "manager" && hasFeatureAccess("dashboard") ? "dashboard" : firstPermittedPage;
    setPage(canOpenPage(preferredPage) ? preferredPage : firstPermittedPage);
  }, [isAuthenticated, localRole]);
  useEffect(() => {
    if (!localRole) return;
    if (!canOpenPage(page)) setPage(firstPermittedPage);
  }, [page, localRole, rolePermissions]);

  if (loading) return <div className="loading-screen"><div className="loading-mark"><Flame size={30} /></div><span>Preparando operação</span></div>;
  if (!isAuthenticated) return <LoginScreen credentials={credentials} setCredentials={setCredentials} passwordVisible={loginPasswordVisible} setPasswordVisible={setLoginPasswordVisible} mutation={localLoginMutation} />;
  if (connectionOnline && workspaceQuery.isLoading) return <div className="loading-screen"><div className="loading-mark"><Flame size={30} /></div><span>Carregando seu perfil</span></div>;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-mobile-open" : ""}`}>
        <div className="brand-block">
          <img className="brand-logo" src="/shadow-lounge-icon-white.png" alt="Shadow Lounge" />
        </div>
        <div className="shift-pill"><span className="pulse-dot" /> OPERAÇÃO AO VIVO</div>
        <nav>{visibleNav.map(navItem)}</nav>
        <div className="sidebar-bottom">
          {hasFeatureAccess("settings") && <button className={`nav-item ${page === "settings" ? "nav-item-active" : ""}`} disabled={addItemMutation.isPending || setItemMutation.isPending} onClick={() => setPage("settings")}><Settings size={19} /><span>Configurações</span></button>}
          {user ? <button className="operator-card" onClick={endSession}><span className="operator-avatar">{(user.name || "O").slice(0, 1)}</span><span><b>{user.name || "Operador"}</b><small>Encerrar sessão</small></span></button> : <button className="login-card" onClick={() => setLoginOpen(true)}><LogIn size={18} /><span>Entrar no sistema</span></button>}
        </div>
      </aside>
      {mobileNav ? <div className="nav-scrim" onClick={() => setMobileNav(false)} /> : null}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={21} /></button><div><p className="eyebrow">SHADOW LOUNGE <span>/</span> {page === "tables" ? "ATENDIMENTO" : page === "cash" ? "CAIXA" : page.toUpperCase()}</p><h1>{page === "tables" ? "Mesas" : page === "dashboard" ? "Visão geral" : page === "customers" ? "Clientes" : page === "products" ? "Produtos" : page === "stock" ? "Estoque" : page === "cash" ? "Caixa" : page === "finance" ? "Financeiro" : page === "reports" ? "Relatórios" : page === "users" ? "Usuários e auditoria" : "Configurações"}</h1></div></div>
          <div className="topbar-actions"><div className="date-chip"><span className={connectionOnline ? "pulse-dot" : "danger"} /> {connectionOnline ? "Online" : "Offline"}{offlineTabs.length ? ` · ${offlineTabs.length} pendente${offlineTabs.length > 1 ? "s" : ""}` : ""}</div><div className="date-chip"><Clock3 size={16} /><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date())}</span></div>{!isAuthenticated && <Button className="login-button" onClick={() => setLoginOpen(true)}><LogIn size={16} /> Entrar</Button>}</div>
        </header>

        {!isAuthenticated && <div className="demo-banner"><Sparkles size={17} /><span><b>Visão demonstrativa</b> — entre para abrir comandas, registrar pagamentos e persistir os dados.</span><button onClick={() => setLoginOpen(true)}>Acessar operação <ArrowUpRight size={15} /></button></div>}

        <div className="page-container">
          {visibleNav.length === 0 && !hasFeatureAccess("settings") && localRole !== "administrator" ? <section className="panel no-role-permissions"><ShieldCheck size={24} /><b>Seu perfil ainda não tem funcionalidades liberadas.</b><span>Peça ao administrador para habilitar as áreas necessárias.</span></section> : <>
          {page === "dashboard" && <Dashboard dashboard={dashboard} occupiedCount={occupiedCount} tableCount={tables.length} onNavigate={setPage} />}
          {page === "tables" && !cashIsOpen && <div className="cash-gate-banner"><Banknote size={20} /><span><b>Caixa fechado.</b> Você pode abrir comandas, mas precisa abrir o caixa para lançar produtos, alterar valores ou receber pagamentos.</span>{hasFeatureAccess("cash") && <Button size="sm" onClick={() => setPage("cash")}>Abrir caixa</Button>}</div>}
          {page === "tables" && !activeTab && !selectedTabId && <TablesGrid tables={tables} onSelect={selectTable} isOpening={openTabMutation.isPending} />}
          {page === "tables" && selectedTabId && !activeTab && <div className="loading-screen inline-loading"><div className="loading-mark"><ReceiptText size={24} /></div><span>Carregando comanda...</span></div>}
          {page === "tables" && activeTab && <TabDetail tab={activeTab} products={filteredProducts} search={productSearch} setSearch={setProductSearch} tipEnabled={tipEnabled} setTipEnabled={toggleTip} onApplyCharges={() => activeTab && chargesMutation.mutate({ tabId: activeTab.id, tipPercent: tipEnabled ? 10 : 0 })} onBack={() => setSelectedTabId(null)} onName={() => { setCustomerNameInput(activeTab.customerName || ""); setCustomerNameOpen(true); }} onPrint={printTab} onAdd={(product: any) => addProduct(product)} onPrintBarista={(item: any) => activeTab && setBaristaPrintOrder({ tab: activeTab, item })} launchingProductIds={launchingProductIds} updatingItemId={updatingItemId} onQuantity={changeItemQuantity} onPayment={() => { const pending = readPendingOnlinePayment(); if (pending?.tabId === activeTab.id) { setPaymentValue((pending.amountCents / 100).toFixed(2)); setPaymentMethod(pending.method); } else setPaymentValue((activeTab.balanceCents / 100).toFixed(2)); setPaymentOpen(true); }} onTransfer={() => { setTransferDestination(null); setTransferOpen(true); }} onClose={() => activeTab.id < 0 ? toast.info("A comanda offline será encerrada após sincronizar") : requireAuth(() => closeMutation.mutate({ tabId: activeTab.id }))} canAdjustTotal={activeTab.id > 0 && hasFeatureAccess("adjustTabValue")} onAdjustTotal={(newTotalCents: number, reason: string) => requireAuth(() => { if (!cashIsOpen) { toast.error("Abra o caixa antes de alterar o total da comanda."); return; } adjustTabValueMutation.mutate({ tabId: activeTab.id, newTotalCents, reason }); })} cashOpen={cashIsOpen} canRetryPendingPayment={pendingOnlinePaymentForActiveTab} currentUserName={user?.name || "Operador"} loading={productsQuery.isLoading || setItemMutation.isPending || payMutation.isPending || closeMutation.isPending || chargesMutation.isPending || transferMutation.isPending || customerNameMutation.isPending || syncOfflineMutation.isPending || adjustTabValueMutation.isPending} />}
          {page === "customers" && <CustomersPage customers={customersQuery.data ?? []} onNew={() => setCustomerFormOpen(true)} onDelete={(id: number) => deleteCustomerMutation.mutate({ customerId: id })} />}
          {page === "products" && <ProductsPage products={products} onNewCategory={() => requireAuth(() => setCategoryOpen(true))} onNew={() => { setEditingProduct(null); setNewProduct({ name: "", code: "", categoryId: 1, unit: "un", cost: "", price: "", stock: "", minimum: "" }); setProductOpen(true); }} onEdit={(product: any) => { setEditingProduct(product); setNewProduct({ name: product.name, code: product.code, categoryId: product.categoryId ?? 1, unit: product.unit ?? "un", cost: String(product.costCents / 100), price: String(product.priceCents / 100), stock: String(product.stockQuantity), minimum: String(product.minimumStock) }); setProductOpen(true); }} onDelete={(id: number) => { if (window.confirm("Remover este produto? Esta ação não pode ser desfeita.")) deleteProductMutation.mutate({ productId: id }); }} onToggleActive={(id: number, active: boolean) => setProductActiveMutation.mutate({ productId: id, active })} />}
          {page === "cash" && <CashPage />}
          {page === "stock" && <StockPage products={products} movements={stockMovementsInput === null ? [] : stockMovementsQuery.data?.items ?? []} movementTotal={stockMovementsQuery.data?.total ?? 0} movementPage={stockMovementsPage} movementTotalPages={stockMovementsQuery.data?.totalPages ?? 0} onMovementPageChange={setStockMovementsPage} movementProduct={stockMovementProduct} onMovementProductChange={(productId) => { setStockMovementProduct(productId); setStockMovementsPage(1); }} movementsLoading={stockMovementsInput !== null && stockMovementsQuery.isFetching} movementsError={stockMovementsInput === null ? "Selecione um intervalo de datas válido." : stockMovementsQuery.error?.message} movementPeriod={stockMovementPeriod} onPeriodChange={(period) => { setStockMovementPeriod(period); setStockMovementsPage(1); }} movementFrom={stockMovementFrom} onMovementFromChange={(date) => { setStockMovementFrom(date); setStockMovementsPage(1); }} movementTo={stockMovementTo} onMovementToChange={(date) => { setStockMovementTo(date); setStockMovementsPage(1); }} onRefreshMovements={() => void stockMovementsQuery.refetch()} onAdjust={(product) => { setStockProduct(product); setStockQty("1"); setStockSheet(true); }} />}
          {page === "finance" && <FinancePage cashOpen={cashIsOpen} summary={financeSummaryQuery.data} expenses={financeExpensesQuery.data?.items ?? []} expenseTotal={financeExpensesQuery.data?.total ?? 0} expensePage={financeExpensesPage} expenseTotalPages={financeExpensesQuery.data?.totalPages ?? 0} onExpensePageChange={setFinanceExpensesPage} period={financePeriod} onPeriodChange={(period: "today" | "7days" | "month" | "custom") => { setFinancePeriod(period); setFinanceExpensesPage(1); if (period !== "custom") { const today = saoPauloDateKey(new Date()); setFinanceTo(today); setFinanceFrom(period === "today" ? today : period === "7days" ? addDaysToSaoPauloDateKey(today, -6) : firstOfMonthInSaoPaulo(new Date())); } }} from={financeFrom} to={financeTo} onFromChange={(value: string) => { setFinanceFrom(value); setFinancePeriod("custom"); setFinanceExpensesPage(1); }} onToChange={(value: string) => { setFinanceTo(value); setFinancePeriod("custom"); setFinanceExpensesPage(1); }} loading={financeSummaryQuery.isLoading || financeExpensesQuery.isLoading} expensesLoading={financeExpensesQuery.isFetching} error={financeSummaryQuery.error?.message || financeExpensesQuery.error?.message} rangeError={financeRangeInput === null} onRefresh={() => { void financeSummaryQuery.refetch(); void financeExpensesQuery.refetch(); }} onNewExpense={() => requireAuth(() => { if (!cashIsOpen) { toast.error("Abra o caixa antes de registrar despesas."); return; } setExpenseOpen(true); })} />}
          {page === "reports" && <ReportsPage summary={reportSummaryQuery.data} from={historyFrom} to={historyTo} setFrom={setHistoryFrom} setTo={setHistoryTo} loading={reportSummaryQuery.isLoading} error={reportSummaryQuery.error?.message} onRefresh={() => void reportSummaryQuery.refetch()} />}
          {page === "users" && <UsersPage audits={auditQuery.data ?? []} users={accessQuery.data ?? []} rolePermissions={rolePermissions} savingRolePermissions={updateRolePermissionsMutation.isPending} onSaveRolePermissions={(input) => requireAuth(() => updateRolePermissionsMutation.mutate(input))} onUpdate={(input: any) => requireAuth(() => updateAccessMutation.mutate(input))} onCreate={() => setUserCreateOpen(true)} onDelete={(userId: number) => requireAuth(() => deleteUserMutation.mutate({ userId }))} />}
          {page === "settings" && <>
            {localRole === "administrator" && <section className="panel printer-bridge-panel">
              <div className="panel-header"><div><span className="section-kicker">IMPRESSÃO DIRETA</span><h3>Ponte Windows · KP-IM602</h3></div><Badge variant={printerStatusQuery.data?.agent?.online ? "default" : "outline"}>{printerStatusQuery.data?.agent?.online ? "COMPUTADOR ONLINE" : printerStatusQuery.data?.agent?.paired ? "AGENTE DESCONECTADO" : "NÃO PAREADO"}</Badge></div>
              <p>O computador consulta a fila por HTTPS e imprime as comandas pela impressora instalada no Windows, sem abrir a janela de impressão do navegador.</p>
              {printerStatusQuery.data?.agent?.paired && <p><b>Computador:</b> {printerStatusQuery.data.agent.computerName || "Windows"} · <b>Impressora:</b> {printerStatusQuery.data.agent.printerName || "KP-IM602"}{printerStatusQuery.data.agent.lastSeenAt ? ` · Último contato: ${dateTime(printerStatusQuery.data.agent.lastSeenAt)}` : ""}</p>}
              {localRole === "administrator" && <div className="cash-actions">
                <Button disabled={createPrinterPairingCodeMutation.isPending} onClick={() => createPrinterPairingCodeMutation.mutate()}><Printer size={16} /> {createPrinterPairingCodeMutation.isPending ? "Gerando…" : "Gerar código de pareamento"}</Button>
                {printerStatusQuery.data?.agent?.paired && <Button variant="outline" disabled={revokePrinterAgentMutation.isPending} onClick={() => revokePrinterAgentMutation.mutate()}>Revogar agente</Button>}
              </div>}
              {localRole === "administrator" && printerPairing && new Date(printerPairing.expiresAt).getTime() > Date.now() && <div className="product-callout"><ShieldCheck size={19} /><div><b>Código temporário · válido por 10 minutos</b><code>{printerPairing.pairingCode}</code><span>Digite-o no PowerShell do computador. O código é usado uma única vez.</span></div><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(printerPairing.pairingCode).then(() => toast.success("Código copiado."), () => toast.error("Não foi possível copiar o código.")); }}>Copiar código</Button></div>}
              {!!(printerTabJobs.length || printerOtherJobs.length) && <div className="cash-printer-jobs">
                {!!printerTabJobs.length && <div><span className="section-kicker">ÚLTIMAS 3 IMPRESSÕES DE COMANDAS</span><small>Trabalhos na fila ou em impressão são mantidos até a conclusão.</small><PrinterJobRows jobs={printerTabJobs} /></div>}
                {!!printerOtherJobs.length && <div><span className="section-kicker">OUTROS TRABALHOS · BARISTA/CAIXA</span><PrinterJobRows jobs={printerOtherJobs} /></div>}
              </div>}
              {printerStatusQuery.error && <p className="cash-error-text">{printerStatusQuery.error.message}</p>}
            </section>}
            <SettingsPage products={products} rules={pricingRulesQuery.data ?? []} tableLimit={commercialSettingsQuery.data?.maxTables ?? 20} preventNegativeStock={commercialSettingsQuery.data?.preventNegativeStock ?? true} tableLimitSaving={updateTableLimitMutation.isPending} stockPolicySaving={updateNegativeStockPolicyMutation.isPending} onCreateRule={(input: any) => requireAuth(() => createPriceRuleMutation.mutate(input))} onUpdateRule={(input: any) => updatePriceRuleMutation.mutateAsync(input)} updateRuleSaving={updatePriceRuleMutation.isPending} onSetRuleActive={(input: any) => requireAuth(() => setPriceRuleActiveMutation.mutate(input))} onDeleteRule={(input: any) => requireAuth(() => deletePriceRuleMutation.mutate(input))} onUpdateTableLimit={(maxTables) => requireAuth(() => updateTableLimitMutation.mutate({ maxTables }))} onUpdateNegativeStock={(preventNegativeStock) => requireAuth(() => updateNegativeStockPolicyMutation.mutate({ preventNegativeStock }))} />
          </>}
          </>}
        </div>
      </main>

      <Dialog open={customerFormOpen} onOpenChange={setCustomerFormOpen}><DialogContent className="payment-dialog"><DialogHeader><div className="dialog-icon"><Users size={20} /></div><DialogTitle>Novo cliente</DialogTitle><DialogDescription>Informe um CPF válido. O CPF será usado somente quando você atribuir este cliente a uma comanda.</DialogDescription></DialogHeader><div className="expense-form"><label className="field-label">Nome<Input autoFocus maxLength={160} value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Nome completo" /></label><label className="field-label">CPF<Input inputMode="numeric" maxLength={14} value={customerForm.cpf} onChange={(event) => setCustomerForm({ ...customerForm, cpf: formatCpf(event.target.value) })} placeholder="000.000.000-00" />{normalizeCpf(customerForm.cpf).length === 11 && !isValidCpf(customerForm.cpf) && <small className="cpf-validation-error">CPF inválido. Verifique os números digitados.</small>}</label><label className="field-label">Telefone (opcional)<Input maxLength={30} value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label><label className="field-label">Observações (opcional)<Textarea maxLength={500} value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} /></label><Button className="primary-wide" disabled={saveCustomerMutation.isPending} onClick={() => { if (!isValidCpf(customerForm.cpf)) { toast.error("CPF inválido. Confira os 11 dígitos e tente novamente."); return; } saveCustomerMutation.mutate(customerForm); }}>{saveCustomerMutation.isPending ? "Salvando..." : "Cadastrar cliente"}</Button></div></DialogContent></Dialog>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent><DialogHeader><div className="dialog-icon"><Package size={20} /></div><DialogTitle>Nova categoria</DialogTitle><DialogDescription>Crie uma categoria para organizar os produtos do estoque.</DialogDescription></DialogHeader><div className="expense-form"><label className="field-label">Nome da categoria<Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Ex.: Drinks" /></label><Button className="primary-wide" onClick={() => { if (categoryName.trim().length < 2) { toast.error("Informe um nome válido"); return; } createCategoryMutation.mutate({ name: categoryName.trim() }); }} disabled={createCategoryMutation.isPending}>{createCategoryMutation.isPending ? "Criando..." : "Criar categoria"}</Button></div></DialogContent></Dialog>

      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader><div className="dialog-icon"><Package size={20} /></div><DialogTitle>{editingProduct ? "Editar produto" : "Novo produto"}</DialogTitle><DialogDescription>Cadastre um item para lançar em comandas e acompanhar no estoque.</DialogDescription></DialogHeader>
          <div className="expense-form product-form-grid">
            <label className="field-label">Nome<Input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="Ex.: Gin tônica" /></label>
            <label className="field-label">Código<Input value={newProduct.code} onChange={(event) => setNewProduct({ ...newProduct, code: event.target.value })} placeholder="Ex.: DRK-001" /></label>
            <label className="field-label">Categoria<select value={newProduct.categoryId} onChange={(event) => setNewProduct({ ...newProduct, categoryId: Number(event.target.value) })}>{(categoriesQuery.data ?? [{ id: 1, name: "Cervejas" }, { id: 2, name: "Bebidas" }, { id: 6, name: "Narguilé" }]).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <div className="form-two-col"><label className="field-label">Custo (R$)<Input type="number" inputMode="decimal" value={newProduct.cost} onChange={(event) => setNewProduct({ ...newProduct, cost: event.target.value })} placeholder="0,00" /></label><label className="field-label">Venda (R$)<Input type="number" inputMode="decimal" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} placeholder="0,00" /></label></div>
            <div className="form-two-col"><label className="field-label">{editingProduct ? "Estoque atual (ajuste em Estoque)" : "Estoque inicial"}<Input type="number" inputMode="numeric" value={newProduct.stock} onChange={(event) => setNewProduct({ ...newProduct, stock: event.target.value })} placeholder="0" disabled={Boolean(editingProduct)} /></label><label className="field-label">Estoque mínimo<Input type="number" inputMode="numeric" value={newProduct.minimum} onChange={(event) => setNewProduct({ ...newProduct, minimum: event.target.value })} placeholder="0" /></label></div>
            <Button className="primary-wide" onClick={() => { const costCents = Math.round(Number(newProduct.cost.replace(",", ".")) * 100); const priceCents = Math.round(Number(newProduct.price.replace(",", ".")) * 100); if (!newProduct.name || !newProduct.code || !priceCents) { toast.error("Preencha nome, código e preço de venda"); return; } saveProductMutation.mutate({ id: editingProduct?.id, name: newProduct.name, code: newProduct.code, categoryId: newProduct.categoryId, unit: newProduct.unit, costCents, priceCents, ...(!editingProduct ? { stockQuantity: Math.max(0, Number(newProduct.stock) || 0) } : {}), minimumStock: Number(newProduct.minimum) || 0, active: true }); }} disabled={saveProductMutation.isPending}>{saveProductMutation.isPending ? "Salvando..." : editingProduct ? "Salvar alterações" : "Cadastrar produto"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="payment-dialog login-dialog">
          <DialogHeader><div className="dialog-icon"><Flame size={20} /></div><DialogTitle>Entrar no sistema</DialogTitle><DialogDescription>Use uma das credenciais fixas da operação.</DialogDescription></DialogHeader>
          <div className="expense-form">
            <label className="field-label">Usuário<Input autoComplete="username" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value.toLowerCase() })} placeholder="ex.: joao.silva" /></label>
            <label className="field-label">Senha<Input autoComplete="current-password" type="password" value={credentials.password} placeholder="Digite sua senha" onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} /></label>
            <Button className="primary-wide" onClick={() => localLoginMutation.mutate({ username: credentials.username, password: credentials.password })} disabled={localLoginMutation.isPending}>{localLoginMutation.isPending ? "Aguarde..." : "Entrar"}</Button>
          </div>
          <p className="local-access-note">Acesso local temporário. Use o usuário <b>atendente</b> ou <b>gerente</b>.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={userCreateOpen} onOpenChange={setUserCreateOpen}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><Users size={20} /></div><DialogTitle>Novo usuário</DialogTitle><DialogDescription>Crie um acesso independente para gerente, administrador ou atendente.</DialogDescription></DialogHeader>
          <div className="expense-form">
            <label className="field-label">Nome<Input autoFocus value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} placeholder="Ex.: Ana Souza" /></label>
            <label className="field-label">Usuário ou e-mail<Input autoComplete="username" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value.toLowerCase() })} placeholder="Ex.: ana.souza" /></label>
            <label className="field-label">Senha<Input autoComplete="new-password" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} placeholder="Mínimo de 12 caracteres" /></label>
            <label className="field-label">Perfil<select value={newUser.localRole} onChange={(event) => setNewUser({ ...newUser, localRole: event.target.value as any })}><option value="manager">Gerente</option><option value="administrator">Administrador</option><option value="attendant">Atendente</option></select></label>
            <Button className="primary-wide" disabled={createUserMutation.isPending} onClick={() => { if (newUser.name.trim().length < 2 || newUser.username.trim().length < 3 || newUser.password.length < 12) { toast.error("Preencha nome, login e uma senha com pelo menos 12 caracteres"); return; } createUserMutation.mutate(newUser); }}>{createUserMutation.isPending ? "Criando..." : "Criar usuário"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(baristaPrintOrder)} onOpenChange={(open) => { if (!open) setBaristaPrintOrder(null); }}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><Printer size={20} /></div><DialogTitle>Pedido lançado</DialogTitle><DialogDescription>Deseja imprimir este pedido para o barista preparar?</DialogDescription></DialogHeader>
          {baristaPrintOrder?.item && <div className="product-callout"><ReceiptText size={20} /><div><b>{baristaPrintOrder.item.quantity}x {baristaPrintOrder.item.productName}</b><span>Mesa {baristaPrintOrder.tab?.tableNumber} · {baristaPrintOrder.item.discountReason ? `${baristaPrintOrder.item.discountReason} · ${money(baristaPrintOrder.item.unitPriceCents)}` : money(baristaPrintOrder.item.unitPriceCents)}</span></div></div>}
          <Button className="primary-wide" onClick={printBaristaOrder} disabled={enqueuePrintMutation.isPending}>{enqueuePrintMutation.isPending ? <LoaderCircle className="launch-loader" size={17} /> : <Printer size={17} />} {enqueuePrintMutation.isPending ? "Enfileirando…" : "Imprimir para o barista"}</Button>
          <Button variant="outline" className="primary-wide" onClick={() => setBaristaPrintOrder(null)}>Não imprimir agora</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><WalletCards size={20} /></div><DialogTitle>Registrar pagamento</DialogTitle><DialogDescription>O pagamento é acumulativo e não encerra a comanda.</DialogDescription></DialogHeader>
          {activeTab && <div className="payment-summary"><div><span>Consumido</span><b>{money(activeTab.totalCents)}</b></div><div><span>Já pago</span><b>{money(activeTab.paidCents)}</b></div><div className="balance"><span>Saldo atual</span><b>{money(activeTab.balanceCents)}</b></div></div>}
          <label className="field-label">Valor a receber<Input type="number" inputMode="decimal" placeholder="0,00" value={paymentValue} onChange={(e) => setPaymentValue(e.target.value)} disabled={pendingOnlinePaymentForActiveTab} /></label>
          <div className="method-grid">{(Object.keys(methodLabel) as Method[]).map((method) => <button key={method} onClick={() => setPaymentMethod(method)} disabled={pendingOnlinePaymentForActiveTab} className={paymentMethod === method ? "method-active" : ""} aria-pressed={paymentMethod === method}>{method === "pix" ? <Zap size={19} /> : method === "cash" ? <Banknote size={19} /> : <CreditCard size={19} />}<span>{methodLabel[method]}</span>{paymentMethod === method && <small className="method-selected-label">Selecionado</small>}</button>)}</div>
          <Button variant="outline" className="primary-wide" onClick={printTab} disabled={!activeTab || payMutation.isPending || enqueuePrintMutation.isPending}><Printer size={17} /> {enqueuePrintMutation.isPending ? "Enfileirando…" : "Imprimir comanda"}</Button><Button className="primary-wide" onClick={processPayment} disabled={payMutation.isPending || (!cashIsOpen && !pendingOnlinePaymentForActiveTab)}>{payMutation.isPending ? "Registrando..." : pendingOnlinePaymentForActiveTab ? "Confirmar pagamento pendente" : "Confirmar pagamento"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={(open) => { setTransferOpen(open); if (!open) setTransferDestination(null); }}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><ArrowRightLeft size={20} /></div><DialogTitle>Transferir comanda</DialogTitle><DialogDescription>Escolha uma mesa livre. Todos os itens e pagamentos permanecem na comanda.</DialogDescription></DialogHeader>
          <label className="field-label">Mesa de destino<select value={transferDestination ?? ""} onChange={(event) => setTransferDestination(event.target.value ? Number(event.target.value) : null)}><option value="">Selecione uma mesa livre</option>{tables.filter((table: any) => table.status === "free").map((table: any) => <option key={table.id} value={table.id}>Mesa {String(table.number).padStart(2, "0")}</option>)}</select></label>
          <Button className="primary-wide" disabled={!transferDestination || transferMutation.isPending || !activeTab} onClick={() => { if (activeTab && transferDestination) requireAuth(() => transferMutation.mutate({ tabId: activeTab.id, destinationTableId: transferDestination })); }}>{transferMutation.isPending ? "Transferindo..." : "Confirmar transferência"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={customerNameOpen} onOpenChange={setCustomerNameOpen}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><Users size={20} /></div><DialogTitle>Nome da mesa</DialogTitle><DialogDescription>Informe qualquer nome para identificar quem está usando esta mesa. Não é necessário cadastrar cliente, CPF ou telefone.</DialogDescription></DialogHeader>
          <label className="field-label">Nome para identificar a mesa<Input autoFocus maxLength={120} value={customerNameInput} onChange={(event) => setCustomerNameInput(event.target.value)} placeholder="Ex.: João, Aniversário da Ana, Mesa da empresa..." onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveTableName(); } }} /></label>
          <Button className="primary-wide" disabled={customerNameMutation.isPending || !activeTab} onClick={saveTableName}>{customerNameMutation.isPending ? "Salvando..." : "Salvar nome da mesa"}</Button>
          {activeTab?.customerName && <Button type="button" variant="outline" className="primary-wide" disabled={customerNameMutation.isPending} onClick={() => { setCustomerNameInput(""); if (activeTab.id < 0) { updateOfflineTab(activeTab, (current) => ({ ...current, customerName: null })); setCustomerNameOpen(false); toast.success("Nome removido da mesa"); } else customerNameMutation.mutate({ tabId: activeTab.id, customerName: null }); }}>Remover nome</Button>}
        </DialogContent>
      </Dialog>
      <Dialog open={noteOpen} onOpenChange={(open) => { setNoteOpen(open); if (!open) { setPendingProduct(null); setItemNote(""); setLaunchQuantity("1"); } }}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><FileText size={20} /></div><DialogTitle>Quantidade e observação</DialogTitle><DialogDescription>{pendingProduct ? `Informe a quantidade e, se necessário, uma observação para ${pendingProduct.name} · Preço: ${money(pendingProduct.priceCents)}.` : "Informe a quantidade e, se necessário, uma observação para o produto."}</DialogDescription></DialogHeader>
          <label className="field-label">Quantidade<Input autoFocus type="number" inputMode="numeric" min="1" max="999" value={launchQuantity} onChange={(event) => setLaunchQuantity(event.target.value)} /></label>
          <label className="field-label">Observação (opcional)<Textarea maxLength={500} value={itemNote} onChange={(event) => setItemNote(event.target.value)} placeholder="Ex.: sem gelo, sabor menta, entregar depois..." /></label>
          <Button className="primary-wide" disabled={addItemMutation.isPending || !pendingProduct} onClick={confirmAddProduct}>{addItemMutation.isPending ? "Adicionando..." : "Adicionar à comanda"}</Button>
        </DialogContent>
      </Dialog>

      <Sheet open={stockSheet} onOpenChange={setStockSheet}><SheetContent className="stock-sheet"><SheetHeader><SheetTitle>Ajustar estoque</SheetTitle></SheetHeader>{stockProduct && <div className="sheet-form"><div className="product-callout"><Package size={20} /><div><b>{stockProduct.name}</b><span>Disponível: {stockProduct.stockQuantity} un</span></div></div><label className="field-label">Movimentação<div className="direction-toggle"><button className={stockDirection === "in" ? "selected" : ""} onClick={() => setStockDirection("in")}><ArrowUpRight size={17} /> Entrada</button><button className={stockDirection === "out" ? "selected" : ""} onClick={() => setStockDirection("out")}><ArrowDownRight size={17} /> Saída</button></div></label><label className="field-label">Quantidade<Input type="number" inputMode="numeric" value={stockQty} onChange={(e) => setStockQty(e.target.value)} /></label><Button className="primary-wide" onClick={() => requireAuth(() => stockMutation.mutate({ productId: stockProduct.id, quantity: Number(stockQty), direction: stockDirection, reason: stockDirection === "in" ? "Reposição manual" : "Ajuste manual" }))}>Confirmar movimentação</Button></div>}</SheetContent></Sheet>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}><DialogContent><DialogHeader><div className="dialog-icon"><ReceiptText size={20} /></div><DialogTitle>Nova despesa</DialogTitle><DialogDescription>A despesa será incluída no Financeiro; se paga em dinheiro, também será abatida do caixa aberto.</DialogDescription></DialogHeader><div className="expense-form"><label className="field-label">Descrição<Input value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} placeholder="Ex.: compra de gelo" /></label><label className="field-label">Categoria<select value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>{expensesCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field-label">Forma de pagamento<select value={expense.method} onChange={(e) => setExpense({ ...expense, method: e.target.value as Method })}>{Object.entries(methodLabel).filter(([value]) => value !== "cash" || hasFeatureAccess("cash")).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Valor<Input type="number" inputMode="decimal" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} placeholder="0,00" /></label><label className="field-label">Observação<Textarea value={expense.notes} onChange={(e) => setExpense({ ...expense, notes: e.target.value })} placeholder="Opcional" /></label><Button className="primary-wide" disabled={!cashIsOpen || expenseMutation.isPending} onClick={() => { const amountCents = Math.round(Number(expense.amount.replace(",", ".")) * 100); if (!cashIsOpen) { toast.error("Abra o caixa antes de registrar despesas."); return; } if (!expense.description || !amountCents) { toast.error("Preencha descrição e valor"); return; } expenseMutation.mutate({ description: expense.description, category: expense.category, amountCents, method: expense.method, notes: expense.notes, occurredAt: new Date() }); }}>Registrar despesa</Button></div></DialogContent></Dialog>
      {updateTableLimitMutation.isPending ? <div className="request-lock"><LoaderCircle className="launch-loader" size={21} /><span>Salvando a quantidade de mesas...</span></div> : null}
    </div>
  );
}

function LoginScreen({ credentials, setCredentials, passwordVisible, setPasswordVisible, mutation }: any) {
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate({ username: credentials.username, password: credentials.password }); };
  return <main className="login-screen"><section className="login-visual"><div className="login-visual-glow" /><img src="/shadow-lounge-icon-white.png" alt="Shadow Lounge" /><span>Gestão elegante para uma operação sob controle.</span></section><section className="login-card-shell"><div className="login-card-content"><div className="login-brand"><img src="/shadow-lounge-icon-white.png" alt="Shadow Lounge" /><div><strong>SHADOW LOUNGE</strong><span>GESTÃO & OPERAÇÃO</span></div></div><div className="login-heading"><span className="section-kicker">ACESSO AO SISTEMA</span><h1>Bem-vindo de volta.</h1><p>Entre com seu usuário para acessar sua área de trabalho.</p></div><form className="login-form" onSubmit={submit}><label className="field-label">Usuário<Input autoFocus autoComplete="username" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value.toLowerCase() })} placeholder="seu.usuario" /></label><label className="field-label">Senha<div className="password-field"><Input autoComplete="current-password" type={passwordVisible ? "text" : "password"} value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} placeholder="Digite sua senha" /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? "Ocultar senha" : "Exibir senha"}>{passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{mutation.error ? <div className="login-error" role="alert"><AlertTriangle size={16} /> {mutation.error.data?.code === "UNAUTHORIZED" ? "Usuário ou senha inválidos. Use o nome de usuário cadastrado, não o e-mail." : "Não foi possível autenticar no servidor. Verifique a conexão e o banco de dados; tente novamente mais tarde."}</div> : null}<Button type="submit" className="primary-wide login-submit" disabled={mutation.isPending || !credentials.username || !credentials.password}>{mutation.isPending ? "Entrando..." : "Entrar no sistema"}<ArrowUpRight size={17} /></Button></form><p className="login-footer">Acesso seguro · Shadow Lounge</p></div></section></main>;
}

function Dashboard({ dashboard, occupiedCount, tableCount, onNavigate }: { dashboard: any; occupiedCount: number; tableCount: number; onNavigate: (page: Page) => void }) {
  const cards = [
    { label: "Faturamento recebido", value: money(dashboard.paidCents), icon: TrendingUp, tone: "amber", detail: "Pagamentos registrados nos últimos 30 dias" },
    { label: "Resultado financeiro", value: money(dashboard.resultCents), icon: WalletCards, tone: "green", detail: "Recebimentos − custos − despesas" },
    { label: "Comandas abertas", value: String(dashboard.openTabs), icon: ReceiptText, tone: "violet", detail: `${money(dashboard.pendingCents)} pendentes` },
    { label: "Mesas ocupadas", value: `${occupiedCount}/${tableCount}`, icon: Table2, tone: "blue", detail: "Atendimento em andamento" },
  ];
  const dailyRevenue = Array.isArray(dashboard.dailyRevenue) ? dashboard.dailyRevenue : [];
  const maxDailyRevenue = Math.max(0, ...dailyRevenue.map((point: any) => point.totalCents));
  const chartAxis = [dailyRevenue[0], dailyRevenue[Math.floor((dailyRevenue.length - 1) / 2)], dailyRevenue[dailyRevenue.length - 1]];
  return <div className="dashboard-page"><section className="page-intro"><div><span className="section-kicker">PANORAMA DOS ÚLTIMOS 30 DIAS</span><h2>Operação sob controle.</h2><p>Receitas, comandas e estoque em uma única visão.</p></div><Button onClick={() => onNavigate("tables")}><Table2 size={17} /> Ir para mesas</Button></section><section className="metric-grid">{cards.map((card) => { const Icon = card.icon; return <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><Icon size={21} /></div><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>})}</section><section className="dashboard-grid"><article className="panel revenue-panel"><div className="panel-header"><div><span className="section-kicker">RECEITA</span><h3>Fluxo do período</h3></div><Badge variant="outline">30 dias</Badge></div><div className="bar-chart" aria-label="Recebimentos por dia nos últimos 30 dias">{dailyRevenue.map((point: any, i: number) => { const height = maxDailyRevenue ? Math.max(3, point.totalCents / maxDailyRevenue * 100) : 3; return <div key={point.dateKey} className={i === dailyRevenue.length - 1 ? "bar hot" : "bar"} style={{ height: `${height}%` }} title={`${point.label}: ${money(point.totalCents)}`} aria-label={`${point.label}: ${money(point.totalCents)}`} />; })}</div><div className="chart-axis">{chartAxis.map((point: any, index: number) => <span key={`${point?.dateKey ?? "empty"}-${index}`}>{point ? point.label.replace(/\.$/, "").toLocaleUpperCase("pt-BR") : ""}</span>)}</div></article><article className="panel"><div className="panel-header"><div><span className="section-kicker">PAGAMENTOS</span><h3>Por forma de pagamento</h3></div></div><div className="payment-bars">{dashboard.paymentMethods.filter((item: any) => item.totalCents > 0).map((item: any) => <div key={item.method}><div><span>{methodLabel[item.method as Method]}</span><b>{money(item.totalCents)}</b></div><i><em style={{ width: `${Math.max(8, Math.round(item.totalCents / dashboard.paidCents * 100))}%` }} /></i></div>)}</div></article><article className="panel products-panel"><div className="panel-header"><div><span className="section-kicker">DESEMPENHO</span><h3>Mais vendidos</h3></div><button onClick={() => onNavigate("reports")}>Ver relatório <ArrowUpRight size={14} /></button></div><div className="rank-list">{dashboard.topProducts.map((product: any, index: number) => <div key={product.name}><b>0{index + 1}</b><span>{product.name}<small>{product.quantity} unidades</small></span><strong>{money(product.totalCents)}</strong></div>)}</div></article><article className="panel alert-panel"><div className="alert-icon"><AlertTriangle size={22} /></div><div><span className="section-kicker">{dashboard.lowStock ? "ATENÇÃO NECESSÁRIA" : "ESTOQUE EM DIA"}</span><h3>{dashboard.lowStock} {dashboard.lowStock === 1 ? "produto com estoque baixo" : "produtos com estoque baixo"}</h3><p>{dashboard.lowStockProducts?.length ? dashboard.lowStockProducts.map((product: any) => `${product.name} (${product.stockQuantity} / mín. ${product.minimumStock})`).join(" · ") + (dashboard.lowStock > dashboard.lowStockProducts.length ? ` · +${dashboard.lowStock - dashboard.lowStockProducts.length} outros` : "") : "Nenhum produto ativo está abaixo do nível mínimo."}</p><button onClick={() => onNavigate("stock")}>Revisar estoque <ArrowUpRight size={15} /></button></div></article></section></div>;
}

function TablesGrid({ tables, onSelect, isOpening }: { tables: any[]; onSelect: (table: any) => void; isOpening: boolean }) {
  const [filter, setFilter] = useState<"all" | "free" | "occupied">("all");
  const visible = tables.filter((table) => filter === "all" || filter === "free" ? filter === "all" || table.status === "free" : table.status !== "free");
  const freeCount = tables.filter((table) => table.status === "free").length;
  return <div className="tables-page"><section className="tables-heading"><div><span className="section-kicker">ATENDIMENTO RÁPIDO</span><h2>Selecione uma mesa</h2><p>{freeCount} livres · {tables.length - freeCount} em atendimento</p></div><div className="table-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <b>{tables.length}</b></button><button className={filter === "occupied" ? "active" : ""} onClick={() => setFilter("occupied")}>Ocupadas <b>{tables.length - freeCount}</b></button><button className={filter === "free" ? "active" : ""} onClick={() => setFilter("free")}>Livres <b>{freeCount}</b></button></div></section><div className="tables-grid">{visible.map((table) => <button key={table.id} className={`table-card table-${table.status}`} onClick={() => onSelect(table)}><div className="table-card-head"><span>MESA</span><b>{String(table.number).padStart(2, "0")}</b><i className={`status-dot ${table.status}`} /></div>{table.status === "free" ? <div className="free-table"><span>Disponível</span><strong><Plus size={16} /> Abrir comanda</strong></div> : <div className="busy-table"><div className="table-status"><span className={table.status}>{table.status === "partial" ? "Pagamento parcial" : "Em atendimento"}</span><small>{table.customerName || table.tabCode}</small></div><div className="table-totals"><span><small>Consumido</small><b>{money(table.totalCents)}</b></span><span><small>Saldo</small><b>{money(table.balanceCents)}</b></span></div><div className="table-time"><Clock3 size={14} /> Aberta {dateTime(table.openedAt)}</div></div>}</button>)}</div>{isOpening ? <div className="saving-indicator">Abrindo comanda...</div> : null}</div>;
}

function TabDetail({ tab, products, search, setSearch, tipEnabled, setTipEnabled, onApplyCharges, onBack, onName, onPrint, onAdd, onPrintBarista, launchingProductIds, updatingItemId, onQuantity, onPayment, onTransfer, onClose, canAdjustTotal, onAdjustTotal, cashOpen, canRetryPendingPayment, currentUserName, loading }: any) {
  const [targetTotal, setTargetTotal] = useState((tab.totalCents / 100).toFixed(2));
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [quantityEditDialog, setQuantityEditDialog] = useState<{ item: any; direction: "add" | "remove" } | null>(null);
  const [quantityEditAmount, setQuantityEditAmount] = useState("1");
  const openQuantityEditDialog = (item: any, direction: "add" | "remove") => {
    setQuantityEditAmount("1");
    setQuantityEditDialog({ item, direction });
  };
  const applyQuantityEdit = () => {
    if (!quantityEditDialog) return;
    const amount = Number(quantityEditAmount);
    if (!Number.isSafeInteger(amount) || amount < 1) { toast.error("Informe uma quantidade inteira maior que zero."); return; }
    if (quantityEditDialog.direction === "remove" && amount > quantityEditDialog.item.quantity) {
      toast.error(`Só é possível retirar até ${quantityEditDialog.item.quantity} unidade(s) deste produto.`);
      return;
    }
    const nextQuantity = quantityEditDialog.item.quantity + (quantityEditDialog.direction === "add" ? amount : -amount);
    onQuantity(quantityEditDialog.item.id, nextQuantity);
    setQuantityEditDialog(null);
  };
  useEffect(() => { setTargetTotal((tab.totalCents / 100).toFixed(2)); }, [tab.id, tab.totalCents]);
  const submitAdjustment = () => {
    const amount = Number(targetTotal.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Informe um total válido"); return; }
    if (adjustmentReason.trim().length < 5) { toast.error("A justificativa deve ter pelo menos 5 caracteres"); return; }
    onAdjustTotal(Math.round(amount * 100), adjustmentReason.trim());
  };
  return <div className="tab-page">{!cashOpen && <div className="cash-gate-banner"><Banknote size={20} /><span><b>Caixa fechado.</b> Esta comanda permanece aberta; lançamentos, alterações e novos pagamentos ficam bloqueados até abrir o caixa.{canRetryPendingPayment ? " Um pagamento pendente pode ser reenviado apenas para confirmar se já foi registrado." : ""}</span></div>}<div className="tab-topline"><button className="back-button" onClick={onBack} disabled={loading}><ChevronLeft size={18} /> Voltar às mesas</button><div className="tab-topline-actions"><span><span className="live-dot" /> Comanda aberta</span><Button variant="outline" onClick={onPrint} disabled={loading}><Printer size={16} /> Imprimir</Button><Button variant="outline" onClick={onName} disabled={loading}><Pencil size={16} /> {tab.customerName ? tab.customerName : "Atribuir nome"}</Button><Button variant="outline" onClick={onTransfer} disabled={loading}><ArrowRightLeft size={16} /> Transferir mesa</Button></div></div><section className="tab-hero"><div><span className="section-kicker">MESA {String(tab.tableNumber).padStart(2, "0")}</span><h2>Comanda <em>{tab.tabCode}</em></h2><p>{tab.customerName ? `Cliente: ${tab.customerName} · ` : ""}Aberta por {tab.openedByName || "Operador"} · {dateTime(tab.openedAt)}</p></div><div className="tab-hero-total"><span>Saldo atual</span><strong>{money(tab.balanceCents)}</strong><small>Subtotal {money(tab.subtotalCents ?? tab.totalCents)} · Pago {money(tab.paidCents)}</small></div></section><div className="tab-layout"><section className="panel order-panel"><div className="panel-header"><div><span className="section-kicker">ITENS DA COMANDA</span><h3>{tab.items.length} itens lançados</h3></div><ReceiptText size={19} /></div><div className="order-items">{tab.items.map((item: any) => <div className={`order-item ${item.discountReason ? "order-item-promotional" : ""}`} key={item.id}><div className="item-quantity"><button disabled={loading || !cashOpen || item.quantity === 0} onClick={() => openQuantityEditDialog(item, "remove")} aria-label={`Retirar unidades de ${item.productName}`} title="Informar quantidade para retirar">−</button><b>{updatingItemId === item.id ? <LoaderCircle className="launch-loader" size={15} /> : `${item.quantity}x`}</b><button disabled={loading || !cashOpen} onClick={() => openQuantityEditDialog(item, "add")} aria-label={`Adicionar unidades de ${item.productName}`} title="Informar quantidade para adicionar">+</button></div><div className="order-item-product"><div className="order-item-product-head"><strong>{item.productName}</strong><button type="button" className="item-print-button" onClick={() => onPrintBarista(item)} disabled={loading} aria-label={`Imprimir ${item.productName} para o barista`} title="Imprimir para o barista"><Printer size={14} /></button></div><small>Lançado por: {item.addedByName || currentUserName || "Operador"}</small>{item.createdAt && <small>Adicionado às {formatTimeInSaoPaulo(item.createdAt)}</small>}{item.discountReason && <div className="promotion-price-note"><span className="promotion-badge">PROMOÇÃO</span><small>{item.discountReason}</small><small>{money(item.baseUnitPriceCents)} <span aria-hidden="true">→</span> {money(item.unitPriceCents)} por unidade</small></div>}{item.note && <small>Obs.: {item.note}</small>}</div><b>{money(item.quantity * item.unitPriceCents)}</b></div>)}</div><div className="order-total"><span>SUBTOTAL</span><b>{money(tab.subtotalCents ?? tab.totalCents)}</b><span>GORJETA {tab.tipPercent ? `(${tab.tipPercent}%)` : ""}</span><b>{money(tab.tipCents ?? 0)}</b>{tab.manualAdjustmentCents ? <><span>AJUSTE MANUAL</span><b>{money(tab.manualAdjustmentCents)}</b></> : null}<span>PAGAMENTOS</span><b className="paid">− {money(tab.paidCents)}</b><strong>TOTAL / SALDO</strong><strong>{money(tab.totalCents)} / {money(tab.balanceCents)}</strong></div></section><aside className="products-panel-side"><div className="panel product-picker"><div className="panel-header"><div><span className="section-kicker">TOTAL DA COMANDA</span><h3>Gorjeta do garçom</h3></div><WalletCards size={19} /></div><div className="charge-box"><div className="mode-block"><span className="mode-title">Gorjeta do garçom</span><label className="checkbox-line"><input type="checkbox" checked={tipEnabled} onChange={(e) => setTipEnabled(e.target.checked)} disabled={loading || !cashOpen} /><span>Adicionar 10% ao total</span></label></div></div>{canAdjustTotal && <div className="manual-adjustment-box"><div><span className="mode-title">Ajuste manual do total</span><small>Requer justificativa; a alteração fica registrada na auditoria.</small></div><label className="field-label">Novo total (R$)<Input type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={targetTotal} onChange={(event) => setTargetTotal(event.target.value)} disabled={loading || !cashOpen} /></label><label className="field-label">Justificativa obrigatória<Textarea maxLength={500} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Explique o motivo do ajuste" disabled={loading || !cashOpen} /></label>{tab.adjustmentReason && <small className="adjustment-current-note">Último ajuste: {tab.adjustmentReason}</small>}<Button variant="outline" className="primary-wide" onClick={submitAdjustment} disabled={loading || !cashOpen || adjustmentReason.trim().length < 5}>Aplicar novo total</Button></div>}<div className="panel-header product-header"><div><span className="section-kicker">LANÇAMENTO RÁPIDO</span><h3>Adicionar produto</h3></div><Beer size={19} /></div><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou código" disabled={loading} /></div><div className="quick-products">{products.slice(0, 7).map((product: any) => <div className="quick-product-row" key={product.id}><button className="quick-product-add" onClick={() => onAdd(product)} disabled={loading || !cashOpen || launchingProductIds.has(product.id) || !product.active}><span><b>{product.name}</b><small>{product.categoryName || "Outros"} · {product.stockQuantity} un · {money(product.priceCents)}</small></span><strong>{launchingProductIds.has(product.id) ? <LoaderCircle className="launch-loader" size={15} /> : <i><Plus size={15} /></i>}</strong></button></div>)}</div></div><div className="payment-actions"><Button variant="outline" className="pay-button" onClick={onPayment} disabled={loading || (!cashOpen && !canRetryPendingPayment) || (tab.balanceCents === 0 && !canRetryPendingPayment)}><WalletCards size={18} /> {canRetryPendingPayment ? "Confirmar pagamento pendente" : tab.balanceCents ? "Receber pagamento" : "Saldo quitado"}</Button><Button className="close-button" onClick={onClose} disabled={loading || tab.balanceCents !== 0 || canRetryPendingPayment}><ShieldCheck size={18} /> Encerrar comanda</Button><small>{canRetryPendingPayment ? "Confirme o pagamento pendente antes de encerrar a comanda." : "O encerramento só é liberado quando o saldo for R$ 0,00."}</small></div></aside></div><section className="panel launch-history-panel"><div className="panel-header"><div><span className="section-kicker">RASTREABILIDADE</span><h3>Histórico de lançamentos</h3></div><ClipboardList size={19} /></div>{(tab.launchHistory || []).length ? <div className="launch-history-list">{tab.launchHistory.map((entry: any) => <div className="launch-history-row" key={entry.id}><span className="audit-action">{entry.action === "ADD_ITEM" ? "LANÇAMENTO" : entry.action === "REMOVE_ITEM" ? "EXCLUSÃO" : "ALTERAÇÃO"}</span><p>{entry.description}<small>{entry.userName || "Operador"} · {dateTime(entry.createdAt)}</small></p></div>)}</div> : <p className="empty-inline">Nenhum lançamento auditado nesta comanda.</p>}</section><section className="panel payments-history"><div className="panel-header"><div><span className="section-kicker">HISTÓRICO PRESERVADO</span><h3>Pagamentos da comanda</h3></div></div>{tab.payments.length === 0 ? <p className="empty-inline">Nenhum pagamento registrado até o momento.</p> : <div>{tab.payments.map((payment: any) => <div className="payment-row" key={payment.id}><div className="payment-row-icon">{payment.method === "pix" ? <Zap size={17} /> : <CreditCard size={17} />}</div><span><b>{methodLabel[payment.method as Method]}</b><small>{payment.receivedByName || "Operador"} · {dateTime(payment.createdAt)}</small></span><strong>{money(payment.amountCents)}</strong></div>)}</div>}</section><Dialog open={Boolean(quantityEditDialog)} onOpenChange={(open) => { if (!open) setQuantityEditDialog(null); }}><DialogContent className="payment-dialog"><DialogHeader><div className="dialog-icon"><Package size={20} /></div><DialogTitle>{quantityEditDialog?.direction === "add" ? "Adicionar unidades" : "Retirar unidades"}</DialogTitle><DialogDescription>{quantityEditDialog?.item?.productName ? `${quantityEditDialog.item.productName} · quantidade atual: ${quantityEditDialog.item.quantity}` : "Informe a quantidade desejada."}</DialogDescription></DialogHeader><label className="field-label">Quantidade para {quantityEditDialog?.direction === "add" ? "adicionar" : "retirar"}<Input autoFocus type="number" min="1" max={quantityEditDialog?.direction === "remove" ? quantityEditDialog.item.quantity : undefined} step="1" inputMode="numeric" value={quantityEditAmount} onChange={(event) => setQuantityEditAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyQuantityEdit(); }} disabled={loading} /></label>{quantityEditDialog && <p className="empty-inline">Nova quantidade na comanda: <b>{quantityEditDialog.item.quantity + (quantityEditDialog.direction === "add" ? Math.max(0, Number(quantityEditAmount) || 0) : -Math.max(0, Number(quantityEditAmount) || 0))}</b></p>}<div className="dialog-actions"><Button variant="outline" onClick={() => setQuantityEditDialog(null)}>Cancelar</Button><Button onClick={applyQuantityEdit} disabled={loading}>{quantityEditDialog?.direction === "add" ? "Adicionar" : "Retirar"}</Button></div></DialogContent></Dialog></div>;
}

function PrinterJobRows({ jobs }: { jobs: Array<{ id: number; kind: string; status: string; createdAt: Date; lastError: string | null }> }) {
  const statusLabels: Record<string, string> = { queued: "Na fila", processing: "Imprimindo", printed: "Aceito pelo Windows", failed: "Falha", uncertain: "Verificar impressora" };
  const kindLabels: Record<string, string> = { tab: "Comanda", barista: "Barista", cash: "Resumo de caixa" };
  return <div className="cash-payment-list">{jobs.map((job) => <div className="cash-payment-row" key={job.id}><span><b>#{job.id} · {kindLabels[job.kind] ?? job.kind}</b><small>{dateTime(job.createdAt)}</small>{job.lastError && <small className="cash-error-text">{job.lastError}</small>}</span><strong>{statusLabels[job.status] ?? job.status}</strong></div>)}</div>;
}

function CustomersPage({ customers, onNew, onDelete }: { customers: any[]; onNew: () => void; onDelete: (id: number) => void }) {
  return <div className="products-page"><section className="page-intro"><div><span className="section-kicker">RELACIONAMENTO</span><h2>Clientes cadastrados.</h2><p>Cadastre clientes para atribuir opcionalmente suas comandas ao CPF.</p></div><Button onClick={onNew}><Plus size={17} /> Novo cliente</Button></section><section className="panel inventory-panel"><div className="inventory-toolbar"><Badge variant="outline">{customers.length} clientes ativos</Badge></div><div className="inventory-table"><div className="inventory-head"><span>Cliente</span><span>CPF</span><span>Contato</span><span>Observações</span><span>Ações</span></div>{customers.length ? customers.map((customer) => <div className="inventory-row" key={customer.id}><span><b>{customer.name}</b><small>Cadastrado em {dateTime(customer.createdAt)}</small></span><span><b>{customer.cpf}</b></span><span>{customer.phone || "—"}</span><span>{customer.notes || "—"}</span><span className="row-actions"><button onClick={() => onDelete(customer.id)} aria-label="Desativar cliente" title="Desativar cliente"><Trash2 size={16} /></button></span></div>) : <p className="empty-inline">Nenhum cliente cadastrado.</p>}</div></section></div>;
}

function ProductsPage({ products, onNew, onEdit, onDelete, onToggleActive, onNewCategory }: { products: any[]; onNew: () => void; onEdit: (product: any) => void; onDelete: (id: number) => void; onToggleActive: (id: number, active: boolean) => void; onNewCategory: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = products.filter((product) => `${product.name} ${product.code} ${product.categoryName ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="products-page"><section className="page-intro"><div><span className="section-kicker">CATÁLOGO</span><h2>Produtos do lounge.</h2><p>Cadastre e mantenha o catálogo usado nas comandas.</p></div><div className="toolbar-actions"><Button variant="outline" onClick={onNewCategory}><Plus size={17} /> Nova categoria</Button><Button onClick={onNew}><Plus size={17} /> Novo produto</Button></div></section><section className="panel inventory-panel"><div className="inventory-toolbar"><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome, código ou categoria" /></div><Badge variant="outline">{filtered.length} produtos</Badge></div><div className="inventory-table"><div className="inventory-head"><span>Produto</span><span>Categoria</span><span>Preço</span><span>Status</span><span>Ações</span></div>{filtered.map((product) => <div className="inventory-row" key={product.id}><span><b>{product.name}</b><small>{product.code}</small></span><span><Badge variant="outline">{product.categoryName || "Sem categoria"}</Badge></span><span><b>{money(product.priceCents)}</b><small>custo {money(product.costCents)}</small></span><span><Badge variant={product.active ? "default" : "secondary"}>{product.active ? "Ativo" : "Inativo"}</Badge></span><span className="row-actions"><button onClick={() => onEdit(product)} aria-label="Editar produto"><Pencil size={16} /></button>{product.active ? <button onClick={() => onDelete(product.id)} aria-label="Desativar produto"><Trash2 size={16} /></button> : <button onClick={() => onToggleActive(product.id, true)} aria-label="Ativar produto" title="Ativar produto"><Plus size={16} /></button>}</span></div>)}</div></section></div>;
}

function StockPage({ products, movements, movementTotal, movementPage, movementTotalPages, onMovementPageChange, movementProduct, onMovementProductChange, movementsLoading, movementsError, movementPeriod, onPeriodChange, movementFrom, onMovementFromChange, movementTo, onMovementToChange, onRefreshMovements, onAdjust }: {
  products: any[];
  movements: any[];
  movementTotal: number;
  movementPage: number;
  movementTotalPages: number;
  onMovementPageChange: (page: number) => void;
  movementProduct: string;
  onMovementProductChange: (productId: string) => void;
  movementsLoading: boolean;
  movementsError?: string;
  movementPeriod: "2" | "3" | "7" | "30" | "90" | "all" | "custom";
  onPeriodChange: (period: "2" | "3" | "7" | "30" | "90" | "all" | "custom") => void;
  movementFrom: string;
  onMovementFromChange: (date: string) => void;
  movementTo: string;
  onMovementToChange: (date: string) => void;
  onRefreshMovements: () => void;
  onAdjust: (product: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const filtered = products.filter((product) => product.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const reportRows = products.filter((product) => `${product.name} ${product.code}`.toLocaleLowerCase().includes(reportSearch.toLocaleLowerCase()));
  const reportCostTotalCents = reportRows.reduce((total, product) => total + Number(product.stockQuantity ?? 0) * Number(product.costCents ?? 0), 0);
  const reportPriceTotalCents = reportRows.reduce((total, product) => total + Number(product.stockQuantity ?? 0) * Number(product.priceCents ?? 0), 0);
  const reportStockQuantity = reportRows.reduce((total, product) => total + Number(product.stockQuantity ?? 0), 0);
  const low = products.filter((product) => product.active && product.stockQuantity <= product.minimumStock);

  return <div className="stock-page">
    <section className="stock-hero"><div><span className="section-kicker">INVENTÁRIO EM TEMPO REAL</span><h2>Controle o que mantém o lounge aceso.</h2><p>Baixas automáticas por comanda e ajustes auditáveis.</p></div><div className="stock-summary"><span><Package size={18} /><b>{products.filter((product) => product.active).length}</b> produtos ativos</span><span className="low"><AlertTriangle size={18} /><b>{low.length}</b> em alerta</span></div></section>
    <section className="panel stock-valuation-panel">
      <div className="stock-valuation-toolbar"><div className="search-field"><Search size={18} /><input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="Buscar por item ou código" /></div></div>
      <div className="stock-valuation-overview"><h3>Todos os produtos</h3><span>{reportRows.length} {reportRows.length === 1 ? "Produto" : "Produtos"}</span></div>
      <div className="stock-valuation-metrics-scroll"><div className="stock-valuation-summary">
        <article><span>Custo total</span><strong>{money(reportCostTotalCents)}</strong></article>
        <article><span>Preço total</span><strong>{money(reportPriceTotalCents)}</strong></article>
        <article><span>Estoque atual</span><strong>{new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(reportStockQuantity)}</strong></article>
      </div></div>
      {reportRows.length ? <div className="stock-valuation-scroll"><table className="stock-valuation-table" aria-label="Produtos e valores do estoque atual"><tbody>{reportRows.map((product) => {
        const quantity = Number(product.stockQuantity ?? 0);
        const totalCost = money(quantity * Number(product.costCents ?? 0));
        return <tr key={product.id}><td><div className="stock-valuation-product-title"><b title={product.name}>{product.name}</b><span>{product.code}</span></div><div className="stock-valuation-product-details"><span>Custo total: {totalCost}</span><span>Estoque atual: {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(quantity)}</span></div></td></tr>;
      })}</tbody></table></div> : <p className="empty-inline stock-valuation-empty">{products.length ? "Nenhum produto corresponde à busca." : "Nenhum produto cadastrado."}</p>}
    </section>
    {low.length > 0 && <section className="low-stock-strip"><AlertTriangle size={20} /><div><b>Estoque baixo identificado</b><span>{low.map((item) => `${item.name} (${item.stockQuantity} un)`).join(" · ")}</span></div></section>}
    <section className="panel inventory-panel stock-products-panel"><div className="inventory-toolbar"><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no estoque" /></div></div><div className="stock-products-scroll"><div className="inventory-table"><div className="inventory-head"><span>Produto</span><span>Categoria</span><span>Estoque</span><span>Preço de venda</span><span /></div>{filtered.map((product) => <div className="inventory-row" key={product.id}><span><b>{product.name}</b><small>{product.code}</small></span><span><Badge variant="outline">{product.categoryName || "Sem categoria"}</Badge></span><span><b className={product.stockQuantity <= product.minimumStock ? "danger" : ""}>{product.stockQuantity} un</b><small>mín. {product.minimumStock}</small></span><span><b>{money(product.priceCents)}</b><small>custo {money(product.costCents)}</small></span><button onClick={() => onAdjust(product)}>Ajustar</button></div>)}</div></div></section>
    <section className="panel stock-movements-panel">
      <div className="stock-movements-heading">
        <div><span className="section-kicker">RASTREABILIDADE DO ESTOQUE</span><h3>Registro de entradas e saídas</h3><p>Histórico completo com paginação, filtrado pelo período e produto selecionados.</p></div>
        <div className="stock-movement-controls">
          <label className="stock-movement-filter">Período<select value={movementPeriod} onChange={(event) => onPeriodChange(event.target.value as typeof movementPeriod)}>
            <option value="2">Últimos 2 dias</option><option value="3">Últimos 3 dias</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Personalizado</option><option value="all">Todo o período</option>
          </select></label>
          <label className="stock-movement-filter">Produto<select value={movementProduct} onChange={(event) => onMovementProductChange(event.target.value)}>
            <option value="all">Todos os produtos</option>{products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}
          </select></label>
          {movementPeriod === "custom" && <div className="stock-movement-date-range">
            <label className="stock-movement-filter">De<input type="date" value={movementFrom} max={movementTo || undefined} onChange={(event) => onMovementFromChange(event.target.value)} /></label>
            <label className="stock-movement-filter">Até<input type="date" value={movementTo} min={movementFrom || undefined} onChange={(event) => onMovementToChange(event.target.value)} /></label>
          </div>}
          <button type="button" className="movement-refresh" onClick={onRefreshMovements} disabled={movementsLoading}>{movementsLoading ? "Carregando…" : "Atualizar"}</button>
        </div>
      </div>
      {!movementsError && <p className="movement-result-count">{movementsLoading ? "Buscando registros do período…" : `${movementTotal} ${movementTotal === 1 ? "movimentação encontrada" : "movimentações encontradas"}`}</p>}
      {movementsError ? <p className="movement-state movement-error">Não foi possível carregar as movimentações: {movementsError}</p> : movementsLoading && movements.length === 0 ? <p className="movement-state">Carregando movimentações…</p> : movementTotal === 0 ? <p className="movement-state">{movementProduct === "all" ? "Nenhuma movimentação encontrada neste período." : "Nenhuma movimentação deste produto encontrada no período."}</p> : <div className="stock-movements-scroll"><div className="stock-movement-table">
        <div className="stock-movement-head"><span>Tipo</span><span>Produto</span><span>Quantidade</span><span>Data e horário</span><span>Responsável</span><span>Motivo</span></div>
        {movements.map((movement) => <div className="stock-movement-row" key={movement.id}>
          <span><b className={`movement-direction ${movement.direction === "in" ? "movement-in" : "movement-out"}`}>{movement.direction === "in" ? "Entrada" : "Saída"}</b></span>
          <span className="movement-product">{movement.productName}</span>
          <span className={`movement-quantity ${movement.direction === "in" ? "movement-in-text" : "movement-out-text"}`}>{movement.direction === "in" ? "+" : "−"}{movement.quantity} {movement.unit || "un"}</span>
          <span>{dateTime(movement.createdAt)}</span>
          <span>{movement.userName || "Operador"}</span>
          <span className="movement-reason">{movement.reason}</span>
        </div>)}
      </div></div>}
      {!movementsError && !movementsLoading && movementTotal > 0 && <div className="stock-movement-pagination"><span>Página {movementPage} de {Math.max(1, movementTotalPages)} · {movementTotal} registros no período</span><div><button type="button" onClick={() => onMovementPageChange(Math.max(1, movementPage - 1))} disabled={movementPage <= 1 || movementsLoading}>Anterior</button><button type="button" onClick={() => onMovementPageChange(Math.min(movementTotalPages, movementPage + 1))} disabled={movementPage >= movementTotalPages || movementsLoading}>Próxima</button></div></div>}
    </section>
  </div>;
}

function FinancePage({ cashOpen, summary, expenses, expenseTotal, expensePage, expenseTotalPages, onExpensePageChange, period, onPeriodChange, from, to, onFromChange, onToChange, loading, expensesLoading, error, rangeError, onRefresh, onNewExpense }: any) {
  const data = {
    receivedCents: summary?.receivedCents ?? 0,
    outstandingCents: summary?.outstandingCents ?? 0,
    costCents: summary?.costCents ?? 0,
    expensesCents: summary?.expensesCents ?? 0,
    resultCents: summary?.resultCents ?? 0,
    paymentMethods: Array.isArray(summary?.paymentMethods) ? summary.paymentMethods : [],
    expenseCategories: Array.isArray(summary?.expenseCategories) ? summary.expenseCategories : [],
    receipts: Array.isArray(summary?.receipts) ? summary.receipts : [],
  };
  const validRange = !rangeError && (!from || !to || from <= to);
  const cards = [
    { label: "Recebido", value: data.receivedCents, note: "Pagamentos lançados no período", icon: Banknote, tone: "green" },
    { label: "Em aberto nas encerradas", value: data.outstandingCents, note: "Vendas encerradas ainda não cobertas por pagamento", icon: Clock3, tone: "blue" },
    { label: "Custo dos produtos", value: data.costCents, note: "Custo dos itens em comandas encerradas", icon: Package, tone: "violet" },
    { label: "Despesas", value: data.expensesCents, note: `${expenseTotal} lançamentos no período`, icon: ArrowDownRight, tone: "rose" },
    { label: "Resultado estimado", value: data.resultCents, note: "Vendas sem gorjetas − custos dos produtos − despesas", icon: WalletCards, tone: "gold" },
  ];
  const periodLabel = period === "today" ? "Hoje" : period === "7days" ? "Últimos 7 dias" : period === "month" ? "Este mês" : "Período personalizado";
  return <div className="finance-page">
    <section className="page-intro finance-hero"><div><span className="section-kicker">FINANCEIRO · VISÃO DETALHADA</span><h2>Caixa e despesas.</h2><p>Acompanhe pagamentos recebidos, saldos de comandas encerradas e despesas. Vendas por produto e detalhes das comandas ficam em Relatórios.</p></div><Button onClick={onNewExpense} disabled={!cashOpen}><Plus size={17} /> Nova despesa</Button></section>
    {!cashOpen && <div className="cash-gate-banner"><Banknote size={20} /><span><b>Caixa fechado.</b> A inclusão de despesas e outras operações financeiras fica bloqueada até abrir o caixa.</span></div>}
    <section className="panel finance-filter-panel"><div className="finance-filter-top"><div><span className="section-kicker">PERÍODO DE APURAÇÃO</span><b>{periodLabel}</b></div><div className="finance-period-presets"><Button size="sm" variant={period === "today" ? "default" : "outline"} onClick={() => onPeriodChange("today")}>Hoje</Button><Button size="sm" variant={period === "7days" ? "default" : "outline"} onClick={() => onPeriodChange("7days")}>Últimos 7 dias</Button><Button size="sm" variant={period === "month" ? "default" : "outline"} onClick={() => onPeriodChange("month")}>Este mês</Button><Button size="sm" variant={period === "custom" ? "default" : "outline"} onClick={() => onPeriodChange("custom")}>Personalizado</Button></div></div>{period === "custom" && <div className="finance-date-range"><label className="field-label">De<Input type="date" value={from} max={to || undefined} onChange={(event) => onFromChange(event.target.value)} /></label><label className="field-label">Até<Input type="date" value={to} min={from || undefined} onChange={(event) => onToChange(event.target.value)} /></label></div>}{rangeError && <p className="finance-range-error">A data inicial deve ser anterior ou igual à data final.</p>}</section>
    {loading ? <div className="finance-loading"><LoaderCircle className="launch-loader" size={22} /> Apurando o período financeiro…</div> : error ? <section className="panel finance-error"><AlertTriangle size={20} /><div><b>Não foi possível carregar os dados financeiros</b><span>{error}</span></div><Button variant="outline" onClick={onRefresh}>Tentar novamente</Button></section> : validRange && <>
      <section className="finance-overview-grid">{cards.map((card) => { const Icon = card.icon; return <article className={`finance-overview-card ${card.tone}`} key={card.label}><div className="finance-overview-icon"><Icon size={18} /></div><span>{card.label}</span><strong>{money(card.value)}</strong><small>{card.note}</small></article>; })}</section>
      <div className="finance-detail-grid">
        <section className="panel finance-detail-panel"><div className="finance-panel-heading"><div><span className="section-kicker">ENTRADAS DE CAIXA</span><h3>Recebimentos por forma</h3></div><Badge variant="outline">{money(data.receivedCents)}</Badge></div>{data.paymentMethods.length ? <div className="finance-breakdown-list">{data.paymentMethods.map((item: any) => <div className="finance-breakdown-row" key={item.method}><div><b>{methodLabel[item.method as Method] ?? item.method}</b><span>{item.count} recebimento{item.count === 1 ? "" : "s"}</span><strong>{money(item.totalCents)}</strong></div><i><em style={{ width: `${Math.max(2, Math.round(item.totalCents / Math.max(1, data.receivedCents) * 100))}%` }} /></i></div>)}</div> : <p className="finance-empty">Nenhum recebimento no período.</p>}</section>
        <section className="panel finance-detail-panel"><div className="finance-panel-heading"><div><span className="section-kicker">SAÍDAS OPERACIONAIS</span><h3>Despesas por categoria</h3></div><Badge variant="outline">{money(data.expensesCents)}</Badge></div>{data.expenseCategories.length ? <div className="finance-category-list">{data.expenseCategories.map((item: any) => <div key={item.category}><span>{item.category}</span><b>{money(item.totalCents)}</b><small>{data.expensesCents ? Math.round(item.totalCents / data.expensesCents * 100) : 0}%</small></div>)}</div> : <p className="finance-empty">Nenhuma despesa registrada no período.</p>}</section>

      </div>
      <section className="panel finance-transactions-panel"><div className="finance-panel-heading"><div><span className="section-kicker">EXTRATO DE CAIXA</span><h3>Recebimentos lançados</h3><p>Inclui pagamentos feitos em comandas abertas ou encerradas durante o período.</p></div><Badge variant="outline">{data.receipts.length} itens</Badge></div>{data.receipts.length ? <div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Data e hora</th><th>Comanda / mesa</th><th>Situação</th><th>Forma</th><th>Valor</th></tr></thead><tbody>{data.receipts.map((item: any, index: number) => <tr key={`${item.tabId}-${index}`}><td>{dateTime(item.createdAt)}</td><td><b>{item.tabCode}</b><small>Mesa {String(item.tableNumber).padStart(2, "0")}</small></td><td>{item.tabStatus === "open" ? "Em andamento" : "Encerrada"}</td><td>{methodLabel[item.method as Method] ?? item.method}</td><td><b>{money(item.amountCents)}</b></td></tr>)}</tbody></table></div> : <p className="finance-empty">Nenhum recebimento lançado no período.</p>}</section>

      <section className="panel finance-transactions-panel"><div className="finance-panel-heading"><div><span className="section-kicker">CONTAS E DESPESAS</span><h3>Lançamentos do período</h3><p>Despesas por data de ocorrência, com categoria, forma de pagamento e responsável.</p></div><Badge variant="outline">{expenseTotal} registros · {money(data.expensesCents)}</Badge></div>{expensesLoading && expenses.length === 0 ? <div className="finance-loading-inline">Carregando despesas…</div> : expenses.length ? <><div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>Data</th><th>Descrição / categoria</th><th>Forma</th><th>Responsável</th><th>Valor</th></tr></thead><tbody>{expenses.map((item: any) => <tr key={item.id}><td>{dateTime(item.occurredAt)}</td><td><b>{item.description}</b><small>{item.category}{item.notes ? ` · ${item.notes}` : ""}</small></td><td>{methodLabel[item.method as Method] ?? item.method}</td><td>{item.userName || "Operador"}</td><td><b>− {money(item.amountCents)}</b></td></tr>)}</tbody></table></div><div className="finance-expense-pagination"><span>Página {expensePage} de {Math.max(1, expenseTotalPages)} · {expenseTotal} despesas</span><div><Button size="sm" variant="outline" onClick={() => onExpensePageChange(Math.max(1, expensePage - 1))} disabled={expensePage <= 1 || expensesLoading}>Anterior</Button><Button size="sm" variant="outline" onClick={() => onExpensePageChange(Math.min(expenseTotalPages, expensePage + 1))} disabled={expensePage >= expenseTotalPages || expensesLoading}>Próxima</Button></div></div></> : <p className="finance-empty">Nenhuma despesa registrada no período selecionado.</p>}</section>
    </>}
  </div>;
}

function ReportsPage({ summary, from, to, setFrom, setTo, loading, error, onRefresh }: any) {
  const [selectedProductName, setSelectedProductName] = useState("");
  const data = {
    salesCents: summary?.salesCents ?? 0,
    salesCount: summary?.salesCount ?? 0,
    productUnits: summary?.productUnits ?? 0,
    productSalesCents: summary?.productSalesCents ?? 0,
    tipCents: summary?.tipCents ?? 0,
    products: Array.isArray(summary?.products) ? summary.products : [],
    sales: Array.isArray(summary?.sales) ? summary.sales : [],
  };
  const activeProductName = data.products.find((item: any) => item.productName.toLocaleLowerCase("pt-BR") === selectedProductName.trim().toLocaleLowerCase("pt-BR"))?.productName ?? "";
  const selectedProduct = data.products.find((item: any) => item.productName === activeProductName);
  const displayedProducts = selectedProduct ? [selectedProduct] : data.products;
  const displayedProductUnits = selectedProduct?.quantity ?? data.productUnits;
  const displayedProductSalesCents = selectedProduct?.totalCents ?? data.productSalesCents;
  const validRange = !from || !to || from <= to;
  const applyPreset = (preset: "today" | "7days" | "month") => {
    const today = saoPauloDateKey(new Date());
    const start = preset === "today" ? today : preset === "7days" ? addDaysToSaoPauloDateKey(today, -6) : firstOfMonthInSaoPaulo(new Date());
    setFrom(start);
    setTo(today);
  };
  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["Período inicial", from], ["Período final", to], [], ["RESUMO DE VENDAS"], ["Comandas encerradas", String(data.salesCount)], ["Total vendido nas comandas", money(data.salesCents)], ["Gorjetas registradas", money(data.tipCents)], ["Produtos vendidos (bruto, antes dos descontos)", money(data.productSalesCents)], ["Unidades vendidas", String(data.productUnits)], [], ["Comanda", "Mesa", "Cliente", "Encerrada em", "Itens", "Subtotal", "Gorjeta", "Desconto", "Ajuste manual", "Justificativa do ajuste", "Total vendido"]];
    for (const sale of data.sales) {
      const itemList = sale.items.map((item: any) => `${item.quantity}x ${item.productName} @ ${money(item.unitPriceCents)} = ${money(item.totalCents)}`).join("; ");
      rows.push([sale.tabCode, `Mesa ${sale.tableNumber}`, sale.customerName || "Consumidor não identificado", sale.closedAt ? new Date(sale.closedAt).toLocaleString("pt-BR") : "", itemList, money(sale.subtotalCents), money(sale.tipCents), money(sale.discountCents), money(sale.manualAdjustmentCents), sale.adjustmentReason || "", money(sale.salesCents)]);
    }
    rows.push([], ["RESUMO DE PRODUTOS VENDIDOS"], ["Produto", "Unidades", "Preço médio unitário", "Valor bruto vendido"]);
    for (const item of data.products) rows.push([item.productName, String(item.quantity), money(Math.round(item.totalCents / item.quantity)), money(item.totalCents)]);
    rows.push(["TOTAL DE PRODUTOS", String(data.productUnits), "", money(data.productSalesCents)]);
    const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-vendas-${from || "inicio"}-a-${to || "hoje"}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };
  const moneyCards = [
    { label: "Vendido nas comandas", value: data.salesCents, sub: `${data.salesCount} comandas encerradas`, tone: "amber", icon: TrendingUp },
    { label: "Média por comanda", value: data.salesCount ? Math.round(data.salesCents / data.salesCount) : 0, sub: "Valor médio das comandas encerradas", tone: "blue", icon: FileText },
    { label: "Produtos vendidos", value: data.productSalesCents, sub: `${data.productUnits} unidades · valor bruto antes de descontos`, tone: "violet", icon: Package },
    { label: "Gorjetas registradas", value: data.tipCents, sub: "Gorjetas em comandas encerradas", tone: "green", icon: Banknote },
  ];
  return <div className="reports-page">
    <section className="page-intro report-hero"><div><span className="section-kicker">RELATÓRIOS · VENDAS</span><h2>Vendas por produto e comanda.</h2><p>Consulte o desempenho das vendas encerradas e confira os itens de cada comanda. Recebimentos, formas de pagamento e despesas estão reunidos em Financeiro.</p></div><div className="report-hero-actions"><Button variant="outline" onClick={() => void onRefresh()} disabled={loading}><LoaderCircle className={loading ? "launch-loader" : ""} size={16} /> Atualizar</Button><Button onClick={exportCsv} disabled={!data.sales.length && !data.products.length || !validRange}><Download size={16} /> Exportar CSV</Button></div></section>
    <section className="panel report-filter-panel"><div className="report-filter-heading"><span className="section-kicker">PERÍODO DE APURAÇÃO</span><p>Vendas e gorjetas são apuradas pela data de encerramento da comanda.</p></div><div className="report-filter-controls"><div className="report-presets"><Button size="sm" variant="outline" onClick={() => applyPreset("today")}>Hoje</Button><Button size="sm" variant="outline" onClick={() => applyPreset("7days")}>Últimos 7 dias</Button><Button size="sm" variant="outline" onClick={() => applyPreset("month")}>Este mês</Button></div><div className="history-date-fields"><label className="field-label">De<Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label className="field-label">Até<Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label></div></div>{!validRange && <small className="report-error">A data inicial deve ser anterior ou igual à data final.</small>}</section>
    {loading ? <div className="report-loading"><LoaderCircle className="launch-loader" size={22} /> Apurando vendas e produtos…</div> : error ? <section className="panel report-error-state"><AlertTriangle size={20} /><div><b>Não foi possível carregar os relatórios</b><span>{error}</span></div><Button variant="outline" onClick={() => void onRefresh()}>Tentar novamente</Button></section> : validRange && <>
      <section className="report-cards report-financial-cards">{moneyCards.map((card) => { const Icon = card.icon; return <article key={card.label}><div className={`report-icon ${card.tone}`}><Icon size={19} /></div><span>{card.label}</span><b>{money(card.value)}</b><small>{card.sub}</small></article>; })}</section>
      <section className="panel report-product-panel"><div className="panel-header"><div><span className="section-kicker">ITENS DAS COMANDAS</span><h3>Produtos vendidos</h3><p className="panel-help">Filtre por produto para consultar quantidade e valor bruto no período.</p></div><Badge variant="outline">{displayedProductUnits} un.</Badge></div>{data.products.length ? <><div className="report-product-filter"><label className="field-label" htmlFor="report-product-select">Produto (digite para buscar)<Input id="report-product-select" type="search" list="report-product-options" autoComplete="off" placeholder="Digite o nome do produto" value={selectedProductName} onChange={(event) => setSelectedProductName(event.target.value)} /><datalist id="report-product-options">{data.products.map((item: any) => <option key={item.productName} value={item.productName} />)}</datalist></label></div><div className="report-product-total"><span>{selectedProduct ? `Valor bruto vendido · ${selectedProduct.productName}` : "Valor bruto de todos os produtos"}</span><strong>{money(displayedProductSalesCents)}</strong></div><div className="report-product-table-scroll"><table className="report-products-table"><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço médio</th><th>Valor vendido</th></tr></thead><tbody>{displayedProducts.map((item: any) => <tr key={item.productName}><td>{item.productName}</td><td>{item.quantity} un.</td><td>{money(Math.round(item.totalCents / item.quantity))}</td><td>{money(item.totalCents)}</td></tr>)}</tbody></table></div></> : <p className="empty-inline">Nenhum item em comanda encerrada neste período.</p>}</section>
      <section className="panel report-sales-panel"><div className="panel-header"><div><span className="section-kicker">RASTREABILIDADE DA VENDA</span><h3>Comandas encerradas</h3><p className="panel-help">Abra uma comanda para conferir itens, descontos, gorjetas e ajustes. O extrato de pagamentos está em Financeiro.</p></div><Badge variant="outline">{data.sales.length} registros</Badge></div>{data.sales.length ? <div className="report-sales-list"><div className="report-sales-table"><div className="report-sales-head"><span>Comanda / mesa</span><span>Cliente / encerrada</span><span>Total vendido</span><span /></div>{data.sales.map((sale: any) => <details className="report-sale" key={sale.id}><summary><span className="sale-code">{sale.tabCode}<small>Mesa {String(sale.tableNumber).padStart(2, "0")}</small></span><span className="sale-customer">{sale.customerName || "Consumidor não identificado"}<small>Encerrada {dateTime(sale.closedAt)}</small></span><span className="sale-amount"><small>Total vendido</small><b>{money(sale.salesCents)}</b></span><span className="sale-chevron">⌄</span></summary><div className="sale-detail"><div className="sale-detail-title"><b>Itens lançados</b><span>Subtotal {money(sale.subtotalCents)}{sale.tipCents ? ` · Gorjeta ${money(sale.tipCents)}` : ""}{sale.discountCents ? ` · Desconto ${money(sale.discountCents)}` : ""}</span></div>{sale.items.length ? sale.items.map((item: any) => <div className="sale-line" key={item.id}><span>{item.quantity} × {item.productName}</span><small>{money(item.unitPriceCents)} un.</small><b>{money(item.totalCents)}</b></div>) : <p className="empty-inline">Comanda sem itens registrados.</p>}{sale.manualAdjustmentCents !== 0 && <div className="sale-adjustment-row"><span>Ajuste manual do total</span><b>{money(sale.manualAdjustmentCents)}</b><small>{sale.adjustmentReason || "Sem justificativa registrada"}</small></div>}</div></details>)}</div></div> : <div className="report-empty"><FileText size={24} /><b>Nenhuma comanda encerrada neste período.</b><span>Amplie o período ou escolha outra data para consultar as vendas.</span></div>}</section>
    </>}
  </div>;
}

function UsersPage({ audits, users, rolePermissions, savingRolePermissions, onSaveRolePermissions, onUpdate, onCreate, onDelete }: {
  audits: any[]; users: any[]; rolePermissions: RolePermissions; savingRolePermissions: boolean;
  onSaveRolePermissions: (input: RolePermissions) => void; onUpdate: (input: any) => void; onCreate: () => void; onDelete: (userId: number) => void;
}) {
  const [draft, setDraft] = useState<RolePermissions>(rolePermissions);
  useEffect(() => { setDraft(rolePermissions); }, [rolePermissions]);
  const toggleFeature = (role: "manager" | "attendant", feature: AccessFeature, checked: boolean) => {
    setDraft((current) => ({ ...current, [role]: checked ? Array.from(new Set([...current[role], feature])) : current[role].filter((item) => item !== feature) }));
  };
  const hasChanges = (["manager", "attendant"] as const).some((role) => ACCESS_FEATURES.some(({ id }) => draft[role].includes(id) !== rolePermissions[role].includes(id)));
  return <div className="users-page"><section className="page-intro"><div><span className="section-kicker">ACESSO E RASTREABILIDADE</span><h2>Equipe e auditoria.</h2><p>Defina quem pode acessar cada funcionalidade por perfil.</p></div></section>
    <section className="panel role-permissions-panel"><div className="panel-header"><div><span className="section-kicker">CONTROLE DE ACESSO</span><h3>Permissões por perfil</h3><p className="panel-help">As alterações valem para todos os usuários com o perfil selecionado e também são verificadas no servidor.</p></div><ShieldCheck size={19} /></div>
      <div className="role-permissions-grid"><section className="role-permission-card"><div><Users size={18} /><span><b>Gerente</b><small>Personalize as áreas disponíveis para os gerentes.</small></span></div>{ACCESS_FEATURES.map(({ id, label, description }) => <label className="role-permission-option" key={`manager-${id}`}><input type="checkbox" checked={draft.manager.includes(id)} onChange={(event) => toggleFeature("manager", id, event.target.checked)} /><span><b>{label}</b><small>{description}</small></span></label>)}</section>
        <section className="role-permission-card"><div><ClipboardList size={18} /><span><b>Atendente</b><small>Personalize as áreas disponíveis para os atendentes.</small></span></div>{ACCESS_FEATURES.map(({ id, label, description }) => <label className="role-permission-option" key={`attendant-${id}`}><input type="checkbox" checked={draft.attendant.includes(id)} onChange={(event) => toggleFeature("attendant", id, event.target.checked)} /><span><b>{label}</b><small>{description}</small></span></label>)}</section></div>
      <div className="role-permissions-footer"><p><b>Administrador:</b> mantém acesso completo e exclusivo à gestão de usuários e permissões.</p><Button onClick={() => onSaveRolePermissions(draft)} disabled={!hasChanges || savingRolePermissions}>{savingRolePermissions ? "Salvando…" : "Salvar permissões"}</Button></div>
    </section>
    <section className="panel access-panel"><div className="panel-header"><div><span className="section-kicker">USUÁRIOS</span><h3>Usuários cadastrados</h3></div><Button onClick={onCreate}><Plus size={16} /> Novo usuário</Button></div>{users.length ? users.map((item: any) => <div className="access-row" key={item.id}><div><b>{item.name || item.username || "Usuário"}</b><small>{item.email || item.username || "Acesso local"}</small></div><select value={item.localRole || "attendant"} onChange={(e) => onUpdate({ userId: item.id, localRole: e.target.value, active: item.active !== false })}><option value="manager">Gerente</option><option value="administrator">Administrador</option><option value="attendant">Atendente</option></select><label className="checkbox-line"><input type="checkbox" checked={item.active !== false} onChange={(e) => onUpdate({ userId: item.id, localRole: item.localRole || "attendant", active: e.target.checked })} /><span>Ativo</span></label>{item.username !== "admin" ? <button className="access-delete" title="Excluir usuário" aria-label="Excluir usuário" onClick={() => { if (window.confirm(`Excluir o usuário ${item.name || item.username}? O acesso será removido e o histórico será preservado.`)) onDelete(item.id); }}><Trash2 size={15} /></button> : <span className="protected-access">Admin protegido</span>}</div>) : <p className="empty-inline">Nenhum usuário cadastrado.</p>}</section>
    <section className="panel audit-panel"><div className="panel-header"><div><span className="section-kicker">REGISTROS PROTEGIDOS</span><h3>Auditoria recente</h3><p className="panel-help">Histórico imutável: os registros não podem ser editados nem excluídos. Exibindo até 100 ações mais recentes.</p></div></div>{audits.length ? audits.map((audit) => <div className="audit-row" key={audit.id}><span className="audit-action">{auditActionLabel(audit.action)}</span><p>{auditDescriptionInPortuguese(audit.description)}<small>{audit.userName || "Operador"} · {dateTime(audit.createdAt)}</small></p></div>) : <div className="empty-audit"><ShieldCheck size={22} /><div><b>As ações relevantes serão registradas aqui.</b><span>Abra uma comanda, ajuste estoque ou receba um pagamento para gerar o histórico.</span></div></div>}</section></div>;
}

function SettingsPage({ products, rules, tableLimit, preventNegativeStock, tableLimitSaving, stockPolicySaving, updateRuleSaving, onCreateRule, onUpdateRule, onSetRuleActive, onDeleteRule, onUpdateTableLimit, onUpdateNegativeStock }: {
  products: any[]; rules: any[]; tableLimit: number; preventNegativeStock: boolean; tableLimitSaving: boolean; stockPolicySaving: boolean; updateRuleSaving: boolean;
  onCreateRule: (input: any) => void; onUpdateRule: (input: any) => Promise<unknown>; onSetRuleActive: (input: any) => void; onDeleteRule: (input: any) => void;
  onUpdateTableLimit: (maxTables: number) => void; onUpdateNegativeStock: (preventNegativeStock: boolean) => void;
}) {
  const [form, setForm] = useState({ maxTables: String(tableLimit) });
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [rule, setRule] = useState({ productId: products[0]?.id ?? 1, name: "Preço especial", startTime: "15:00", endTime: "21:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], price: "12" });
  useEffect(() => { if (products[0] && !products.some((product) => product.id === rule.productId)) setRule((current) => ({ ...current, productId: products[0].id })); }, [products, rule.productId]);
  useEffect(() => { setForm({ maxTables: String(tableLimit) }); }, [tableLimit]);
  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRule({ productId: products[0]?.id ?? 1, name: "Preço especial", startTime: "15:00", endTime: "21:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], price: "12" });
  };
  const editRule = (item: any) => {
    setEditingRuleId(item.id);
    setRule({ productId: item.productId, name: item.name, startTime: item.startTime, endTime: item.endTime, daysOfWeek: weekdayValuesFromRule(item), price: (item.priceCents / 100).toFixed(2) });
  };
  const submitRule = () => {
    const priceCents = Math.round(Number(rule.price.replace(",", ".")) * 100);
    if (!rule.productId || rule.name.trim().length < 2 || !Number.isFinite(priceCents) || priceCents <= 0 || !rule.daysOfWeek.length) {
      toast.error("Preencha produto, nome, preço e ao menos um dia");
      return;
    }
    const input = { productId: rule.productId, name: rule.name.trim(), startTime: rule.startTime, endTime: rule.endTime, daysOfWeek: rule.daysOfWeek, weekdaysMask: rule.daysOfWeek.reduce((mask, day) => mask | (1 << day), 0), priceCents };
    if (editingRuleId !== null) {
      void onUpdateRule({ ...input, ruleId: editingRuleId }).then(resetRuleForm).catch(() => {});
    } else {
      onCreateRule(input);
    }
  };
  return <div className="settings-page">
    <section className="page-intro"><div><span className="section-kicker">PREFERÊNCIAS DA OPERAÇÃO</span><h2>Configurações comerciais.</h2><p>A operação utiliza somente a gorjeta fixa de 10% do garçom.</p></div></section>
    <section className="panel table-limit-panel"><div className="panel-header"><div><span className="section-kicker">SALÃO</span><h3>Quantidade de mesas</h3><p className="panel-help">Defina quantas mesas ficam disponíveis para a operação.</p></div></div><div className="price-rule-form"><label className="field-label">Mesas disponíveis<Input type="number" min="1" max="100" value={form.maxTables ?? String(tableLimit)} onChange={(event) => setForm({ maxTables: event.target.value })} disabled={tableLimitSaving} /></label><Button disabled={tableLimitSaving} onClick={() => { const maxTables = Number(form.maxTables); if (!Number.isInteger(maxTables) || maxTables < 1 || maxTables > 100) { toast.error("Informe entre 1 e 100 mesas"); return; } onUpdateTableLimit(maxTables); }}>{tableLimitSaving ? "Salvando..." : "Salvar quantidade"}</Button></div></section>
    <section className="panel tip-settings-panel"><div className="panel-header"><div><span className="section-kicker">GORJETA DO GARÇOM</span><h3>Modalidade separada</h3><p className="panel-help">A gorjeta é adicionada em 10% quando marcada na comanda.</p></div><Badge className="local-badge">10%</Badge></div></section>
    <section className="panel price-rules-panel"><div className="panel-header"><div><span className="section-kicker">PREÇO PROGRAMADO</span><h3>Preço por produto e horário</h3><p className="panel-help">Exemplo: Narguilé Premium das 15:00 às 21:00 por R$ 12,00.</p></div></div>
      <div className="price-rule-form"><label className="field-label">Produto<select value={rule.productId} onChange={(event) => setRule({ ...rule, productId: Number(event.target.value) })}>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label className="field-label">Nome da regra<Input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></label><label className="field-label">De<Input type="time" value={rule.startTime} onChange={(event) => setRule({ ...rule, startTime: event.target.value })} /></label><label className="field-label">Até<Input type="time" value={rule.endTime} onChange={(event) => setRule({ ...rule, endTime: event.target.value })} /></label>
        <div className="weekday-field"><span className="field-label">Dias da semana</span><div className="weekday-picker" role="group" aria-label="Dias em que a promoção será aplicada">{weekdayOptions.map((day) => <button type="button" key={day.value} className={rule.daysOfWeek.includes(day.value) ? "weekday-chip weekday-chip-selected" : "weekday-chip"} aria-pressed={rule.daysOfWeek.includes(day.value)} onClick={() => setRule({ ...rule, daysOfWeek: rule.daysOfWeek.includes(day.value) ? rule.daysOfWeek.filter((selectedDay) => selectedDay !== day.value) : [...rule.daysOfWeek, day.value] })}>{day.label}</button>)}</div><small>{formatWeekdays(rule.daysOfWeek)} · Em regras após meia-noite, a faixa após 00:00 acompanha o dia de início.</small></div><label className="field-label">Preço (R$)<Input type="number" inputMode="decimal" min="0.01" step="0.01" value={rule.price} onChange={(event) => setRule({ ...rule, price: event.target.value })} /></label>
        <div className="rule-form-actions"><Button disabled={updateRuleSaving} onClick={submitRule}>{updateRuleSaving ? "Salvando..." : editingRuleId !== null ? "Salvar edição" : "Criar regra"}</Button>{editingRuleId !== null && <Button type="button" variant="outline" disabled={updateRuleSaving} onClick={resetRuleForm}>Cancelar</Button>}</div>
      </div>
      <div className="price-rules-list">{rules.length ? rules.map((item: any) => <div className={`price-rule-row ${item.active ? "" : "price-rule-inactive"}`} key={item.id}><span><b>{item.productName}</b><small>{item.name} · {item.startTime}–{item.endTime} · {formatWeekdays(weekdayValuesFromRule(item))} · {item.active ? "Ativa" : "Inativa"}</small></span><strong>{money(item.priceCents)}</strong><div className="price-rule-actions"><Button variant="outline" size="sm" disabled={updateRuleSaving} onClick={() => editRule(item)}><Pencil size={14} /> Editar</Button><Button variant="outline" size="sm" onClick={() => onSetRuleActive({ ruleId: item.id, active: !item.active })}>{item.active ? "Desativar" : "Ativar"}</Button><Button variant="outline" size="sm" onClick={() => onDeleteRule({ ruleId: item.id })}>Excluir</Button></div></div>) : <p className="empty-inline">Nenhum preço programado cadastrado.</p>}</div>
    </section>
    <section className="settings-list"><div><div><b>Impedir estoque negativo</b><span>{preventNegativeStock ? "Bloqueia lançamentos quando não houver saldo disponível." : "Permite lançamentos mesmo sem saldo disponível."}</span></div><Button variant="outline" disabled={stockPolicySaving} onClick={() => onUpdateNegativeStock(!preventNegativeStock)}>{stockPolicySaving ? "Salvando..." : preventNegativeStock ? "Desativar bloqueio" : "Ativar bloqueio"}</Button></div></section>
  </div>;
}
