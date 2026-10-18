import { describe, expect, it } from "vitest";
import { createOfflineTabFingerprint, offlineFingerprintMatches, paymentRequestMatches, type OfflineTabFingerprintInput } from "./payment-idempotency-utils.js";

const payload: OfflineTabFingerprintInput = {
  deviceId: "device-1",
  tableId: 4,
  customerName: " Cliente ",
  tipPercent: 10,
  items: [{ productId: 9, productName: "Água", quantity: 2, note: "sem gelo", createdAt: "2026-10-18T18:00:00.000Z" }],
  payments: [{ amountCents: 1500, method: "cash", requestKey: "payment-request-123" }],
};

describe("idempotência de pagamentos e sincronização offline", () => {
  it("gera o mesmo fingerprint para a mesma requisição normalizada", () => {
    expect(createOfflineTabFingerprint(payload)).toBe(createOfflineTabFingerprint({ ...payload, customerName: "Cliente" }));
  });

  it("detecta reuso da chave offline com payload, dispositivo ou mesa diferentes", () => {
    const fingerprint = createOfflineTabFingerprint(payload);
    expect(createOfflineTabFingerprint({ ...payload, tableId: 5 })).not.toBe(fingerprint);
    expect(createOfflineTabFingerprint({ ...payload, deviceId: "device-2" })).not.toBe(fingerprint);
    expect(createOfflineTabFingerprint({ ...payload, payments: [{ ...payload.payments[0], amountCents: 1600 }] })).not.toBe(fingerprint);
  });

  it("não trata registros legados sem fingerprint como repetições verificadas", () => {
    const fingerprint = createOfflineTabFingerprint(payload);
    expect(offlineFingerprintMatches(fingerprint, fingerprint)).toBe(true);
    expect(offlineFingerprintMatches(null, fingerprint)).toBe(false);
    expect(offlineFingerprintMatches(undefined, fingerprint)).toBe(false);
    expect(offlineFingerprintMatches("", fingerprint)).toBe(false);
    expect(offlineFingerprintMatches("different", fingerprint)).toBe(false);
  });

  it("considera requestKey duplicada somente quando mesa, valor e meio coincidem", () => {
    const original = { tabId: 12, amountCents: 2500, method: "pix" };
    expect(paymentRequestMatches(original, original)).toBe(true);
    expect(paymentRequestMatches(original, { ...original, tabId: 13 })).toBe(false);
    expect(paymentRequestMatches(original, { ...original, amountCents: 2600 })).toBe(false);
    expect(paymentRequestMatches(original, { ...original, method: "cash" })).toBe(false);
  });
});
