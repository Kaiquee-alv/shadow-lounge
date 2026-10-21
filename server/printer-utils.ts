import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type PrintReceiptLine = {
  text: string;
  align?: "left" | "center";
  size?: "small" | "normal" | "large";
  bold?: boolean;
  separator?: boolean;
};

export type PrintReceiptPayload = {
  kind: "tab" | "barista" | "cash";
  lines: PrintReceiptLine[];
};

export type PrintableTab = {
  id: number;
  tabCode: string;
  tableNumber: number;
  customerName?: string | null;
  openedAt: Date | string;
  items: Array<{
    id: number;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    note?: string | null;
    discountReason?: string | null;
    addedByName?: string | null;
    createdAt?: Date | string;
  }>;
  payments: Array<{ method: string; amountCents: number }>;
  subtotalCents: number;
  tipCents: number;
  paidCents: number;
  totalCents: number;
  balanceCents: number;
};

export function createPrinterPairingCode() {
  return randomBytes(18).toString("base64url");
}

export function createPrinterAgentToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrinterSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function printerSecretMatches(secret: string, expectedHash: string | null | undefined) {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const suppliedHash = Buffer.from(hashPrinterSecret(secret), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100).replace(/\u00a0/g, " ");
const dateTime = (value: Date | string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const time = (value?: Date | string) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
const line = (text: string, options: Omit<PrintReceiptLine, "text"> = {}): PrintReceiptLine => ({ text, ...options });
const divider = (): PrintReceiptLine => ({ text: "", separator: true });

export function buildTabPrintPayload(tab: PrintableTab): PrintReceiptPayload {
  const lines: PrintReceiptLine[] = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line(`COMANDA ${tab.tabCode}`, { align: "center", size: "small" }),
    divider(),
    line(`Mesa: ${tab.tableNumber}`, { bold: true }),
  ];
  if (tab.customerName) lines.push(line(`Cliente: ${tab.customerName}`));
  lines.push(line(`Abertura: ${dateTime(tab.openedAt)}`), divider());
  if (tab.items.length) {
    for (const item of tab.items) {
      lines.push(line(`${item.quantity}x ${item.productName}`, { bold: true }));
      lines.push(line(`   ${money(item.quantity * item.unitPriceCents)}`));
      if (item.discountReason) lines.push(line(`   ${item.discountReason}` , { size: "small" }));
      if (item.addedByName) lines.push(line(`   Lançado por: ${item.addedByName}`, { size: "small" }));
      if (item.createdAt) lines.push(line(`   Adicionado às ${time(item.createdAt)}`, { size: "small" }));
      if (item.note) lines.push(line(`   Obs.: ${item.note}`, { size: "small" }));
    }
  } else {
    lines.push(line("Nenhum item lançado", { align: "center", size: "small" }));
  }
  lines.push(divider(), line(`Subtotal: ${money(tab.subtotalCents)}`));
  if (tab.tipCents) lines.push(line(`Gorjeta: ${money(tab.tipCents)}`));
  lines.push(line(`Total: ${money(tab.totalCents)}`), line(`Pagamentos: - ${money(tab.paidCents)}`), line(`SALDO: ${money(tab.balanceCents)}`, { bold: true, size: "large" }));
  if (tab.payments.length) {
    const labels: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit: "Débito", credit: "Crédito", other: "Outros" };
    lines.push(divider(), line("PAGAMENTOS", { size: "small", bold: true }));
    for (const payment of tab.payments) lines.push(line(`${labels[payment.method] ?? payment.method}: ${money(payment.amountCents)}`));
  }
  lines.push(divider(), line("Obrigado pela preferência", { align: "center", size: "small" }));
  return { kind: "tab", lines };
}

export function buildBaristaPrintPayload(tab: PrintableTab, itemId: number): PrintReceiptPayload {
  const item = tab.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("O item selecionado não pertence a esta comanda");
  const lines: PrintReceiptLine[] = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line("PEDIDO PARA O BARISTA", { align: "center", size: "small" }),
    divider(),
    line("MESA", { align: "center", size: "small" }),
    line(String(tab.tableNumber), { align: "center", size: "large", bold: true }),
    line(tab.tabCode, { align: "center", size: "small" }),
    divider(),
    line(`${item.quantity}x`, { size: "large", bold: true }),
    line(item.productName, { size: "large", bold: true }),
  ];
  if (item.discountReason) lines.push(line(`${item.discountReason} · ${money(item.unitPriceCents)}`, { bold: true }));
  if (item.note) lines.push(divider(), line("OBSERVAÇÃO", { bold: true }), line(item.note, { size: "large" }));
  lines.push(line(`Lançado por: ${item.addedByName || "Operador"}`, { size: "small" }), divider(), line("Preparar e entregar na mesa indicada", { align: "center", size: "small" }));
  return { kind: "barista", lines };
}


export type PrintableCashSession = {
  id: number;
  status: "open" | "closed";
  openedAt: Date | string;
  closedAt?: Date | string | null;
  openedByName?: string | null;
  closedByName?: string | null;
  openingFloatCents: number;
  receivedCents: number;
  cashPaymentsCents: number;
  suppliesCents: number;
  withdrawalsCents: number;
  refundsCents: number;
  cashExpensesCents: number;
  nonCashExpensesCents: number;
  expectedCashCents: number;
  countedCashCents?: number | null;
  differenceCents?: number | null;
  closeNote?: string | null;
  paymentTotals: Array<{ method: string; totalCents: number; count?: number }>;
};

export function buildCashSessionPrintPayload(session: PrintableCashSession): PrintReceiptPayload {
  const methodLabels: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit: "Débito", credit: "Crédito", other: "Outros" };
  const open = session.status === "open";
  const lines: PrintReceiptLine[] = [
    line("SHADOW LOUNGE", { align: "center", size: "large", bold: true }),
    line("RESUMO DO CAIXA", { align: "center", bold: true }),
    line(`SESSÃO #${session.id}`, { align: "center", size: "small" }),
    divider(),
    line(`Status: ${open ? "ABERTO" : "ENCERRADO"}`, { bold: true }),
    line(`Abertura: ${dateTime(session.openedAt)}`),
    line(`Aberto por: ${session.openedByName || "Operador"}`),
  ];
  if (!open && session.closedAt) lines.push(line(`Fechamento: ${dateTime(session.closedAt)}`));
  if (!open && session.closedByName) lines.push(line(`Fechado por: ${session.closedByName}`));
  lines.push(
    divider(),
    line(`Fundo inicial: ${money(session.openingFloatCents)}`),
    line(`Recebido em dinheiro: ${money(session.cashPaymentsCents)}`),
    line(`Suprimentos: ${money(session.suppliesCents)}`),
    line(`Sangrias: ${money(session.withdrawalsCents)}`),
    line(`Devoluções: ${money(session.refundsCents)}`),
    line(`Despesas em dinheiro: ${money(session.cashExpensesCents)}`),
    line(`Despesas outros meios: ${money(session.nonCashExpensesCents)}`),
    line(`Dinheiro esperado: ${money(session.expectedCashCents)}`, { bold: true }),
    divider(),
    line("RECEBIMENTOS POR FORMA", { size: "small", bold: true }),
  );
  for (const payment of session.paymentTotals ?? []) lines.push(line(`${methodLabels[payment.method] ?? payment.method}: ${money(payment.totalCents)}`));
  lines.push(line(`Total recebido: ${money(session.receivedCents)}`, { bold: true }));
  if (!open) {
    lines.push(divider(), line(`Dinheiro contado: ${money(session.countedCashCents ?? 0)}`), line(`Diferença: ${money(session.differenceCents ?? 0)}`, { bold: true, size: "large" }));
    if (session.closeNote) lines.push(line(`Obs.: ${session.closeNote}`, { size: "small" }));
  }
  lines.push(divider(), line("Resumo da sessão de caixa", { align: "center", size: "small" }));
  return { kind: "cash", lines };
}
