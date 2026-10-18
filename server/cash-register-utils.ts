export type CashPaymentMethod = "pix" | "cash" | "debit" | "credit" | "other";
export type CashMovementKind = "supply" | "withdrawal" | "refund";

const PAYMENT_METHODS: CashPaymentMethod[] = ["pix", "cash", "debit", "credit", "other"];

export function isCashOutflowAllowed(amountCents: number, expectedCashCents: number) {
  return Number.isSafeInteger(amountCents)
    && amountCents > 0
    && Number.isSafeInteger(expectedCashCents)
    && expectedCashCents >= 0
    && amountCents <= expectedCashCents;
}

export function calculateCashDifferenceCents(countedCashCents: number, expectedCashCents: number) {
  return countedCashCents - expectedCashCents;
}

export function calculateCashSessionTotals(input: {
  openingFloatCents: number;
  payments: Array<{ amountCents: number; method: CashPaymentMethod }>;
  movements: Array<{ amountCents: number; kind: CashMovementKind }>;
  expenses: Array<{ amountCents: number; method: CashPaymentMethod }>;
}) {
  const paymentTotals = PAYMENT_METHODS.map((method) => {
    const matchingPayments = input.payments.filter((payment) => payment.method === method);
    return {
      method,
      totalCents: matchingPayments.reduce((sum, payment) => sum + payment.amountCents, 0),
      count: matchingPayments.length,
    };
  });
  const cashPaymentsCents = paymentTotals.find((item) => item.method === "cash")?.totalCents ?? 0;
  const suppliesCents = input.movements
    .filter((movement) => movement.kind === "supply")
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  const withdrawalsCents = input.movements
    .filter((movement) => movement.kind === "withdrawal")
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  const refundsCents = input.movements
    .filter((movement) => movement.kind === "refund")
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  const cashExpensesCents = input.expenses
    .filter((expense) => expense.method === "cash")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const nonCashExpensesCents = input.expenses
    .filter((expense) => expense.method !== "cash")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const receivedCents = paymentTotals.reduce((sum, item) => sum + item.totalCents, 0);
  const expectedCashCents = input.openingFloatCents + cashPaymentsCents + suppliesCents - withdrawalsCents - refundsCents - cashExpensesCents;

  return {
    paymentTotals,
    receivedCents,
    cashPaymentsCents,
    suppliesCents,
    withdrawalsCents,
    refundsCents,
    cashExpensesCents,
    nonCashExpensesCents,
    expectedCashCents,
  };
}
