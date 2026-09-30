function parseRuleTime(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Returns weekday (Sunday=0) and minutes since midnight from one São Paulo clock reading. */
export function saoPauloClock(date = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayText);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return { weekday, minutes: hour * 60 + minute };
}

/** Sunday=0 through Saturday=6; bit zero denotes Sunday. */
export function weekdaysToMask(days: number[]): number {
  return days.reduce((mask, day) => Number.isInteger(day) && day >= 0 && day <= 6 ? mask | (1 << day) : mask, 0);
}

/** Returns null for an invalid or empty mask, never silently interpreting it as all days. */
export function weekdaysFromMask(mask: unknown): number[] | null {
  if (!Number.isInteger(mask) || Number(mask) < 1 || Number(mask) > 127) return null;
  return Array.from({ length: 7 }, (_, day) => day).filter((day) => (Number(mask) & (1 << day)) !== 0);
}

export function timeInWindow(currentMinutes: number, startTime: string, endTime: string): boolean {
  const start = parseRuleTime(startTime);
  const end = parseRuleTime(endTime);
  if (start === null || end === null || start === end || !Number.isInteger(currentMinutes) || currentMinutes < 0 || currentMinutes >= 1440) return false;
  // Periods are [start, end): the exact end minute is never discounted.
  return start < end
    ? currentMinutes >= start && currentMinutes < end
    : currentMinutes >= start || currentMinutes < end;
}

/**
 * Weekdays use JavaScript's Sunday=0 ... Saturday=6 convention.
 * For overnight rules, the after-midnight portion belongs to the prior start day.
 * Missing legacy weekday data intentionally means every day.
 */
export function priceRuleAppliesAt(daysOfWeek: number[] | null | undefined, startTime: string, endTime: string, weekday: number, currentMinutes: number): boolean {
  const start = parseRuleTime(startTime);
  const end = parseRuleTime(endTime);
  if (start === null || end === null || start === end || weekday < 0 || weekday > 6 || !Number.isInteger(currentMinutes) || currentMinutes < 0 || currentMinutes >= 1440) return false;

  const days = Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (start < end) return days.includes(weekday) && currentMinutes >= start && currentMinutes < end;
  if (currentMinutes >= start) return days.includes(weekday);
  return end > 0 && currentMinutes < end && days.includes((weekday + 6) % 7);
}
