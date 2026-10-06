export function formatTimeInSaoPaulo(value?: string | Date | null): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function formatDateTimeInSaoPaulo(value?: string | Date | null): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function saoPauloDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function firstOfMonthInSaoPaulo(date: Date): string {
  const dateKey = saoPauloDateKey(date);
  return dateKey ? `${dateKey.slice(0, 7)}-01` : "";
}

export function addDaysToSaoPauloDateKey(dateKey: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isInteger(days)) return "";
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function saoPauloDayStart(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Data inválida");
  return new Date(`${dateKey}T00:00:00.000-03:00`);
}

export function saoPauloDayEnd(dateKey: string): Date {
  const nextDate = addDaysToSaoPauloDateKey(dateKey, 1);
  if (!nextDate) throw new Error("Data inválida");
  return new Date(new Date(`${nextDate}T00:00:00.000-03:00`).getTime() - 1);
}
