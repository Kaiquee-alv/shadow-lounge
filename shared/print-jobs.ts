import { z } from "zod";

const receiptItemSchema = z.object({
  productName: z.string().max(160),
  quantity: z.number().int().min(1).max(999),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
  note: z.string().max(500).nullable(),
  discountReason: z.string().max(120).nullable(),
  addedByName: z.string().max(120).nullable(),
  createdAt: z.string().datetime(),
});

const paymentSchema = z.object({
  amountCents: z.number().int().min(0).max(100_000_000),
  method: z.enum(["pix", "cash", "debit", "credit", "other"]),
  createdAt: z.string().datetime(),
  receivedByName: z.string().max(120).nullable(),
});

const commonReceiptFields = {
  tabCode: z.string().max(24),
  tableNumber: z.number().int().positive().max(1000),
  openedAt: z.string().datetime(),
};

export const printJobPayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tab"),
    ...commonReceiptFields,
    customerName: z.string().max(120).nullable(),
    openedByName: z.string().max(120).nullable(),
    items: z.array(receiptItemSchema).max(300),
    subtotalCents: z.number().int().min(0).max(1_000_000_000),
    tipCents: z.number().int().min(0).max(1_000_000_000),
    totalCents: z.number().int().min(0).max(1_000_000_000),
    paidCents: z.number().int().min(0).max(1_000_000_000),
    balanceCents: z.number().int().min(0).max(1_000_000_000),
    payments: z.array(paymentSchema).max(300),
  }),
  z.object({
    kind: z.literal("barista"),
    ...commonReceiptFields,
    operatorName: z.string().max(120).nullable(),
    productName: z.string().max(160),
    quantity: z.number().int().min(1).max(999),
    note: z.string().max(500).nullable(),
    unitPriceCents: z.number().int().min(0).max(100_000_000),
    discountReason: z.string().max(120).nullable(),
  }),
]);

export type PrintJobPayload = z.infer<typeof printJobPayloadSchema>;

export const enqueuePrintJobSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tab"),
    tabId: z.number().int().positive(),
    requestKey: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("barista"),
    tabId: z.number().int().positive(),
    itemId: z.number().int().positive(),
    requestKey: z.string().uuid(),
  }),
]);

export type EnqueuePrintJobInput = z.infer<typeof enqueuePrintJobSchema>;
