import { addDaysToSaoPauloDateKey, saoPauloDateKey } from "../shared/sao-paulo-time.js";

export type DatedPayment = { amountCents: number; createdAt: Date | string };
export type DailyRevenuePoint = { dateKey: string; label: string; totalCents: number };

export function buildDailyRevenue(
  rangeDays: number,
  payments: DatedPayment[],
  now = new Date(),
): DailyRevenuePoint[] {
  const normalizedRange = Number.isInteger(rangeDays) && rangeDays > 0 ? Math.min(365, rangeDays) : 30;
  const todayKey = saoPauloDateKey(now);
  const firstKey = addDaysToSaoPauloDateKey(todayKey, -normalizedRange + 1);
  const dateKeys = Array.from({ length: normalizedRange }, (_, index) =>
    addDaysToSaoPauloDateKey(firstKey, index));
  const totals = new Map(dateKeys.map((key) => [key, 0]));
  for (const payment of payments) {
    const key = saoPauloDateKey(payment.createdAt);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + payment.amountCents);
  }
  return dateKeys.map((dateKey) => ({
    dateKey,
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "short",
    }).format(new Date(`${dateKey}T12:00:00.000Z`)),
    totalCents: totals.get(dateKey) ?? 0,
  }));
}
