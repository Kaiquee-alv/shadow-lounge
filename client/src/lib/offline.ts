export type OfflinePayment = {
  id: string;
  amountCents: number;
  method: "pix" | "cash" | "debit" | "credit" | "other";
  requestKey: string;
  createdAt: string;
};

export type OfflineItem = {
  id: string;
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  note?: string | null;
  createdAt: string;
};

export type OfflineTab = {
  id: number;
  offlineKey: string;
  deviceId: string;
  tableId: number;
  tableNumber: number;
  tabCode: string;
  customerName: string | null;
  status: "open";
  tipPercent: 0 | 10;
  tipCents: number;
  items: OfflineItem[];
  payments: OfflinePayment[];
  createdAt: string;
};

const TAB_KEY = "shadow-lounge.offline-tabs.v1";
const CACHE_PREFIX = "shadow-lounge.cache.v1.";
const DEVICE_KEY = "shadow-lounge.device-id.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

function write<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export function cached<T>(name: string, value?: T): T | null {
  const key = `${CACHE_PREFIX}${name}`;
  if (value !== undefined) { write(key, { value, updatedAt: new Date().toISOString() }); return value; }
  return read<{ value: T } | null>(key, null)?.value ?? null;
}

export function getOfflineTabs(): OfflineTab[] { return read<OfflineTab[]>(TAB_KEY, []).map((tab) => ({ ...tab, deviceId: tab.deviceId ?? "legacy-device" })); }
export function saveOfflineTabs(tabs: OfflineTab[]) { write(TAB_KEY, tabs); }
export function getOfflineTabById(id: number) { return getOfflineTabs().find((tab) => tab.id === id) ?? null; }
export function getOfflineTabByTable(tableId: number) { return getOfflineTabs().find((tab) => tab.tableId === tableId) ?? null; }
export function saveOfflineTab(tab: OfflineTab) {
  const tabs = getOfflineTabs().filter((item) => item.offlineKey !== tab.offlineKey);
  saveOfflineTabs([...tabs, tab]);
}
export function removeOfflineTab(offlineKey: string) { saveOfflineTabs(getOfflineTabs().filter((tab) => tab.offlineKey !== offlineKey)); }
export function createOfflineTab(table: { id: number; number: number }): OfflineTab {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id: -Date.now(), offlineKey: `OFF-${suffix}`, deviceId: getDeviceId(), tableId: table.id, tableNumber: table.number, tabCode: `OFF-${suffix.slice(-8)}`, customerName: null, status: "open", tipPercent: 0, tipCents: 0, items: [], payments: [], createdAt: new Date().toISOString() };
}
export function getDeviceId() {
  if (typeof window === "undefined") return "server";
  const current = window.localStorage.getItem(DEVICE_KEY);
  if (current) return current;
  const created = `device-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  window.localStorage.setItem(DEVICE_KEY, created);
  return created;
}
export function offlineTotals(tab: OfflineTab) {
  const subtotalCents = tab.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const tipCents = Math.round(subtotalCents * tab.tipPercent / 100);
  const paidCents = tab.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { subtotalCents, tipCents, totalCents: subtotalCents + tipCents, paidCents, balanceCents: Math.max(subtotalCents + tipCents - paidCents, 0) };
}
export function offlineTabView(tab: OfflineTab) {
  return { ...tab, id: tab.id, openedAt: tab.createdAt, openedByName: "Operador offline", items: tab.items, ...offlineTotals(tab), payments: tab.payments };
}
export function isOffline() { return typeof navigator !== "undefined" && navigator.onLine === false; }
