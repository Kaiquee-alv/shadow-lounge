import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, LoaderCircle, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PrintJobPayload } from "@shared/print-jobs";

type ClaimedJob = {
  id: number;
  kind: "tab" | "barista";
  payload: PrintJobPayload;
  attempts: number;
  claimToken: string;
};

const cash = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
const methodLabel: Record<string, string> = { pix: "PIX", cash: "Dinheiro", debit: "Débito", credit: "Crédito", other: "Outros" };

function stationIdForThisTab() {
  if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000000";
  try {
    const key = "shadow-lounge.print-station-id.v1";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = window.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12)}`;
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return window.crypto?.randomUUID?.() ?? `station-${Date.now()}`;
  }
}

function receiptHtml(payload: PrintJobPayload) {
  const commonStyle = `@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;margin:0;background:#fff;color:#000}body{padding:4mm;font-family:Arial,sans-serif;font-size:12px;line-height:1.3}.ticket{width:100%}.center{text-align:center}.brand{font-size:17px;font-weight:800;letter-spacing:2px}.muted{font-size:10px;color:#444}.rule{border-top:1px dashed #000;margin:9px 0}.line,.item{display:flex;justify-content:space-between;gap:8px}.item{align-items:flex-start;margin:5px 0}.item-main{min-width:0}.item-name{font-weight:700;overflow-wrap:anywhere}.item small{display:block;font-size:10px;margin-top:2px;overflow-wrap:anywhere}.line b,.item-price{white-space:nowrap}.total{font-size:14px;font-weight:800}.product{font-size:20px;font-weight:800;line-height:1.15;overflow-wrap:anywhere}.quantity{font-size:30px;font-weight:900;margin:8px 0}.note{border-top:1px solid #000;margin-top:12px;padding-top:8px;font-size:14px;overflow-wrap:anywhere}.footer{margin-top:14px;text-align:center;font-size:10px}`;
  let content: string;
  if (payload.kind === "barista") {
    content = `<main class="ticket"><div class="center brand">SHADOW LOUNGE</div><div class="center muted">PEDIDO DE PREPARO · ${escapeHtml(payload.tabCode)}</div><div class="rule"></div><div class="line"><span>Mesa</span><b>${escapeHtml(payload.tableNumber)}</b></div><div class="line"><span>Horário</span><b>${escapeHtml(dateTime(payload.openedAt))}</b></div><div class="rule"></div><div class="quantity">${escapeHtml(payload.quantity)}x</div><div class="product">${escapeHtml(payload.productName)}</div>${payload.discountReason ? `<div class="muted">${escapeHtml(payload.discountReason)} · ${escapeHtml(cash(payload.unitPriceCents))} por unidade</div>` : `<div class="muted">Preço unitário: ${escapeHtml(cash(payload.unitPriceCents))}</div>`}${payload.note ? `<div class="note"><b>Observação:</b><br>${escapeHtml(payload.note)}</div>` : ""}<div class="footer">Operador: ${escapeHtml(payload.operatorName || "Operador")}</div></main>`;
  } else {
    const items = payload.items.length
      ? payload.items.map((item) => `<div class="item"><div class="item-main"><span class="item-name">${escapeHtml(item.quantity)}x ${escapeHtml(item.productName)}</span>${item.discountReason ? `<small>${escapeHtml(item.discountReason)}</small>` : ""}${item.note ? `<small>Obs.: ${escapeHtml(item.note)}</small>` : ""}</div><b class="item-price">${escapeHtml(cash(item.unitPriceCents * item.quantity))}</b></div>`).join("")
      : `<div class="center muted">Nenhum item lançado</div>`;
    const payments = payload.payments.length
      ? `<div class="rule"></div><div class="muted">PAGAMENTOS</div>${payload.payments.map((payment) => `<div class="line"><span>${escapeHtml(methodLabel[payment.method] || payment.method)} · ${escapeHtml(dateTime(payment.createdAt))}</span><b>${escapeHtml(cash(payment.amountCents))}</b></div>`).join("")}`
      : "";
    content = `<main class="ticket"><div class="center brand">SHADOW LOUNGE</div><div class="center muted">COMANDA ${escapeHtml(payload.tabCode)}</div><div class="rule"></div><div class="line"><span>Mesa</span><b>${escapeHtml(payload.tableNumber)}</b></div>${payload.customerName ? `<div class="line"><span>Cliente</span><b>${escapeHtml(payload.customerName)}</b></div>` : ""}<div class="line"><span>Abertura</span><b>${escapeHtml(dateTime(payload.openedAt))}</b></div>${payload.openedByName ? `<div class="line"><span>Atendente</span><b>${escapeHtml(payload.openedByName)}</b></div>` : ""}<div class="rule"></div>${items}<div class="rule"></div><div class="line"><span>Subtotal</span><b>${escapeHtml(cash(payload.subtotalCents))}</b></div>${payload.tipCents ? `<div class="line"><span>Gorjeta</span><b>${escapeHtml(cash(payload.tipCents))}</b></div>` : ""}<div class="line"><span>Total</span><b>${escapeHtml(cash(payload.totalCents))}</b></div><div class="line"><span>Pagamentos</span><b>− ${escapeHtml(cash(payload.paidCents))}</b></div><div class="line total"><span>SALDO</span><b>${escapeHtml(cash(payload.balanceCents))}</b></div>${payments}<div class="footer">Obrigado pela preferência</div></main>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Impressão Shadow Lounge</title><style>${commonStyle}</style></head><body>${content}</body></html>`;
}

export default function PrintStationPage() {
  const stationId = useState(stationIdForThisTab)[0];
  const [job, setJob] = useState<ClaimedJob | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);
  const activeJobRef = useRef<ClaimedJob | null>(null);
  const pollingRef = useRef(false);
  const claimMutation = trpc.printQueue.claimNext.useMutation();
  const completeMutation = trpc.printQueue.complete.useMutation();
  const releaseMutation = trpc.printQueue.release.useMutation();
  const claimRef = useRef(claimMutation.mutateAsync);
  useEffect(() => { claimRef.current = claimMutation.mutateAsync; }, [claimMutation.mutateAsync]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (cancelled || activeJobRef.current || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const next = await claimRef.current({ stationId });
        if (cancelled) return;
        if (next) {
          const claimed = next as ClaimedJob;
          activeJobRef.current = claimed;
          setJob(claimed);
          setAwaitingConfirmation(false);
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Não foi possível consultar a fila de impressão.");
      } finally {
        pollingRef.current = false;
        if (!cancelled && !activeJobRef.current) timer = window.setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [stationId, pollCycle]);

  const printNow = () => {
    if (!job) return;
    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) { toast.error("Permita pop-ups para imprimir nesta estação."); return; }
    printWindow.onafterprint = () => {
      setAwaitingConfirmation(true);
      window.setTimeout(() => printWindow.close(), 250);
    };
    printWindow.document.open();
    printWindow.document.write(receiptHtml(job.payload));
    printWindow.document.close();
    window.setTimeout(() => {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const finishJob = () => {
    if (!job) return;
    completeMutation.mutate({ jobId: job.id, stationId, claimToken: job.claimToken }, {
      onSuccess: () => {
        toast.success("Impressão confirmada.");
        activeJobRef.current = null;
        setJob(null);
        setAwaitingConfirmation(false);
        setPollCycle((cycle) => cycle + 1);
      },
    });
  };

  const returnJobToQueue = () => {
    if (!job) return;
    releaseMutation.mutate({ jobId: job.id, stationId, claimToken: job.claimToken }, {
      onSuccess: () => {
        toast.info("Trabalho devolvido à fila.");
        activeJobRef.current = null;
        setJob(null);
        setAwaitingConfirmation(false);
        setPollCycle((cycle) => cycle + 1);
      },
    });
  };

  return (
    <section className="print-station-page">
      <header className="print-station-header">
        <div className="print-station-icon"><Printer size={22} /></div>
        <div><h2>Estação de impressão</h2><p>Mantenha esta página aberta no PC Windows. Os pedidos enviados pelos celulares aparecerão aqui.</p></div>
      </header>
      {!job ? (
        <div className="panel print-station-waiting">
          <LoaderCircle size={22} className="print-station-spinner" />
          <div><b>Aguardando pedidos</b><span>A fila continua guardada na Vercel enquanto o PC estiver desligado ou desconectado.</span></div>
          <span className="print-station-live"><i /> Conectada</span>
        </div>
      ) : (
        <div className="panel print-station-job">
          <div className="print-station-job-top"><span className="eyebrow">TRABALHO #{job.id} · TENTATIVA {job.attempts}</span><span className="print-station-badge">{job.kind === "tab" ? "Comanda" : "Pedido de preparo"}</span></div>
          <h3>{job.payload.kind === "tab" ? `Comanda ${job.payload.tabCode} · Mesa ${job.payload.tableNumber}` : `${job.payload.quantity}× ${job.payload.productName} · Mesa ${job.payload.tableNumber}`}</h3>
          <p>Use a impressora térmica instalada no Windows. Confirme abaixo somente depois de verificar que o papel saiu corretamente.</p>
          <div className="print-station-actions">
            <Button onClick={printNow} disabled={completeMutation.isPending || releaseMutation.isPending}><Printer size={17} /> {awaitingConfirmation ? "Imprimir novamente" : "Imprimir no Windows"}</Button>
            {awaitingConfirmation && <Button onClick={finishJob} disabled={completeMutation.isPending || releaseMutation.isPending}><Check size={17} /> Confirmar impressão</Button>}
            <Button variant="outline" onClick={returnJobToQueue} disabled={completeMutation.isPending || releaseMutation.isPending}><RotateCcw size={16} /> Devolver à fila</Button>
          </div>
          {!awaitingConfirmation && <small className="print-station-hint"><RefreshCw size={13} /> Depois de imprimir, confirme a saída do papel para liberar o próximo trabalho.</small>}
        </div>
      )}
      <div className="print-station-help"><b>Configuração no PC</b><span>Deixe a impressora térmica instalada e selecionável na janela de impressão do navegador. A primeira impressão permite escolher a KP-IM602 e conferir largura e margens.</span></div>
    </section>
  );
}
