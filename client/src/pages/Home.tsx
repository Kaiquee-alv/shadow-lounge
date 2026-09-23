import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cached, createOfflineTab, getOfflineTabById, getOfflineTabByTable, getOfflineTabs, isOffline, offlineTabView, offlineTotals, removeOfflineTab, saveOfflineTab } from "@/lib/offline";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ArrowRightLeft, BarChart3, Banknote, Beer, ChevronLeft, LoaderCircle, Printer,
  ClipboardList, Clock3, CreditCard, FileText, Flame, LayoutDashboard, LogIn, Menu,
  Package, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, Table2, Pencil, Trash2,
  TrendingUp, Users, WalletCards, Zap, Eye, EyeOff,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Page = "dashboard" | "tables" | "products" | "stock" | "finance" | "reports" | "users" | "settings";
type Method = "pix" | "cash" | "debit" | "credit" | "other";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dateTime = (value?: string | Date | null) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value)) : "—";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
const methodLabel: Record<Method, string> = { pix: "PIX", cash: "Dinheiro", debit: "Débito", credit: "Crédito", other: "Outros" };
const expensesCategories = ["Fornecedores", "Aluguel", "Energia", "Água", "Internet", "Funcionários", "Manutenção", "Marketing", "Outros"];

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
  { id: "products" as Page, label: "Produtos", icon: Beer },
  { id: "stock" as Page, label: "Estoque", icon: Package },
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [itemNote, setItemNote] = useState("");
  const [launchQuantity, setLaunchQuantity] = useState("1");
  const [productSearch, setProductSearch] = useState("");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<Method>("pix");
  const [paymentValue, setPaymentValue] = useState("");
  const [launchingProductId, setLaunchingProductId] = useState<number | null>(null);
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
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [userCreateOpen, setUserCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", username: "", password: "", localRole: "attendant" as "administrator" | "manager" | "attendant" });
  const utils = trpc.useUtils();

  const dashboardQuery = trpc.lounge.dashboard.useQuery({ rangeDays: 30 }, { enabled: isAuthenticated, retry: false });
  const tablesQuery = trpc.lounge.tables.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchInterval: isAuthenticated ? 10000 : false });
  const productsQuery = trpc.inventory.products.useQuery({}, { enabled: isAuthenticated, retry: false });
  const categoriesQuery = trpc.inventory.categories.useQuery(undefined, { enabled: isAuthenticated && (productOpen || page === "products"), retry: false });
  const commercialSettingsQuery = trpc.commercial.settings.useQuery(undefined, { enabled: isAuthenticated && page === "settings", retry: false });
  const expensesQuery = trpc.finance.expenses.useQuery(undefined, { enabled: isAuthenticated && page === "finance", retry: false });
  const auditQuery = trpc.audit.list.useQuery(undefined, { enabled: isAuthenticated && page === "users", retry: false });
  const accessQuery = trpc.access.list.useQuery(undefined, { enabled: isAuthenticated && page === "users", retry: false });
  const historyInput = useMemo(() => ({ from: historyFrom ? new Date(`${historyFrom}T00:00:00`) : undefined, to: historyTo ? new Date(`${historyTo}T23:59:59.999`) : undefined }), [historyFrom, historyTo]);
  const historyQuery = trpc.productHistory.list.useQuery(historyInput, { enabled: isAuthenticated && page === "reports", retry: false });
  const reportSummaryQuery = trpc.reports.summary.useQuery(historyInput, { enabled: isAuthenticated && page === "reports", retry: false });
  const pricingRulesQuery = trpc.pricing.rules.useQuery(undefined, { enabled: isAuthenticated && page === "settings", retry: false });
  const tabQuery = trpc.lounge.tab.useQuery({ tabId: selectedTabId && selectedTabId > 0 ? selectedTabId : 1 }, { enabled: isAuthenticated && !!selectedTabId && selectedTabId > 0, retry: false });
  const workspaceQuery = trpc.workspace.bootstrap.useQuery(undefined, { enabled: isAuthenticated, retry: false });

  const refreshOperationalData = () => {
    void utils.lounge.tables.invalidate();
    void utils.lounge.dashboard.invalidate();
    void utils.lounge.tab.invalidate();
    void utils.inventory.products.invalidate();
  };
  const openTabMutation = trpc.lounge.openTab.useMutation({ onSuccess: (tab) => { refreshOperationalData(); setSelectedTabId(tab.id); toast.success("Comanda aberta com sucesso"); }, onError: (error) => toast.error(error.message) });
  const addItemMutation = trpc.lounge.addItem.useMutation({
    onMutate: async (variables) => {
      if (!selectedTabId || selectedTabId < 0) return { previousTab: undefined };
      await utils.lounge.tab.cancel({ tabId: selectedTabId });
      const previousTab = utils.lounge.tab.getData({ tabId: selectedTabId });
      const product = products.find((item: any) => item.id === variables.productId);
      if (previousTab && product) {
        const existing = previousTab.items.find((item: any) => item.productId === variables.productId);
        const items = existing
          ? previousTab.items.map((item: any) => item.productId === variables.productId ? { ...item, quantity: item.quantity + variables.quantity, note: variables.note ?? item.note } : item)
          : [...previousTab.items, { id: -Date.now(), productId: product.id, productName: product.name, quantity: variables.quantity, unitPriceCents: product.priceCents, unitCostCents: product.costCents, note: variables.note ?? null, createdAt: new Date() }];
        const subtotalCents = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPriceCents, 0);
        const tipCents = Math.round(subtotalCents * ((previousTab as any).tipPercent ?? 0) / 100);
        const paidCents = previousTab.paidCents ?? 0;
        utils.lounge.tab.setData({ tabId: selectedTabId }, { ...previousTab, items, subtotalCents, tipCents, totalCents: subtotalCents + tipCents, balanceCents: Math.max(subtotalCents + tipCents - paidCents, 0) } as any);
      }
      setNoteOpen(false); setPendingProduct(null); setItemNote("");
      return { previousTab };
    },
    onSuccess: () => {
      void utils.lounge.tab.invalidate(undefined, { refetchType: "active" });
      void utils.inventory.products.invalidate(undefined, { refetchType: "active" });
      setLaunchingProductId(null);
      setNoteOpen(false); setPendingProduct(null); setItemNote(""); setLaunchQuantity("1");
    },
    onError: (error, _variables, context) => { setLaunchingProductId(null); setLaunchQuantity("1"); if (selectedTabId && selectedTabId > 0 && context?.previousTab) utils.lounge.tab.setData({ tabId: selectedTabId }, context.previousTab); toast.error(error.message); },
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
        utils.lounge.tab.setData({ tabId: selectedTabId }, { ...previousTab, items, subtotalCents, tipCents, totalCents: subtotalCents + tipCents, balanceCents: Math.max(subtotalCents + tipCents - (previousTab.paidCents ?? 0), 0) } as any);
      }
      return { previousTab };
    },
    onSuccess: () => { setUpdatingItemId(null); void utils.lounge.tab.invalidate(undefined, { refetchType: "active" }); void utils.inventory.products.invalidate(undefined, { refetchType: "active" }); },
    onError: (error, _variables, context) => { setUpdatingItemId(null); if (selectedTabId && selectedTabId > 0 && context?.previousTab) utils.lounge.tab.setData({ tabId: selectedTabId }, context.previousTab); toast.error(error.message); },
  });
  const payMutation = trpc.lounge.pay.useMutation({ onSuccess: () => { refreshOperationalData(); setPaymentOpen(false); setPaymentValue(""); toast.success("Pagamento registrado. A mesa permanece aberta."); }, onError: (error) => toast.error(error.message) });
  const closeMutation = trpc.lounge.closeTab.useMutation({ onSuccess: (_result, variables) => { setSelectedTabId(null); void utils.lounge.tab.invalidate({ tabId: variables.tabId }); void utils.lounge.tables.refetch(); void utils.lounge.dashboard.invalidate(); toast.success("Comanda encerrada e mesa liberada"); }, onError: (error) => toast.error(error.message) });
  const transferMutation = trpc.lounge.transferTab.useMutation({ onSuccess: (result) => { setTransferOpen(false); setTransferDestination(null); void utils.lounge.tables.refetch(); void utils.lounge.tab.invalidate({ tabId: result.tabId }); toast.success(`Comanda transferida para a mesa ${result.tableNumber}`); }, onError: (error) => toast.error(error.message) });
  const customerNameMutation = trpc.lounge.setCustomerName.useMutation({ onSuccess: () => { setCustomerNameOpen(false); void utils.lounge.tab.invalidate(); void utils.lounge.tables.invalidate(); toast.success("Nome da mesa atualizado"); }, onError: (error) => toast.error(error.message) });
  const stockMutation = trpc.inventory.adjust.useMutation({ onSuccess: () => { refreshOperationalData(); setStockSheet(false); toast.success("Movimentação de estoque registrada"); }, onError: (error) => toast.error(error.message) });
  const saveProductMutation = trpc.inventory.saveProduct.useMutation({ onSuccess: () => { refreshOperationalData(); setProductOpen(false); setEditingProduct(null); setNewProduct({ name: "", code: "", categoryId: 1, unit: "un", cost: "", price: "", stock: "", minimum: "" }); toast.success(editingProduct ? "Produto atualizado" : "Produto cadastrado com sucesso"); }, onError: (error) => toast.error(error.message) });
  const deleteProductMutation = trpc.inventory.deleteProduct.useMutation({ onSuccess: () => { refreshOperationalData(); toast.success("Produto removido"); }, onError: (error) => toast.error(error.message) });
  const createCategoryMutation = trpc.inventory.createCategory.useMutation({ onSuccess: () => { void utils.inventory.categories.invalidate(); setCategoryOpen(false); setCategoryName(""); toast.success("Categoria criada com sucesso"); }, onError: (error) => toast.error(error.message) });
  const updateAccessMutation = trpc.access.update.useMutation({ onSuccess: () => { void utils.access.list.invalidate(); toast.success("Permissão atualizada"); }, onError: (error) => toast.error(error.message) });
  const createPriceRuleMutation = trpc.pricing.createRule.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Preço por horário criado"); }, onError: (error) => toast.error(error.message) });
  const setPriceRuleActiveMutation = trpc.pricing.setActive.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Status da regra atualizado"); }, onError: (error) => toast.error(error.message) });
  const deletePriceRuleMutation = trpc.pricing.deleteRule.useMutation({ onSuccess: () => { void utils.pricing.rules.invalidate(); toast.success("Regra excluída"); }, onError: (error) => toast.error(error.message) });
  const updateTableLimitMutation = trpc.commercial.updateTableLimit.useMutation({ onSuccess: (result) => { void utils.commercial.settings.invalidate(); void utils.lounge.tables.invalidate(); toast.success(`Limite atualizado para ${result.maxTables} mesas`); }, onError: (error) => toast.error(error.message) });
  const chargesMutation = trpc.lounge.setCharges.useMutation({ onSuccess: () => { refreshOperationalData(); toast.success("Gorjeta atualizada"); }, onError: (error) => toast.error(error.message) });
  const expenseMutation = trpc.finance.createExpense.useMutation({ onSuccess: () => { void utils.finance.expenses.invalidate(); void utils.lounge.dashboard.invalidate(); setExpenseOpen(false); setExpense({ description: "", category: "Fornecedores", amount: "", method: "pix", notes: "" }); toast.success("Despesa registrada no financeiro"); }, onError: (error) => toast.error(error.message) });
  const finishAuth = (message: string) => { setLoginOpen(false); setCredentials({ name: "", username: "", password: "" }); void utils.auth.me.invalidate(); toast.success(message); };
  const localLoginMutation = trpc.localAuth.login.useMutation({ onSuccess: () => { void utils.auth.me.invalidate(); void workspaceQuery.refetch(); setLoginOpen(false); setCredentials({ name: "", username: "", password: "" }); toast.success("Acesso liberado"); }, onError: (error) => toast.error(error.message) });
  const createUserMutation = trpc.access.create.useMutation({ onSuccess: () => { void accessQuery.refetch(); setUserCreateOpen(false); setNewUser({ name: "", username: "", password: "", localRole: "attendant" }); toast.success("Usuário criado com sucesso"); }, onError: (error) => toast.error(error.message) });
  const localLogoutMutation = trpc.localAuth.logout.useMutation({ onSuccess: () => { utils.auth.me.setData(undefined, null); void utils.auth.me.invalidate(); toast.success("Sessão local encerrada"); }, onError: (error) => toast.error(error.message) });
  const syncOfflineMutation = trpc.lounge.syncOfflineTab.useMutation({ onSuccess: (result, variables) => { removeOfflineTab(variables.offlineKey); setOfflineTabs(getOfflineTabs()); setOfflineSyncBlocked(false); if (selectedTabId && selectedTabId < 0) setSelectedTabId(result.tabId); void utils.lounge.tables.invalidate(); void utils.lounge.tab.invalidate({ tabId: result.tabId }); toast.success("Comanda offline sincronizada"); }, onError: (error) => { setOfflineSyncBlocked(true); toast.error(`Sincronização pendente: ${error.message}`); } });

  useEffect(() => {
    const goOnline = () => { setConnectionOnline(true); setOfflineSyncBlocked(false); };
    const goOffline = () => { setConnectionOnline(false); setOfflineSyncBlocked(false); };
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
  useEffect(() => { if (activeTab) setTipEnabled((activeTab as any).tipPercent === 10); }, [activeTab?.id, (activeTab as any)?.tipPercent]);
  const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.code} ${product.categoryName ?? ""}`.toLocaleLowerCase().includes(productSearch.toLocaleLowerCase())), [products, productSearch]);
  const occupiedCount = tables.filter((table) => table.status !== "free").length;

  useEffect(() => {
    if (!connectionOnline || !isAuthenticated || offlineSyncBlocked || syncOfflineMutation.isPending || !offlineTabs.length) return;
    const queued = offlineTabs[0];
    syncOfflineMutation.mutate({ offlineKey: queued.offlineKey, deviceId: queued.deviceId, tableId: queued.tableId, customerName: queued.customerName, tipPercent: queued.tipPercent, items: queued.items.map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, note: item.note ?? null })), payments: queued.payments.map((payment) => ({ amountCents: payment.amountCents, method: payment.method, requestKey: payment.requestKey })) });
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
    const tab = createOfflineTab(table);
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

  const selectTable = (table: any) => {
    if (table.status === "free") {
      requireAuth(() => connectionOnline ? openTabMutation.mutate({ tableId: table.id }) : openOfflineTab(table));
      return;
    }
    if (table.tabId) utils.lounge.tab.setData({ tabId: table.tabId }, undefined);
    setSelectedTabId(table.tabId);
  };

  const addProduct = (product: any) => requireAuth(() => {
    if (!selectedTabId) { toast.message("Selecione uma comanda aberta primeiro."); return; }
    setPendingProduct(product);
    setItemNote("");
    setLaunchQuantity("1");
    setNoteOpen(true);
  });

  const confirmAddProduct = () => requireAuth(() => {
    if (!selectedTabId || !pendingProduct) return;
    const quantity = Math.max(1, Math.floor(Number(launchQuantity)));
    if (!Number.isFinite(quantity) || quantity > 999) { toast.error("Informe uma quantidade entre 1 e 999"); return; }
    if (selectedTabId < 0) {
      updateOfflineTab({ id: selectedTabId }, (current) => {
        const existing = current.items.find((item: any) => item.productId === pendingProduct.id);
        const items = existing ? current.items.map((item: any) => item.productId === pendingProduct.id ? { ...item, quantity: item.quantity + quantity, note: itemNote.trim() || item.note } : item) : [...current.items, { id: `${current.offlineKey}-${pendingProduct.id}`, productId: pendingProduct.id, productName: pendingProduct.name, quantity, unitPriceCents: pendingProduct.priceCents, unitCostCents: pendingProduct.costCents, note: itemNote.trim() || null, createdAt: new Date().toISOString() }];
        return { ...current, items };
      });
      setNoteOpen(false); setPendingProduct(null); setItemNote(""); setLaunchQuantity("1");
      return;
    }
    setLaunchingProductId(pendingProduct.id);
    addItemMutation.mutate({ tabId: selectedTabId, productId: pendingProduct.id, quantity, note: itemNote.trim() || undefined });
  });

  const changeItemQuantity = (itemId: number, quantity: number) => {
    if (selectedTabId && selectedTabId < 0) {
      updateOfflineTab({ id: selectedTabId }, (current) => ({ ...current, items: current.items.map((item: any) => item.id === itemId ? { ...item, quantity } : item).filter((item: any) => item.quantity > 0) }));
      return;
    }
    requireAuth(() => { setUpdatingItemId(itemId); setItemMutation.mutate({ itemId, quantity }); });
  };

  const printTab = () => {
    if (!activeTab) return;
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) { toast.error("Permita pop-ups para imprimir a comanda"); return; }
    const itemRows = activeTab.items.map((item: any) => `<div class="item"><div><b>${escapeHtml(`${item.quantity}x ${item.productName}`)}</b><small>Lançado por: ${escapeHtml(item.addedByName || "Operador")}</small>${item.note ? `<small>Obs.: ${escapeHtml(item.note)}</small>` : ""}</div><strong>${money(item.quantity * item.unitPriceCents)}</strong></div>`).join("");
    const paymentRows = activeTab.payments.map((payment: any) => `<div class="line"><span>${escapeHtml(methodLabel[payment.method as Method])}</span><b>${money(payment.amountCents)}</b></div>`).join("");
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comanda ${escapeHtml(activeTab.tabCode)}</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;margin:0;background:#fff;color:#000}body{padding:5mm 4mm;font-family:"Courier New",monospace;font-size:12px;line-height:1.35}.receipt{text-align:left}.center{text-align:center}.brand{font-size:18px;font-weight:700;letter-spacing:2px}.muted{font-size:10px}.rule{border-top:1px dashed #000;margin:9px 0}.line,.item{display:flex;justify-content:space-between;gap:8px}.item{align-items:flex-start;margin:5px 0}.item>div{min-width:0}.item b{display:block;overflow-wrap:anywhere}.item small{display:block;font-size:10px;margin-top:1px;overflow-wrap:anywhere}.item strong,.line b{white-space:nowrap}.total{font-size:14px;font-weight:700}.footer{margin-top:14px;font-size:10px;text-align:center}@media print{body{padding:4mm}.no-print{display:none}}</style></head><body><main class="receipt"><div class="center brand">SHADOW LOUNGE</div><div class="center muted">COMANDA ${escapeHtml(activeTab.tabCode)}</div><div class="rule"></div><div class="line"><span>Mesa</span><b>${escapeHtml(activeTab.tableNumber)}</b></div>${activeTab.customerName ? `<div class="line"><span>Cliente</span><b>${escapeHtml(activeTab.customerName)}</b></div>` : ""}<div class="line"><span>Abertura</span><b>${escapeHtml(dateTime(activeTab.openedAt))}</b></div><div class="rule"></div>${itemRows || `<div class="center muted">Nenhum item lançado</div>`}<div class="rule"></div><div class="line"><span>Subtotal</span><b>${money(activeTab.subtotalCents ?? activeTab.totalCents)}</b></div>${activeTab.tipCents ? `<div class="line"><span>Gorjeta</span><b>${money(activeTab.tipCents)}</b></div>` : ""}<div class="line"><span>Pagamentos</span><b>− ${money(activeTab.paidCents)}</b></div><div class="line total"><span>SALDO</span><b>${money(activeTab.balanceCents)}</b></div>${paymentRows ? `<div class="rule"></div><div class="muted">PAGAMENTOS</div>${paymentRows}` : ""}<div class="footer">Obrigado pela preferência</div></main><script>window.onload=()=>{window.focus();window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  const processPayment = () => requireAuth(() => {
    if (!activeTab) return;
    const cents = Math.round(Number(paymentValue.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { toast.error("Informe um valor de pagamento válido"); return; }
    if (activeTab.id < 0) {
      const totals = offlineTotals(activeOfflineTab!);
      if (cents > totals.balanceCents) { toast.error("O pagamento não pode superar o saldo pendente"); return; }
      updateOfflineTab(activeTab, (current) => ({ ...current, payments: [...current.payments, { id: `${current.offlineKey}-payment-${Date.now()}`, amountCents: cents, method: paymentMethod, requestKey: `${current.offlineKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() }] }));
      setPaymentOpen(false); setPaymentValue(""); toast.success("Pagamento salvo offline");
      return;
    }
    payMutation.mutate({ tabId: activeTab.id, amountCents: cents, method: paymentMethod, requestKey: `${activeTab.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  });

  const toggleTip = (checked: boolean) => {
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
  const visibleNav = nav.filter((item) => {
    if (localRole === "attendant") return item.id === "tables";
    if (localRole === "manager") return item.id !== "users";
    if (localRole === "administrator") return true;
    return item.id === "tables";
  });
  useEffect(() => {
    if (!isAuthenticated || !localRole) return;
    setPage(localRole === "attendant" ? "tables" : localRole === "manager" ? "dashboard" : "products");
  }, [isAuthenticated, localRole]);

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
          <button className={`nav-item ${page === "settings" ? "nav-item-active" : ""}`} disabled={addItemMutation.isPending || setItemMutation.isPending} onClick={() => setPage("settings")}><Settings size={19} /><span>Configurações</span></button>
          {user ? <button className="operator-card" onClick={endSession}><span className="operator-avatar">{(user.name || "O").slice(0, 1)}</span><span><b>{user.name || "Operador"}</b><small>Encerrar sessão</small></span></button> : <button className="login-card" onClick={() => setLoginOpen(true)}><LogIn size={18} /><span>Entrar no sistema</span></button>}
        </div>
      </aside>
      {mobileNav ? <div className="nav-scrim" onClick={() => setMobileNav(false)} /> : null}

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={21} /></button><div><p className="eyebrow">SHADOW LOUNGE <span>/</span> {page === "tables" ? "ATENDIMENTO" : page.toUpperCase()}</p><h1>{page === "tables" ? "Mesas" : page === "dashboard" ? "Visão geral" : page === "products" ? "Produtos" : page === "stock" ? "Estoque" : page === "finance" ? "Financeiro" : page === "reports" ? "Relatórios" : page === "users" ? "Usuários e auditoria" : "Configurações"}</h1></div></div>
          <div className="topbar-actions"><div className="date-chip"><span className={connectionOnline ? "pulse-dot" : "danger"} /> {connectionOnline ? "Online" : "Offline"}{offlineTabs.length ? ` · ${offlineTabs.length} pendente${offlineTabs.length > 1 ? "s" : ""}` : ""}</div><div className="date-chip"><Clock3 size={16} /><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date())}</span></div>{!isAuthenticated && <Button className="login-button" onClick={() => setLoginOpen(true)}><LogIn size={16} /> Entrar</Button>}</div>
        </header>

        {!isAuthenticated && <div className="demo-banner"><Sparkles size={17} /><span><b>Visão demonstrativa</b> — entre para abrir comandas, registrar pagamentos e persistir os dados.</span><button onClick={() => setLoginOpen(true)}>Acessar operação <ArrowUpRight size={15} /></button></div>}

        <div className="page-container">
          {page === "dashboard" && <Dashboard dashboard={dashboard} occupiedCount={occupiedCount} onNavigate={setPage} />}
          {page === "tables" && !activeTab && !selectedTabId && <TablesGrid tables={tables} onSelect={selectTable} isOpening={openTabMutation.isPending} />}
          {page === "tables" && selectedTabId && !activeTab && <div className="loading-screen inline-loading"><div className="loading-mark"><ReceiptText size={24} /></div><span>Carregando comanda...</span></div>}
          {page === "tables" && activeTab && <TabDetail tab={activeTab} products={filteredProducts} search={productSearch} setSearch={setProductSearch} tipEnabled={tipEnabled} setTipEnabled={toggleTip} onApplyCharges={() => activeTab && chargesMutation.mutate({ tabId: activeTab.id, tipPercent: tipEnabled ? 10 : 0 })} onBack={() => setSelectedTabId(null)} onName={() => { setCustomerNameInput(activeTab.customerName ?? ""); setCustomerNameOpen(true); }} onPrint={printTab} onAdd={(product: any) => addProduct(product)} launchingProductId={launchingProductId} updatingItemId={updatingItemId} onQuantity={changeItemQuantity} onPayment={() => { setPaymentValue((activeTab.balanceCents / 100).toFixed(2)); setPaymentOpen(true); }} onTransfer={() => { setTransferDestination(null); setTransferOpen(true); }} onClose={() => activeTab.id < 0 ? toast.info("A comanda offline será encerrada após sincronizar") : requireAuth(() => closeMutation.mutate({ tabId: activeTab.id }))} loading={addItemMutation.isPending || setItemMutation.isPending || payMutation.isPending || closeMutation.isPending || chargesMutation.isPending || transferMutation.isPending || customerNameMutation.isPending || syncOfflineMutation.isPending} />}
          {page === "products" && <ProductsPage products={products} onNewCategory={() => requireAuth(() => setCategoryOpen(true))} onNew={() => { setEditingProduct(null); setNewProduct({ name: "", code: "", categoryId: 1, unit: "un", cost: "", price: "", stock: "", minimum: "" }); setProductOpen(true); }} onEdit={(product: any) => { setEditingProduct(product); setNewProduct({ name: product.name, code: product.code, categoryId: product.categoryId ?? 1, unit: product.unit ?? "un", cost: String(product.costCents / 100), price: String(product.priceCents / 100), stock: String(product.stockQuantity), minimum: String(product.minimumStock) }); setProductOpen(true); }} onDelete={(id: number) => { if (window.confirm("Remover este produto? Esta ação não pode ser desfeita.")) deleteProductMutation.mutate({ productId: id }); }} />}
          {page === "stock" && <StockPage products={products} onAdjust={(product) => { setStockProduct(product); setStockQty("1"); setStockSheet(true); }} />}
          {page === "finance" && <FinancePage dashboard={dashboard} expenses={expensesQuery.data ?? [{ id: 1, description: "Reposição de bebidas", category: "Fornecedores", amountCents: 12450, method: "pix" as Method, occurredAt: new Date(), userName: "Rafael" }, { id: 2, description: "Conta de energia", category: "Energia", amountCents: 6800, method: "debit" as Method, occurredAt: new Date(Date.now() - 86400000), userName: "Rafael" }]} onNewExpense={() => requireAuth(() => setExpenseOpen(true))} />}
          {page === "reports" && <ReportsPage summary={reportSummaryQuery.data} history={historyQuery.data ?? []} from={historyFrom} to={historyTo} setFrom={setHistoryFrom} setTo={setHistoryTo} loading={reportSummaryQuery.isLoading} />}
          {page === "users" && <UsersPage audits={auditQuery.data ?? []} users={accessQuery.data ?? []} onUpdate={(input: any) => requireAuth(() => updateAccessMutation.mutate(input))} onCreate={() => setUserCreateOpen(true)} />}
          {page === "settings" && <SettingsPage products={products} rules={pricingRulesQuery.data ?? []} tableLimit={commercialSettingsQuery.data?.maxTables ?? 20} tableLimitSaving={updateTableLimitMutation.isPending} onCreateRule={(input: any) => requireAuth(() => createPriceRuleMutation.mutate(input))} onSetRuleActive={(input: any) => requireAuth(() => setPriceRuleActiveMutation.mutate(input))} onDeleteRule={(input: any) => requireAuth(() => deletePriceRuleMutation.mutate(input))} onUpdateTableLimit={(maxTables) => requireAuth(() => updateTableLimitMutation.mutate({ maxTables }))} />}
        </div>
      </main>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent><DialogHeader><div className="dialog-icon"><Package size={20} /></div><DialogTitle>Nova categoria</DialogTitle><DialogDescription>Crie uma categoria para organizar os produtos do estoque.</DialogDescription></DialogHeader><div className="expense-form"><label className="field-label">Nome da categoria<Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Ex.: Drinks" /></label><Button className="primary-wide" onClick={() => { if (categoryName.trim().length < 2) { toast.error("Informe um nome válido"); return; } createCategoryMutation.mutate({ name: categoryName.trim() }); }} disabled={createCategoryMutation.isPending}>{createCategoryMutation.isPending ? "Criando..." : "Criar categoria"}</Button></div></DialogContent></Dialog>

      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent>
          <DialogHeader><div className="dialog-icon"><Package size={20} /></div><DialogTitle>{editingProduct ? "Editar produto" : "Novo produto"}</DialogTitle><DialogDescription>Cadastre um item para lançar em comandas e acompanhar no estoque.</DialogDescription></DialogHeader>
          <div className="expense-form product-form-grid">
            <label className="field-label">Nome<Input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="Ex.: Gin tônica" /></label>
            <label className="field-label">Código<Input value={newProduct.code} onChange={(event) => setNewProduct({ ...newProduct, code: event.target.value })} placeholder="Ex.: DRK-001" /></label>
            <label className="field-label">Categoria<select value={newProduct.categoryId} onChange={(event) => setNewProduct({ ...newProduct, categoryId: Number(event.target.value) })}>{(categoriesQuery.data ?? [{ id: 1, name: "Cervejas" }, { id: 2, name: "Bebidas" }, { id: 6, name: "Narguilé" }]).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <div className="form-two-col"><label className="field-label">Custo (R$)<Input type="number" inputMode="decimal" value={newProduct.cost} onChange={(event) => setNewProduct({ ...newProduct, cost: event.target.value })} placeholder="0,00" /></label><label className="field-label">Venda (R$)<Input type="number" inputMode="decimal" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} placeholder="0,00" /></label></div>
            <div className="form-two-col"><label className="field-label">Estoque inicial<Input type="number" inputMode="numeric" value={newProduct.stock} onChange={(event) => setNewProduct({ ...newProduct, stock: event.target.value })} placeholder="0" /></label><label className="field-label">Estoque mínimo<Input type="number" inputMode="numeric" value={newProduct.minimum} onChange={(event) => setNewProduct({ ...newProduct, minimum: event.target.value })} placeholder="0" /></label></div>
            <Button className="primary-wide" onClick={() => { const costCents = Math.round(Number(newProduct.cost.replace(",", ".")) * 100); const priceCents = Math.round(Number(newProduct.price.replace(",", ".")) * 100); if (!newProduct.name || !newProduct.code || !priceCents) { toast.error("Preencha nome, código e preço de venda"); return; } saveProductMutation.mutate({ id: editingProduct?.id, name: newProduct.name, code: newProduct.code, categoryId: newProduct.categoryId, unit: newProduct.unit, costCents, priceCents, stockQuantity: Number(newProduct.stock) || 0, minimumStock: Number(newProduct.minimum) || 0, active: true }); }} disabled={saveProductMutation.isPending}>{saveProductMutation.isPending ? "Salvando..." : editingProduct ? "Salvar alterações" : "Cadastrar produto"}</Button>
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

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><WalletCards size={20} /></div><DialogTitle>Registrar pagamento</DialogTitle><DialogDescription>O pagamento é acumulativo e não encerra a comanda.</DialogDescription></DialogHeader>
          {activeTab && <div className="payment-summary"><div><span>Consumido</span><b>{money(activeTab.totalCents)}</b></div><div><span>Já pago</span><b>{money(activeTab.paidCents)}</b></div><div className="balance"><span>Saldo atual</span><b>{money(activeTab.balanceCents)}</b></div></div>}
          <label className="field-label">Valor a receber<Input type="number" inputMode="decimal" placeholder="0,00" value={paymentValue} onChange={(e) => setPaymentValue(e.target.value)} /></label>
          <div className="method-grid">{(Object.keys(methodLabel) as Method[]).map((method) => <button key={method} onClick={() => setPaymentMethod(method)} className={paymentMethod === method ? "method-active" : ""}>{method === "pix" ? <Zap size={19} /> : method === "cash" ? <Banknote size={19} /> : <CreditCard size={19} />}<span>{methodLabel[method]}</span></button>)}</div>
          <Button className="primary-wide" onClick={processPayment} disabled={payMutation.isPending}>{payMutation.isPending ? "Registrando..." : "Confirmar pagamento"}</Button>
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
          <DialogHeader><div className="dialog-icon"><Users size={20} /></div><DialogTitle>Nome da mesa</DialogTitle><DialogDescription>Associe a comanda ao nome da pessoa ou grupo atendido.</DialogDescription></DialogHeader>
          <label className="field-label">Nome<Input autoFocus maxLength={120} value={customerNameInput} onChange={(event) => setCustomerNameInput(event.target.value)} placeholder="Ex.: João, Ana e amigos" /></label>
          <Button className="primary-wide" disabled={customerNameMutation.isPending || !activeTab} onClick={() => { if (!activeTab) return; const customerName = customerNameInput.trim() || null; if (activeTab.id < 0) { updateOfflineTab(activeTab, (current) => ({ ...current, customerName })); setCustomerNameOpen(false); } else customerNameMutation.mutate({ tabId: activeTab.id, customerName }); }}>{customerNameMutation.isPending ? "Salvando..." : "Salvar nome"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={(open) => { setNoteOpen(open); if (!open) { setPendingProduct(null); setItemNote(""); setLaunchQuantity("1"); } }}>
        <DialogContent className="payment-dialog">
          <DialogHeader><div className="dialog-icon"><FileText size={20} /></div><DialogTitle>Observação do lançamento</DialogTitle><DialogDescription>{pendingProduct ? `Inclua uma observação para ${pendingProduct.name} · Preço: ${money(pendingProduct.priceCents)}.` : "Inclua uma observação para o produto."}</DialogDescription></DialogHeader>
          <label className="field-label">Quantidade<Input autoFocus type="number" inputMode="numeric" min="1" max="999" value={launchQuantity} onChange={(event) => setLaunchQuantity(event.target.value)} /></label>
          <label className="field-label">Observação (opcional)<Textarea maxLength={500} value={itemNote} onChange={(event) => setItemNote(event.target.value)} placeholder="Ex.: sem gelo, sabor menta, entregar depois..." /></label>
          <Button className="primary-wide" disabled={addItemMutation.isPending || !pendingProduct} onClick={confirmAddProduct}>{addItemMutation.isPending ? "Lançando..." : "Lançar produto"}</Button>
        </DialogContent>
      </Dialog>

      <Sheet open={stockSheet} onOpenChange={setStockSheet}><SheetContent className="stock-sheet"><SheetHeader><SheetTitle>Ajustar estoque</SheetTitle></SheetHeader>{stockProduct && <div className="sheet-form"><div className="product-callout"><Package size={20} /><div><b>{stockProduct.name}</b><span>Disponível: {stockProduct.stockQuantity} un</span></div></div><label className="field-label">Movimentação<div className="direction-toggle"><button className={stockDirection === "in" ? "selected" : ""} onClick={() => setStockDirection("in")}><ArrowUpRight size={17} /> Entrada</button><button className={stockDirection === "out" ? "selected" : ""} onClick={() => setStockDirection("out")}><ArrowDownRight size={17} /> Saída</button></div></label><label className="field-label">Quantidade<Input type="number" inputMode="numeric" value={stockQty} onChange={(e) => setStockQty(e.target.value)} /></label><Button className="primary-wide" onClick={() => requireAuth(() => stockMutation.mutate({ productId: stockProduct.id, quantity: Number(stockQty), direction: stockDirection, reason: stockDirection === "in" ? "Reposição manual" : "Ajuste manual" }))}>Confirmar movimentação</Button></div>}</SheetContent></Sheet>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}><DialogContent><DialogHeader><div className="dialog-icon"><ReceiptText size={20} /></div><DialogTitle>Nova despesa</DialogTitle><DialogDescription>Esta saída será incluída no resultado financeiro.</DialogDescription></DialogHeader><div className="expense-form"><label className="field-label">Descrição<Input value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} placeholder="Ex.: compra de gelo" /></label><label className="field-label">Categoria<select value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>{expensesCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field-label">Valor<Input type="number" inputMode="decimal" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} placeholder="0,00" /></label><label className="field-label">Observação<Textarea value={expense.notes} onChange={(e) => setExpense({ ...expense, notes: e.target.value })} placeholder="Opcional" /></label><Button className="primary-wide" onClick={() => { const amountCents = Math.round(Number(expense.amount.replace(",", ".")) * 100); if (!expense.description || !amountCents) { toast.error("Preencha descrição e valor"); return; } expenseMutation.mutate({ description: expense.description, category: expense.category, amountCents, method: expense.method, notes: expense.notes, occurredAt: new Date() }); }}>Registrar despesa</Button></div></DialogContent></Dialog>
      {updateTableLimitMutation.isPending ? <div className="request-lock"><LoaderCircle className="launch-loader" size={21} /><span>Salvando a quantidade de mesas...</span></div> : null}
    </div>
  );
}

function LoginScreen({ credentials, setCredentials, passwordVisible, setPasswordVisible, mutation }: any) {
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate({ username: credentials.username, password: credentials.password }); };
  return <main className="login-screen"><section className="login-visual"><div className="login-visual-glow" /><img src="/shadow-lounge-icon-white.png" alt="Shadow Lounge" /><span>Gestão elegante para uma operação sob controle.</span></section><section className="login-card-shell"><div className="login-card-content"><div className="login-brand"><img src="/shadow-lounge-icon-white.png" alt="Shadow Lounge" /><div><strong>SHADOW LOUNGE</strong><span>GESTÃO & OPERAÇÃO</span></div></div><div className="login-heading"><span className="section-kicker">ACESSO AO SISTEMA</span><h1>Bem-vindo de volta.</h1><p>Entre com seu usuário para acessar sua área de trabalho.</p></div><form className="login-form" onSubmit={submit}><label className="field-label">Usuário ou e-mail<Input autoFocus autoComplete="username" value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value.toLowerCase() })} placeholder="seu.usuario" /></label><label className="field-label">Senha<div className="password-field"><Input autoComplete="current-password" type={passwordVisible ? "text" : "password"} value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} placeholder="Digite sua senha" /><button type="button" onClick={() => setPasswordVisible(!passwordVisible)} aria-label={passwordVisible ? "Ocultar senha" : "Exibir senha"}>{passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{mutation.error ? <div className="login-error" role="alert"><AlertTriangle size={16} /> Usuário ou senha inválidos.</div> : null}<Button type="submit" className="primary-wide login-submit" disabled={mutation.isPending || !credentials.username || !credentials.password}>{mutation.isPending ? "Entrando..." : "Entrar no sistema"}<ArrowUpRight size={17} /></Button></form><p className="login-footer">Acesso seguro · Shadow Lounge</p></div></section></main>;
}

function Dashboard({ dashboard, occupiedCount, onNavigate }: { dashboard: any; occupiedCount: number; onNavigate: (page: Page) => void }) {
  const cards = [
    { label: "Faturamento recebido", value: money(dashboard.paidCents), icon: TrendingUp, tone: "amber", detail: "+12,6% vs. período anterior" },
    { label: "Resultado financeiro", value: money(dashboard.resultCents), icon: WalletCards, tone: "green", detail: "Margem operacional saudável" },
    { label: "Comandas abertas", value: String(dashboard.openTabs), icon: ReceiptText, tone: "violet", detail: `${money(dashboard.pendingCents)} pendentes` },
    { label: "Mesas ocupadas", value: `${occupiedCount}/20`, icon: Table2, tone: "blue", detail: "Atendimento em andamento" },
  ];
  return <div className="dashboard-page"><section className="page-intro"><div><span className="section-kicker">PANORAMA DOS ÚLTIMOS 30 DIAS</span><h2>Operação sob controle.</h2><p>Receitas, comandas e estoque em uma única visão.</p></div><Button onClick={() => onNavigate("tables")}><Table2 size={17} /> Ir para mesas</Button></section><section className="metric-grid">{cards.map((card) => { const Icon = card.icon; return <article className="metric-card" key={card.label}><div className={`metric-icon ${card.tone}`}><Icon size={21} /></div><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>})}</section><section className="dashboard-grid"><article className="panel revenue-panel"><div className="panel-header"><div><span className="section-kicker">RECEITA</span><h3>Fluxo do período</h3></div><Badge variant="outline">30 dias</Badge></div><div className="bar-chart">{[32, 48, 38, 62, 50, 77, 57, 68, 91, 73, 84, 58, 66, 93].map((height, i) => <div key={i} className={i === 13 ? "bar hot" : "bar"} style={{ height: `${height}%` }} />)}</div><div className="chart-axis"><span>01 AGO</span><span>15 AGO</span><span>HOJE</span></div></article><article className="panel"><div className="panel-header"><div><span className="section-kicker">PAGAMENTOS</span><h3>Por forma de pagamento</h3></div></div><div className="payment-bars">{dashboard.paymentMethods.filter((item: any) => item.totalCents > 0).map((item: any) => <div key={item.method}><div><span>{methodLabel[item.method as Method]}</span><b>{money(item.totalCents)}</b></div><i><em style={{ width: `${Math.max(8, Math.round(item.totalCents / dashboard.paidCents * 100))}%` }} /></i></div>)}</div></article><article className="panel products-panel"><div className="panel-header"><div><span className="section-kicker">DESEMPENHO</span><h3>Mais vendidos</h3></div><button onClick={() => onNavigate("reports")}>Ver relatório <ArrowUpRight size={14} /></button></div><div className="rank-list">{dashboard.topProducts.map((product: any, index: number) => <div key={product.name}><b>0{index + 1}</b><span>{product.name}<small>{product.quantity} unidades</small></span><strong>{money(product.totalCents)}</strong></div>)}</div></article><article className="panel alert-panel"><div className="alert-icon"><AlertTriangle size={22} /></div><div><span className="section-kicker">ATENÇÃO NECESSÁRIA</span><h3>{dashboard.lowStock} item com estoque baixo</h3><p>Essência Mint Ice está abaixo do nível mínimo definido.</p><button onClick={() => onNavigate("stock")}>Revisar estoque <ArrowUpRight size={15} /></button></div></article></section></div>;
}

function TablesGrid({ tables, onSelect, isOpening }: { tables: any[]; onSelect: (table: any) => void; isOpening: boolean }) {
  const [filter, setFilter] = useState<"all" | "free" | "occupied">("all");
  const visible = tables.filter((table) => filter === "all" || filter === "free" ? filter === "all" || table.status === "free" : table.status !== "free");
  const freeCount = tables.filter((table) => table.status === "free").length;
  return <div className="tables-page"><section className="tables-heading"><div><span className="section-kicker">ATENDIMENTO RÁPIDO</span><h2>Selecione uma mesa</h2><p>{freeCount} livres · {tables.length - freeCount} em atendimento</p></div><div className="table-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <b>{tables.length}</b></button><button className={filter === "occupied" ? "active" : ""} onClick={() => setFilter("occupied")}>Ocupadas <b>{tables.length - freeCount}</b></button><button className={filter === "free" ? "active" : ""} onClick={() => setFilter("free")}>Livres <b>{freeCount}</b></button></div></section><div className="tables-grid">{visible.map((table) => <button key={table.id} className={`table-card table-${table.status}`} onClick={() => onSelect(table)}><div className="table-card-head"><span>MESA</span><b>{String(table.number).padStart(2, "0")}</b><i className={`status-dot ${table.status}`} /></div>{table.status === "free" ? <div className="free-table"><span>Disponível</span><strong><Plus size={16} /> Abrir comanda</strong></div> : <div className="busy-table"><div className="table-status"><span className={table.status}>{table.status === "partial" ? "Pagamento parcial" : "Em atendimento"}</span><small>{table.customerName || table.tabCode}</small></div><div className="table-totals"><span><small>Consumido</small><b>{money(table.totalCents)}</b></span><span><small>Saldo</small><b>{money(table.balanceCents)}</b></span></div><div className="table-time"><Clock3 size={14} /> Aberta {dateTime(table.openedAt)}</div></div>}</button>)}</div>{isOpening ? <div className="saving-indicator">Abrindo comanda...</div> : null}</div>;
}

function TabDetail({ tab, products, search, setSearch, tipEnabled, setTipEnabled, onApplyCharges, onBack, onName, onPrint, onAdd, launchingProductId, updatingItemId, onQuantity, onPayment, onTransfer, onClose, loading }: any) {
  return <div className="tab-page"><div className="tab-topline"><button className="back-button" onClick={onBack} disabled={loading}><ChevronLeft size={18} /> Voltar às mesas</button><div className="tab-topline-actions"><span><span className="live-dot" /> Comanda aberta</span><Button variant="outline" onClick={onPrint} disabled={loading}><Printer size={16} /> Imprimir</Button><Button variant="outline" onClick={onName} disabled={loading}><Pencil size={16} /> {tab.customerName ? tab.customerName : "Atribuir nome"}</Button><Button variant="outline" onClick={onTransfer} disabled={loading}><ArrowRightLeft size={16} /> Transferir mesa</Button></div></div><section className="tab-hero"><div><span className="section-kicker">MESA {String(tab.tableNumber).padStart(2, "0")}</span><h2>Comanda <em>{tab.tabCode}</em></h2><p>{tab.customerName ? `Cliente: ${tab.customerName} · ` : ""}Aberta por {tab.openedByName || "Operador"} · {dateTime(tab.openedAt)}</p></div><div className="tab-hero-total"><span>Saldo atual</span><strong>{money(tab.balanceCents)}</strong><small>Subtotal {money(tab.subtotalCents ?? tab.totalCents)} · Pago {money(tab.paidCents)}</small></div></section><div className="tab-layout"><section className="panel order-panel"><div className="panel-header"><div><span className="section-kicker">ITENS DA COMANDA</span><h3>{tab.items.length} itens lançados</h3></div><ReceiptText size={19} /></div><div className="order-items">{tab.items.map((item: any) => <div className="order-item" key={item.id}><div className="item-quantity"><button disabled={loading || item.quantity === 0} onClick={() => onQuantity(item.id, item.quantity - 1)}>−</button><b>{updatingItemId === item.id ? <LoaderCircle className="launch-loader" size={15} /> : `${item.quantity}x`}</b><button disabled={loading} onClick={() => onQuantity(item.id, item.quantity + 1)}>+</button></div><div><strong>{item.productName}</strong><small>Lançado por: {item.addedByName || "Este dispositivo"}</small>{item.note && <small>Obs.: {item.note}</small>}</div><b>{money(item.quantity * item.unitPriceCents)}</b></div>)}</div><div className="order-total"><span>SUBTOTAL</span><b>{money(tab.subtotalCents ?? tab.totalCents)}</b><span>GORJETA {tab.tipPercent ? `(${tab.tipPercent}%)` : ""}</span><b>{money(tab.tipCents ?? 0)}</b><span>PAGAMENTOS</span><b className="paid">− {money(tab.paidCents)}</b><strong>TOTAL / SALDO</strong><strong>{money(tab.totalCents)} / {money(tab.balanceCents)}</strong></div></section><aside className="products-panel-side"><div className="panel product-picker"><div className="panel-header"><div><span className="section-kicker">TOTAL DA COMANDA</span><h3>Gorjeta do garçom</h3></div><WalletCards size={19} /></div><div className="charge-box"><div className="mode-block"><span className="mode-title">Gorjeta do garçom</span><label className="checkbox-line"><input type="checkbox" checked={tipEnabled} onChange={(e) => setTipEnabled(e.target.checked)} disabled={loading} /><span>Adicionar 10% ao total</span></label></div></div><div className="panel-header product-header"><div><span className="section-kicker">LANÇAMENTO RÁPIDO</span><h3>Adicionar produto</h3></div><Beer size={19} /></div><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto ou código" disabled={loading} /></div><div className="quick-products">{products.slice(0, 7).map((product: any) => <button key={product.id} onClick={() => onAdd(product)} disabled={loading || !product.active}><span><b>{product.name}</b><small>{product.categoryName || "Outros"} · {product.stockQuantity} un · {money(product.priceCents)}</small></span><strong>{launchingProductId === product.id ? <LoaderCircle className="launch-loader" size={15} /> : <i><Plus size={15} /></i>}</strong></button>)}</div></div><div className="payment-actions"><Button variant="outline" className="print-button" onClick={onPrint} disabled={loading}><Printer size={18} /> Imprimir comanda</Button><Button variant="outline" className="pay-button" onClick={onPayment} disabled={loading || tab.balanceCents === 0}><WalletCards size={18} /> {tab.balanceCents ? "Receber pagamento" : "Saldo quitado"}</Button><Button className="close-button" onClick={onClose} disabled={loading || tab.balanceCents !== 0}><ShieldCheck size={18} /> Encerrar comanda</Button><small>O encerramento só é liberado quando o saldo for R$ 0,00.</small></div></aside></div><section className="panel launch-history-panel"><div className="panel-header"><div><span className="section-kicker">RASTREABILIDADE</span><h3>Histórico de lançamentos</h3></div><ClipboardList size={19} /></div>{(tab.launchHistory || []).length ? <div className="launch-history-list">{tab.launchHistory.map((entry: any) => <div className="launch-history-row" key={entry.id}><span className="audit-action">{entry.action === "ADD_ITEM" ? "LANÇAMENTO" : entry.action === "REMOVE_ITEM" ? "EXCLUSÃO" : "ALTERAÇÃO"}</span><p>{entry.description}<small>{entry.userName || "Operador"} · {dateTime(entry.createdAt)}</small></p></div>)}</div> : <p className="empty-inline">Nenhum lançamento auditado nesta comanda.</p>}</section><section className="panel payments-history"><div className="panel-header"><div><span className="section-kicker">HISTÓRICO PRESERVADO</span><h3>Pagamentos da comanda</h3></div></div>{tab.payments.length === 0 ? <p className="empty-inline">Nenhum pagamento registrado até o momento.</p> : <div>{tab.payments.map((payment: any) => <div className="payment-row" key={payment.id}><div className="payment-row-icon">{payment.method === "pix" ? <Zap size={17} /> : <CreditCard size={17} />}</div><span><b>{methodLabel[payment.method as Method]}</b><small>{payment.receivedByName || "Operador"} · {dateTime(payment.createdAt)}</small></span><strong>{money(payment.amountCents)}</strong></div>)}</div>}</section></div>;
}

function ProductsPage({ products, onNew, onEdit, onDelete, onNewCategory }: { products: any[]; onNew: () => void; onEdit: (product: any) => void; onDelete: (id: number) => void; onNewCategory: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = products.filter((product) => `${product.name} ${product.code} ${product.categoryName ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="products-page"><section className="page-intro"><div><span className="section-kicker">CATÁLOGO</span><h2>Produtos do lounge.</h2><p>Cadastre e mantenha o catálogo usado nas comandas.</p></div><div className="toolbar-actions"><Button variant="outline" onClick={onNewCategory}><Plus size={17} /> Nova categoria</Button><Button onClick={onNew}><Plus size={17} /> Novo produto</Button></div></section><section className="panel inventory-panel"><div className="inventory-toolbar"><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome, código ou categoria" /></div><Badge variant="outline">{filtered.length} produtos</Badge></div><div className="inventory-table"><div className="inventory-head"><span>Produto</span><span>Categoria</span><span>Preço</span><span>Status</span><span>Ações</span></div>{filtered.map((product) => <div className="inventory-row" key={product.id}><span><b>{product.name}</b><small>{product.code}</small></span><span><Badge variant="outline">{product.categoryName || "Sem categoria"}</Badge></span><span><b>{money(product.priceCents)}</b><small>custo {money(product.costCents)}</small></span><span><Badge variant={product.active ? "default" : "secondary"}>{product.active ? "Ativo" : "Inativo"}</Badge></span><span className="row-actions"><button onClick={() => onEdit(product)} aria-label="Editar produto"><Pencil size={16} /></button><button onClick={() => onDelete(product.id)} aria-label="Remover produto"><Trash2 size={16} /></button></span></div>)}</div></section></div>;
}

function StockPage({ products, onAdjust }: { products: any[]; onAdjust: (product: any) => void }) {
  const [search, setSearch] = useState("");
  const filtered = products.filter((product) => product.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const low = products.filter((product) => product.stockQuantity <= product.minimumStock);
  return <div className="stock-page"><section className="stock-hero"><div><span className="section-kicker">INVENTÁRIO EM TEMPO REAL</span><h2>Controle o que mantém o lounge aceso.</h2><p>Baixas automáticas por comanda e ajustes auditáveis.</p></div><div className="stock-summary"><span><Package size={18} /><b>{products.length}</b> produtos ativos</span><span className="low"><AlertTriangle size={18} /><b>{low.length}</b> em alerta</span></div></section>{low.length > 0 && <section className="low-stock-strip"><AlertTriangle size={20} /><div><b>Estoque baixo identificado</b><span>{low.map((item) => `${item.name} (${item.stockQuantity} un)`).join(" · ")}</span></div></section>}<section className="panel inventory-panel"><div className="inventory-toolbar"><div className="search-field"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no estoque" /></div></div><div className="inventory-table"><div className="inventory-head"><span>Produto</span><span>Categoria</span><span>Estoque</span><span>Preço de venda</span><span /></div>{filtered.map((product) => <div className="inventory-row" key={product.id}><span><b>{product.name}</b><small>{product.code}</small></span><span><Badge variant="outline">{product.categoryName || "Sem categoria"}</Badge></span><span><b className={product.stockQuantity <= product.minimumStock ? "danger" : ""}>{product.stockQuantity} un</b><small>mín. {product.minimumStock}</small></span><span><b>{money(product.priceCents)}</b><small>custo {money(product.costCents)}</small></span><button onClick={() => onAdjust(product)}>Ajustar</button></div>)}</div></section></div>;
}

function FinancePage({ dashboard, expenses, onNewExpense }: any) {
  return <div className="finance-page"><section className="page-intro"><div><span className="section-kicker">FINANCEIRO</span><h2>Resultado real da operação.</h2><p>Receitas recebidas, custo de produtos e despesas no mesmo período.</p></div><Button onClick={onNewExpense}><Plus size={17} /> Nova despesa</Button></section><section className="finance-stat-row"><div><span>Recebido em vendas</span><b>{money(dashboard.paidCents)}</b><i className="positive"><ArrowUpRight size={15} /> Entradas</i></div><div><span>Custo dos produtos</span><b>{money(dashboard.costCents)}</b><i><ArrowDownRight size={15} /> CMV</i></div><div><span>Despesas operacionais</span><b>{money(dashboard.expensesCents)}</b><i><ArrowDownRight size={15} /> Saídas</i></div><div className="result-card"><span>Resultado</span><b>{money(dashboard.resultCents)}</b><i>{Math.round(dashboard.resultCents / Math.max(1, dashboard.paidCents) * 100)}% margem</i></div></section><section className="panel expenses-panel"><div className="panel-header"><div><span className="section-kicker">LANÇAMENTOS</span><h3>Despesas recentes</h3></div><Badge variant="outline">{expenses.length} registros</Badge></div><div className="expense-list">{expenses.map((item: any) => <div key={item.id}><div className="expense-icon"><ReceiptText size={18} /></div><span><b>{item.description}</b><small>{item.category} · {item.userName || "Operador"}</small></span><span><small>{dateTime(item.occurredAt)}</small><b>− {money(item.amountCents)}</b></span></div>)}</div></section></div>;
}

function ReportsPage({ summary, history, from, to, setFrom, setTo, loading }: any) {
  const data = summary ?? { salesCents: 0, salesCount: 0, productUnits: 0, expensesCents: 0, resultCents: 0, paymentMethods: [], products: [], launches: [] };
  return <div className="reports-page"><section className="page-intro"><div><span className="section-kicker">CENTRAL DE RELATÓRIOS</span><h2>Operação em detalhes.</h2><p>Filtre o período para acompanhar recebimentos, saídas, produtos e lançamentos realizados.</p></div><Button variant="outline"><FileText size={17} /> Exportar CSV</Button></section><section className="panel history-filter"><div><span className="section-kicker">PERÍODO DO RELATÓRIO</span><h3>Filtros aplicados a todos os indicadores</h3></div><div className="history-date-fields"><label className="field-label">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="field-label">Até<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>Limpar</Button></div></section>{loading ? <div className="report-loading"><LoaderCircle className="launch-loader" size={22} /> Atualizando relatório...</div> : <><section className="report-cards"><article><div className="report-icon amber"><TrendingUp size={20} /></div><span>Vendas</span><b>{money(data.salesCents)}</b><small>{data.salesCount} comandas com pagamentos no período</small></article><article><div className="report-icon green"><Package size={20} /></div><span>Produtos</span><b>{data.productUnits} un</b><small>Unidades lançadas no período</small></article><article><div className="report-icon violet"><WalletCards size={20} /></div><span>Financeiro</span><b>{money(data.resultCents)}</b><small>Resultado após custos e despesas</small></article></section><div className="report-detail-grid"><section className="panel"><div className="panel-header"><div><span className="section-kicker">LASTRO DE RECEBIMENTOS</span><h3>Métodos de pagamento</h3></div><Badge variant="outline">{money(data.salesCents)}</Badge></div>{data.paymentMethods.length ? <div className="payment-bars report-payment-bars">{data.paymentMethods.map((item: any) => <div key={item.method}><div><span>{methodLabel[item.method as Method]}</span><b>{money(item.totalCents)}</b></div><i><em style={{ width: `${Math.max(8, Math.round(item.totalCents / Math.max(1, data.salesCents) * 100))}%` }} /></i><small>{item.count} recebimento{item.count === 1 ? "" : "s"}</small></div>)}</div> : <p className="empty-inline">Nenhum pagamento no período.</p>}</section><section className="panel"><div className="panel-header"><div><span className="section-kicker">SAÍDA DE PRODUTOS</span><h3>Produtos mais lançados</h3></div><Badge variant="outline">{data.productUnits} un</Badge></div>{data.products.length ? <div className="report-product-summary">{data.products.slice(0, 12).map((item: any) => <div className="report-product-row" key={item.productName}><span><b>{item.productName}</b><small>{item.quantity} unidades lançadas</small></span><strong>{money(item.totalCents)}</strong></div>)}</div> : <p className="empty-inline">Nenhum produto lançado no período.</p>}</section></div><section className="panel report-table-panel"><div className="panel-header"><div><span className="section-kicker">DETALHE DOS PEDIDOS</span><h3>Produtos lançados por comanda</h3></div><Badge variant="outline">{history.length} registros</Badge></div>{history.length ? history.slice(0, 100).map((item: any) => <div className="report-product-row" key={item.id}><b>M{String(item.tableNumber).padStart(2, "0")}</b><span>{item.productName}<small>{item.tabCode} · {dateTime(item.createdAt)} · Unitário {money(item.unitPriceCents)}</small></span><i><em style={{ width: `${Math.min(100, item.quantity * 20)}%` }} /></i><strong>{item.quantity} un</strong><small>{money(item.quantity * item.unitPriceCents)}</small></div>) : <p className="empty-inline">Nenhum pedido encontrado neste período.</p>}</section></>}</div>;
}
function UsersPage({ audits, users, onUpdate, onCreate }: { audits: any[]; users: any[]; onUpdate: (input: any) => void; onCreate: () => void }) {
  return <div className="users-page"><section className="page-intro"><div><span className="section-kicker">ACESSO E RASTREABILIDADE</span><h2>Equipe e auditoria.</h2><p>Defina quem pode operar mesas, estoque e financeiro.</p></div></section><section className="role-cards"><div><ShieldCheck size={20} /><b>Administrador</b><span>Acesso completo e controle de permissões</span></div><div><Users size={20} /><b>Gerente</b><span>Operação, estoque, financeiro e regras comerciais</span></div><div><ClipboardList size={20} /><b>Atendente</b><span>Mesas, comandas e pagamentos</span></div></section><section className="panel access-panel"><div className="panel-header"><div><span className="section-kicker">PERMISSÕES</span><h3>Usuários cadastrados</h3></div><Button onClick={onCreate}><Plus size={16} /> Novo usuário</Button></div>{users.length ? users.map((item: any) => <div className="access-row" key={item.id}><div><b>{item.name || item.username || "Usuário"}</b><small>{item.email || item.username || "Acesso local"}</small></div><select value={item.localRole || "attendant"} onChange={(e) => onUpdate({ userId: item.id, localRole: e.target.value, active: item.active !== false })}><option value="administrator">Administrador</option><option value="manager">Gerente</option><option value="attendant">Atendente</option></select><label className="checkbox-line"><input type="checkbox" checked={item.active !== false} onChange={(e) => onUpdate({ userId: item.id, localRole: item.localRole || "attendant", active: e.target.checked })} /><span>Ativo</span></label></div>) : <p className="empty-inline">Nenhum usuário cadastrado.</p>}</section><section className="panel audit-panel"><div className="panel-header"><div><span className="section-kicker">LOGS IMUTÁVEIS</span><h3>Auditoria recente</h3></div></div>{audits.length ? audits.map((audit) => <div className="audit-row" key={audit.id}><span className="audit-action">{audit.action.replace("_", " ")}</span><p>{audit.description}<small>{audit.userName || "Operador"} · {dateTime(audit.createdAt)}</small></p></div>) : <div className="empty-audit"><ShieldCheck size={22} /><div><b>As ações relevantes serão registradas aqui.</b><span>Abra uma comanda, ajuste estoque ou receba um pagamento para gerar o histórico.</span></div></div>}</section></div>;
}

function SettingsPage({ products, rules, tableLimit, tableLimitSaving, onCreateRule, onSetRuleActive, onDeleteRule, onUpdateTableLimit }: { products: any[]; rules: any[]; tableLimit: number; tableLimitSaving: boolean; onCreateRule: (input: any) => void; onSetRuleActive: (input: any) => void; onDeleteRule: (input: any) => void; onUpdateTableLimit: (maxTables: number) => void }) {
  const [form, setForm] = useState({ maxTables: String(tableLimit) });
  const [rule, setRule] = useState({ productId: products[0]?.id ?? 1, name: "Preço especial", startTime: "15:00", endTime: "21:00", price: "12" });
  
  useEffect(() => { if (products[0] && !products.some((product) => product.id === rule.productId)) setRule((current) => ({ ...current, productId: products[0].id })); }, [products, rule.productId]);
  useEffect(() => { setForm({ maxTables: String(tableLimit) }); }, [tableLimit]);
  return <div className="settings-page"><section className="page-intro"><div><span className="section-kicker">PREFERÊNCIAS DA OPERAÇÃO</span><h2>Configurações comerciais.</h2><p>A operação utiliza somente a gorjeta fixa de 10% do garçom.</p></div></section><section className="panel table-limit-panel"><div className="panel-header"><div><span className="section-kicker">SALÃO</span><h3>Quantidade de mesas</h3><p className="panel-help">Defina quantas mesas ficam disponíveis para a operação.</p></div></div><div className="price-rule-form"><label className="field-label">Mesas disponíveis<Input type="number" min="1" max="100" value={form.maxTables ?? String(tableLimit)} onChange={(event) => setForm({ maxTables: event.target.value })} disabled={tableLimitSaving} /></label><Button disabled={tableLimitSaving} onClick={() => { const maxTables = Number(form.maxTables); if (!Number.isInteger(maxTables) || maxTables < 1 || maxTables > 100) { toast.error("Informe entre 1 e 100 mesas"); return; } onUpdateTableLimit(maxTables); }}>{tableLimitSaving ? "Salvando..." : "Salvar quantidade"}</Button></div></section><section className="panel tip-settings-panel"><div className="panel-header"><div><span className="section-kicker">GORJETA DO GARÇOM</span><h3>Modalidade separada</h3><p className="panel-help">A gorjeta é adicionada em 10% quando marcada na comanda.</p></div><Badge className="local-badge">10%</Badge></div></section><section className="panel price-rules-panel"><div className="panel-header"><div><span className="section-kicker">PREÇO PROGRAMADO</span><h3>Preço por produto e horário</h3><p className="panel-help">Exemplo: Narguilé Premium das 15:00 às 21:00 por R$ 12,00.</p></div></div><div className="price-rule-form"><label className="field-label">Produto<select value={rule.productId} onChange={(e) => setRule({ ...rule, productId: Number(e.target.value) })}>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label className="field-label">Nome da regra<Input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} /></label><label className="field-label">De<Input type="time" value={rule.startTime} onChange={(e) => setRule({ ...rule, startTime: e.target.value })} /></label><label className="field-label">Até<Input type="time" value={rule.endTime} onChange={(e) => setRule({ ...rule, endTime: e.target.value })} /></label><label className="field-label">Preço (R$)<Input type="number" inputMode="decimal" value={rule.price} onChange={(e) => setRule({ ...rule, price: e.target.value })} /></label><Button onClick={() => { const priceCents = Math.round(Number(rule.price.replace(",", ".")) * 100); if (!rule.productId || !rule.name || !priceCents) { toast.error("Preencha produto, nome e preço"); return; } onCreateRule({ productId: rule.productId, name: rule.name, startTime: rule.startTime, endTime: rule.endTime, priceCents }); }}>Criar regra</Button></div><div className="price-rules-list">{rules.length ? rules.map((item: any) => <div className={`price-rule-row ${item.active ? "" : "price-rule-inactive"}`} key={item.id}><span><b>{item.productName}</b><small>{item.name} · {item.startTime}–{item.endTime} · {item.active ? "Ativa" : "Inativa"}</small></span><strong>{money(item.priceCents)}</strong><div className="price-rule-actions"><Button variant="outline" size="sm" onClick={() => onSetRuleActive({ ruleId: item.id, active: !item.active })}>{item.active ? "Desativar" : "Ativar"}</Button><Button variant="outline" size="sm" onClick={() => onDeleteRule({ ruleId: item.id })}>Excluir</Button></div></div>) : <p className="empty-inline">Nenhum preço programado cadastrado.</p>}</div></section><section className="settings-list"><div><div><b>Impedir estoque negativo</b><span>Bloqueia lançamentos quando não houver saldo disponível.</span></div><Badge className="local-badge">ATIVO</Badge></div></section></div>;
}
