import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDateTimeInSaoPaulo } from "@shared/sao-paulo-time";
import { ArrowDownRight, ArrowUpRight, Banknote, Clock3, History, LoaderCircle, Printer, ReceiptText, RefreshCw, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const cashMethods = [
  { method: "pix", label: "PIX" },
  { method: "cash", label: "Dinheiro" },
  { method: "debit", label: "Débito" },
  { method: "credit", label: "Crédito" },
  { method: "other", label: "Outros" },
] as const;
const methodLabels: Record<string, string> = Object.fromEntries(cashMethods.map(({ method, label }) => [method, label]));
const movementLabels: Record<string, string> = { supply: "Suprimento", withdrawal: "Sangria", refund: "Devolução em dinheiro" };
const money = (cents: number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
const dateTime = (value: string | Date | null | undefined) => value ? formatDateTimeInSaoPaulo(new Date(value)) : "—";
const parseCents = (value: string) => {
  const compact = value.trim().replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};

export default function CashPage() {
  const [openDialog, setOpenDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0,00");
  const [movementDialog, setMovementDialog] = useState(false);
  const [movementKind, setMovementKind] = useState<"supply" | "withdrawal" | "refund">("supply");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [cashExpenseOpen, setCashExpenseOpen] = useState(false);
  const [cashExpense, setCashExpense] = useState({ description: "", category: "Fornecedores", amount: "", notes: "" });
  const cashExpenseCategories = ["Fornecedores", "Aluguel", "Energia", "Água", "Internet", "Funcionários", "Manutenção", "Marketing", "Outros"];
  const [closeDialog, setCloseDialog] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const currentQuery = trpc.cash.current.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const historyQuery = trpc.cash.history.useQuery({ page: historyPage }, { retry: false });
  const detailsQuery = trpc.cash.details.useQuery(
    { sessionId: selectedSessionId ?? 0 },
    { enabled: selectedSessionId !== null, retry: false },
  );
  const invalidateCash = async () => {
    await Promise.all([utils.cash.current.invalidate(), utils.cash.history.invalidate(), utils.cash.details.invalidate()]);
  };

  const openMutation = trpc.cash.open.useMutation({
    onSuccess: async () => {
      setOpenDialog(false);
      setOpeningFloat("0,00");
      setSelectedSessionId(null);
      await invalidateCash();
      toast.success("Caixa aberto. Os próximos pagamentos ficarão vinculados a este turno.");
    },
    onError: (error) => toast.error(error.message),
  });
  const movementMutation = trpc.cash.addMovement.useMutation({
    onSuccess: async () => {
      setMovementDialog(false);
      setMovementAmount("");
      setMovementDescription("");
      await invalidateCash();
      toast.success("Movimentação de caixa registrada.");
    },
    onError: (error) => toast.error(error.message),
  });
  const cashExpenseMutation = trpc.cash.addExpense.useMutation({
    onSuccess: async () => {
      setCashExpenseOpen(false);
      setCashExpense({ description: "", category: "Fornecedores", amount: "", notes: "" });
      await invalidateCash();
      toast.success("Despesa em dinheiro registrada e descontada do caixa.");
    },
    onError: (error) => toast.error(error.message),
  });
  const closeMutation = trpc.cash.close.useMutation({
    onSuccess: async (_result, variables) => {
      setCloseDialog(false);
      setCountedCash("");
      setCloseNote("");
      setSelectedSessionId(variables.sessionId);
      await invalidateCash();
      toast.success("Caixa fechado. As comandas continuam abertas quando houver saldo pendente.");
    },
    onError: (error) => toast.error(error.message),
  });

  const currentSession = currentQuery.data;
  const selectedSession = detailsQuery.data;
  const currentActivity = useMemo(() => buildActivity(currentSession), [currentSession]);
  const selectedActivity = useMemo(() => buildActivity(selectedSession), [selectedSession]);

  const handleOpen = () => {
    const openingFloatCents = parseCents(openingFloat);
    if (!Number.isSafeInteger(openingFloatCents) || openingFloatCents < 0) {
      toast.error("Informe um valor inicial válido, igual ou maior que zero.");
      return;
    }
    openMutation.mutate({ openingFloatCents });
  };
  const handleMovement = () => {
    const amountCents = parseCents(movementAmount);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !movementDescription.trim()) {
      toast.error("Informe uma descrição e um valor válido maior que zero.");
      return;
    }
    movementMutation.mutate({ kind: movementKind, amountCents, description: movementDescription.trim() });
  };
  const handleCashExpense = () => {
    const amountCents = parseCents(cashExpense.amount);
    if (!cashExpense.description.trim() || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      toast.error("Informe uma descrição e um valor válido maior que zero.");
      return;
    }
    cashExpenseMutation.mutate({ description: cashExpense.description.trim(), category: cashExpense.category, amountCents, notes: cashExpense.notes.trim() || undefined });
  };
  const handleClose = () => {
    const countedCashCents = parseCents(countedCash);
    if (!currentSession || !Number.isSafeInteger(countedCashCents) || countedCashCents < 0) {
      toast.error("Informe o valor contado em dinheiro, igual ou maior que zero.");
      return;
    }
    closeMutation.mutate({ sessionId: currentSession.id, countedCashCents, note: closeNote.trim() || undefined });
  };

  return (
    <div className="cash-page">
      <section className="page-intro cash-page-intro">
        <div>
          <span className="section-kicker">CONTROLE POR TURNO</span>
          <h2>Caixa organizado, fechamento conferido.</h2>
          <p>Abra ao iniciar o turno e feche quando terminar. O período pode atravessar a meia-noite.</p>
        </div>
        {currentSession ? <Badge className="cash-status-badge">CAIXA ABERTO</Badge> : <Badge variant="outline">SEM CAIXA ABERTO</Badge>}
      </section>

      {currentQuery.isLoading ? (
        <section className="panel cash-empty"><LoaderCircle className="launch-loader" size={22} /><span>Consultando o estado do caixa…</span></section>
      ) : currentQuery.error ? (
        <section className="panel cash-empty cash-error"><Banknote size={26} /><b>Não foi possível consultar o caixa.</b><span>{currentQuery.error.message}</span><Button variant="outline" onClick={() => void currentQuery.refetch()}><RefreshCw size={16} /> Tentar novamente</Button></section>
      ) : !currentSession ? (
        <section className="panel cash-empty">
          <div className="cash-empty-icon"><Banknote size={28} /></div>
          <span className="section-kicker">PRONTO PARA COMEÇAR</span>
          <h3>Abra o caixa para iniciar um novo turno</h3>
          <p>Defina o fundo inicial em espécie. A partir da abertura, os recebimentos das comandas entram automaticamente nesta sessão.</p>
          <Button onClick={() => setOpenDialog(true)}><Banknote size={17} /> Abrir caixa</Button>
          <small>Sem caixa aberto, o sistema não registra novos pagamentos.</small>
        </section>
      ) : (
        <div className={`cash-print-area ${selectedSessionId !== null ? "cash-print-hide" : ""}`}>
          <section className="panel cash-session-banner">
            <div className="cash-session-heading">
              <div className="cash-session-mark"><Banknote size={22} /></div>
              <div><span className="section-kicker">SESSÃO EM ANDAMENTO</span><h3>Aberto por {currentSession.openedByName || "Operador"}</h3><p><Clock3 size={14} /> Desde {dateTime(currentSession.openedAt)}</p></div>
            </div>
            <div className="cash-actions cash-print-hide">
              <Button variant="outline" onClick={() => { setMovementKind("supply"); setMovementDialog(true); }}><ArrowUpRight size={16} /> Suprimento</Button>
              <Button variant="outline" onClick={() => { setMovementKind("withdrawal"); setMovementDialog(true); }}><ArrowDownRight size={16} /> Sangria</Button>
              <Button variant="outline" onClick={() => setCashExpenseOpen(true)}><ReceiptText size={16} /> Despesa em dinheiro</Button>
              <Button variant="outline" onClick={() => { setCountedCash(""); setCloseNote(""); setCloseDialog(true); }}>Fechar caixa</Button>
              <Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Imprimir resumo</Button>
            </div>
          </section>

          <section className="metric-grid cash-metric-grid">
            <article className="metric-card cash-highlight"><div className="metric-icon amber"><Banknote size={20} /></div><span>Dinheiro esperado</span><strong>{money(currentSession.expectedCashCents)}</strong><small>Valor previsto na gaveta agora</small></article>
            <article className="metric-card"><div className="metric-icon green"><WalletCards size={20} /></div><span>Fundo inicial</span><strong>{money(currentSession.openingFloatCents)}</strong><small>Registrado na abertura</small></article>
            <article className="metric-card"><div className="metric-icon blue"><ArrowDownRight size={20} /></div><span>Recebido em dinheiro</span><strong>{money(currentSession.cashPaymentsCents)}</strong><small>Pagamentos vinculados ao turno</small></article>
            <article className="metric-card"><div className="metric-icon violet"><ArrowUpRight size={20} /></div><span>Suprimentos</span><strong>{money(currentSession.suppliesCents)}</strong><small>Entradas manuais em espécie</small></article>
            <article className="metric-card"><div className="metric-icon amber"><ArrowDownRight size={20} /></div><span>Sangrias e devoluções</span><strong>{money(currentSession.withdrawalsCents + currentSession.refundsCents)}</strong><small>Saídas manuais em espécie</small></article>
            <article className="metric-card"><div className="metric-icon red"><ReceiptTextIcon /></div><span>Despesas em dinheiro</span><strong>{money(currentSession.cashExpensesCents)}</strong><small>Descontadas do valor esperado</small></article>
            <article className="metric-card"><div className="metric-icon violet"><WalletCards size={20} /></div><span>Despesas em outros meios</span><strong>{money(currentSession.nonCashExpensesCents)}</strong><small>Informativas; não reduzem a gaveta</small></article>
          </section>

          <section className="cash-content-grid">
            <article className="panel cash-payment-panel">
              <div className="panel-header"><div><span className="section-kicker">RECEBIMENTOS DO TURNO</span><h3>Por forma de pagamento</h3></div></div>
              <div className="cash-payment-list">
                {(currentSession.paymentTotals ?? []).map((item: any) => <div className="cash-payment-row" key={item.method}><span>{methodLabels[item.method] ?? item.method}<small>{item.count} pagamento{item.count === 1 ? "" : "s"}</small></span><strong>{money(item.totalCents)}</strong></div>)}
                <div className="cash-payment-row cash-payment-total"><span>Total recebido</span><strong>{money(currentSession.receivedCents)}</strong></div>
              </div>
            </article>
            <article className="panel cash-activity-panel">
              <div className="panel-header"><div><span className="section-kicker">MOVIMENTAÇÕES</span><h3>Atividade recente</h3></div><Badge variant="outline">{currentActivity.length} lançamentos</Badge></div>
              <div className="cash-screen-only"><ActivityList activity={currentActivity} /></div><div className="cash-print-only"><ActivityList activity={currentActivity.slice(0, 8)} /></div>
            </article>
          </section>
          <section className="panel cash-note-panel"><Banknote size={18} /><p><b>Conferência:</b> fundo inicial + recebimentos em dinheiro + suprimentos − sangrias − devoluções − despesas em dinheiro. PIX e cartões são exibidos separadamente e não alteram o dinheiro esperado.</p></section>
        </div>
      )}

      <section className="panel cash-history-panel">
        <div className="panel-header"><div><span className="section-kicker">SESSÕES ANTERIORES</span><h3>Histórico de caixa</h3></div><Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}><RefreshCw size={14} /> Atualizar</Button></div>
        {historyQuery.isLoading ? <div className="cash-list-empty">Carregando histórico…</div> : historyQuery.error ? <div className="cash-list-empty cash-error-text">{historyQuery.error.message}</div> : !historyQuery.data?.items.length ? <div className="cash-list-empty">Ainda não há sessões de caixa registradas.</div> : <div className="cash-history-list">
          {historyQuery.data.items.map((session: any) => <button type="button" className={`cash-history-row ${selectedSessionId === session.id ? "selected" : ""}`} key={session.id} onClick={() => setSelectedSessionId(session.id)}>
            <span className="cash-history-main"><b>Turno de {dateTime(session.openedAt)}</b><small>{session.openedByName || "Operador"} · encerrado por {session.closedByName || "—"}</small></span>
            <span><small>Esperado</small><b>{money(session.expectedCashCents)}</b></span>
            <span><small>Contado</small><b>{money(session.countedCashCents)}</b></span>
            <span className={session.differenceCents === 0 ? "cash-difference-even" : "cash-difference-alert"}><small>Diferença</small><b>{money(session.differenceCents)}</b></span>
            <span className="cash-history-open"><History size={15} /> Detalhes</span>
          </button>)}
        </div>}
        {historyQuery.data && historyQuery.data.totalPages > 1 && <div className="cash-pagination"><Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>Anterior</Button><span>Página {historyPage} de {historyQuery.data.totalPages} · {historyQuery.data.total} sessões</span><Button variant="outline" size="sm" disabled={historyPage >= historyQuery.data.totalPages} onClick={() => setHistoryPage((page) => Math.min(historyQuery.data.totalPages, page + 1))}>Próxima</Button></div>}
      </section>

      {selectedSessionId !== null && <section className="panel cash-detail-panel cash-print-area">
        <div className="panel-header"><div><span className="section-kicker">RESUMO DO TURNO</span><h3>{selectedSession ? `Sessão de ${dateTime(selectedSession.openedAt)}` : "Carregando sessão…"}</h3></div><div className="cash-actions cash-print-hide"><Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Imprimir</Button><Button variant="outline" onClick={() => setSelectedSessionId(null)}>Fechar detalhes</Button></div></div>
        {detailsQuery.isLoading ? <div className="cash-list-empty">Carregando lançamentos…</div> : detailsQuery.error ? <div className="cash-list-empty cash-error-text">{detailsQuery.error.message}</div> : selectedSession ? <>
          <div className="cash-detail-meta"><span>Aberto por <b>{selectedSession.openedByName || "Operador"}</b> · {dateTime(selectedSession.openedAt)}</span><span>Fechado por <b>{selectedSession.closedByName || "—"}</b> · {dateTime(selectedSession.closedAt)}</span></div>
          <div className="cash-close-summary">
            <span>Fundo inicial <b>{money(selectedSession.openingFloatCents)}</b></span>
            <span>Recebido em dinheiro <b>{money(selectedSession.cashPaymentsCents)}</b></span>
            <span>Suprimentos <b>{money(selectedSession.suppliesCents)}</b></span>
            <span>Sangrias <b>{money(selectedSession.withdrawalsCents)}</b></span>
            <span>Devoluções em dinheiro <b>{money(selectedSession.refundsCents)}</b></span>
            <span>Despesas em dinheiro <b>{money(selectedSession.cashExpensesCents)}</b></span>
            <span>Despesas em outros meios <b>{money(selectedSession.nonCashExpensesCents)}</b></span>
            <span>Dinheiro esperado <b>{money(selectedSession.expectedCashCents)}</b></span>
            <span>Dinheiro contado <b>{money(selectedSession.countedCashCents)}</b></span>
            <span className={selectedSession.differenceCents === 0 ? "cash-difference-even" : "cash-difference-alert"}>Diferença <b>{money(selectedSession.differenceCents)}</b></span>
          </div>
          <div className="cash-method-summary">{(selectedSession.paymentTotals ?? []).map((item: any) => <span key={item.method}>{methodLabels[item.method] ?? item.method}: <b>{money(item.totalCents)}</b></span>)}</div>
          {selectedSession.closeNote && <p className="cash-close-note">Observação do fechamento: {selectedSession.closeNote}</p>}
          <ActivityList activity={selectedActivity} />
        </> : null}
      </section>}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="payment-dialog cash-dialog">
          <DialogHeader><div className="dialog-icon"><Banknote size={20} /></div><DialogTitle>Abrir caixa</DialogTitle><DialogDescription>Informe o dinheiro que ficará como fundo inicial. O turno pode continuar após a meia-noite.</DialogDescription></DialogHeader>
          <label className="field-label">Fundo inicial em dinheiro<Input autoFocus inputMode="decimal" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} placeholder="0,00" /></label>
          <Button className="primary-wide" disabled={openMutation.isPending} onClick={handleOpen}>{openMutation.isPending ? "Abrindo…" : "Confirmar abertura"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent className="payment-dialog cash-dialog">
          <DialogHeader><div className="dialog-icon">{movementKind === "supply" ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}</div><DialogTitle>{movementLabels[movementKind]}</DialogTitle><DialogDescription>{movementKind === "supply" ? "Registre uma entrada de dinheiro no caixa." : "Registre uma saída de dinheiro do caixa. O sistema não permite retirar mais do que o saldo esperado."}</DialogDescription></DialogHeader>
          <div className="cash-movement-type cash-print-hide">{(["supply", "withdrawal", "refund"] as const).map((kind) => <button key={kind} className={movementKind === kind ? "selected" : ""} onClick={() => setMovementKind(kind)}>{movementLabels[kind]}</button>)}</div>
          <label className="field-label">Descrição<Input autoFocus maxLength={240} value={movementDescription} onChange={(event) => setMovementDescription(event.target.value)} placeholder={movementKind === "supply" ? "Ex.: reforço de troco" : movementKind === "refund" ? "Ex.: devolução ao cliente" : "Ex.: retirada para depósito"} /></label>
          <label className="field-label">Valor em dinheiro<Input inputMode="decimal" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="0,00" /></label>
          <Button className="primary-wide" disabled={movementMutation.isPending} onClick={handleMovement}>{movementMutation.isPending ? "Registrando…" : "Registrar movimentação"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={cashExpenseOpen} onOpenChange={setCashExpenseOpen}>
        <DialogContent className="payment-dialog cash-dialog">
          <DialogHeader><div className="dialog-icon"><ReceiptText size={20} /></div><DialogTitle>Despesa em dinheiro</DialogTitle><DialogDescription>O valor será descontado do dinheiro esperado e aparecerá também no Financeiro. O caixa não permite gastar mais do que o saldo previsto.</DialogDescription></DialogHeader>
          <label className="field-label">Descrição<Input autoFocus maxLength={240} value={cashExpense.description} onChange={(event) => setCashExpense({ ...cashExpense, description: event.target.value })} placeholder="Ex.: compra de gelo" /></label>
          <label className="field-label">Categoria<select value={cashExpense.category} onChange={(event) => setCashExpense({ ...cashExpense, category: event.target.value })}>{cashExpenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="field-label">Valor em dinheiro<Input inputMode="decimal" value={cashExpense.amount} onChange={(event) => setCashExpense({ ...cashExpense, amount: event.target.value })} placeholder="0,00" /></label>
          <label className="field-label">Observação (opcional)<Textarea maxLength={2000} value={cashExpense.notes} onChange={(event) => setCashExpense({ ...cashExpense, notes: event.target.value })} placeholder="Opcional" /></label>
          <Button className="primary-wide" disabled={cashExpenseMutation.isPending} onClick={handleCashExpense}>{cashExpenseMutation.isPending ? "Registrando…" : "Registrar despesa"}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="payment-dialog cash-dialog">
          <DialogHeader><div className="dialog-icon"><WalletCards size={20} /></div><DialogTitle>Fechar caixa</DialogTitle><DialogDescription>Conte o dinheiro físico da gaveta. O fechamento registra a diferença e não encerra comandas que ainda tenham saldo pendente.</DialogDescription></DialogHeader>
          <div className="cash-close-expected"><span>Dinheiro esperado</span><b>{money(currentSession?.expectedCashCents)}</b></div>
          <label className="field-label">Dinheiro contado<Input autoFocus inputMode="decimal" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} placeholder="0,00" /></label>
          {countedCash.trim() && Number.isFinite(parseCents(countedCash)) && <div className={`cash-difference-preview ${parseCents(countedCash) - (currentSession?.expectedCashCents ?? 0) === 0 ? "even" : "alert"}`}><span>Diferença (contado − esperado)</span><b>{money(parseCents(countedCash) - (currentSession?.expectedCashCents ?? 0))}</b></div>}
          <label className="field-label">Observação (opcional)<Textarea maxLength={500} value={closeNote} onChange={(event) => setCloseNote(event.target.value)} placeholder="Ex.: justificativa para diferença de caixa" /></label>
          <Button className="primary-wide" disabled={closeMutation.isPending} onClick={handleClose}>{closeMutation.isPending ? "Fechando…" : "Confirmar fechamento"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityList({ activity }: { activity: any[] }) {
  if (!activity.length) return <div className="cash-list-empty">Nenhuma movimentação neste turno ainda.</div>;
  return <div className="cash-activity-list">{activity.map((item: any) => <div className="cash-activity-row" key={item.id}>
    <span className={`cash-activity-icon ${item.direction}`} aria-hidden="true">{item.direction === "in" ? <ArrowUpRight size={16} /> : item.direction === "out" ? <ArrowDownRight size={16} /> : <ReceiptTextIcon />}</span>
    <span className="cash-activity-description"><b>{item.description}</b><small>{dateTime(item.createdAt)}{item.userName ? ` · ${item.userName}` : ""}</small></span>
    <strong className={item.direction === "out" ? "cash-activity-out" : item.direction === "info" ? "cash-activity-info" : ""}>{item.direction === "out" ? "− " : item.direction === "in" ? "+ " : ""}{money(item.amountCents)}</strong>
  </div>)}</div>;
}

function buildActivity(session: any) {
  if (!session) return [];
  const payments = (session.payments ?? []).map((payment: any) => ({
    id: `payment-${payment.id}`,
    description: `${payment.tabCode ? `Comanda ${payment.tabCode}` : "Pagamento recebido"} · ${methodLabels[payment.method] ?? payment.method}`,
    amountCents: payment.amountCents,
    createdAt: payment.createdAt,
    userName: payment.receivedByName,
    direction: "in",
  }));
  const movements = (session.movements ?? []).map((movement: any) => ({
    id: `movement-${movement.id}`,
    description: movement.description,
    amountCents: movement.amountCents,
    createdAt: movement.createdAt,
    userName: movement.userName,
    direction: movement.kind === "supply" ? "in" : "out",
  }));
  const expenses = (session.expenses ?? []).map((expense: any) => ({
    id: `expense-${expense.id}`,
    description: `Despesa: ${expense.description} · ${methodLabels[expense.method] ?? expense.method}`,
    amountCents: expense.amountCents,
    createdAt: expense.createdAt,
    userName: expense.userName,
    direction: expense.method === "cash" ? "out" : "info",
  }));
  return [...payments, ...movements, ...expenses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function ReceiptTextIcon() { return <ReceiptText size={16} />; }
