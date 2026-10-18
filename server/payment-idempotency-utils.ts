import { createHash } from "crypto";

export type PaymentMethod = "pix" | "cash" | "debit" | "credit" | "other";

export interface OfflineTabFingerprintInput {
  deviceId: string;
  tableId: number;
  customerName?: string | null;
  tipPercent: 0 | 10;
  items: Array<{ productId: number; productName: string; quantity: number; note?: string | null; createdAt?: string }>;
  payments: Array<{ amountCents: number; method: PaymentMethod; requestKey: string }>;
}

export function createOfflineTabFingerprint(input: OfflineTabFingerprintInput) {
  const canonicalRequest = {
    deviceId: input.deviceId,
    tableId: input.tableId,
    customerName: input.customerName?.trim() || null,
    tipPercent: input.tipPercent,
    items: input.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      note: item.note ?? null,
      createdAt: item.createdAt ?? null,
    })),
    payments: input.payments.map((payment) => ({
      amountCents: payment.amountCents,
      method: payment.method,
      requestKey: payment.requestKey,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonicalRequest)).digest("hex");
}

export function offlineFingerprintMatches(storedFingerprint: string | null | undefined, requestedFingerprint: string) {
  return Boolean(storedFingerprint) && storedFingerprint === requestedFingerprint;
}

export function paymentRequestMatches(
  existing: { tabId: number; amountCents: number; method: string },
  request: { tabId: number; amountCents: number; method: string },
) {
  return existing.tabId === request.tabId
    && existing.amountCents === request.amountCents
    && existing.method === request.method;
}
