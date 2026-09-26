function parseRuleTime(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Weekdays use JavaScript's Sunday=0 ... Saturday=6 convention.
 * For overnight rules, the after-midnight portion belongs to the prior start day.
 * Missing legacy weekday data intentionally means every day.
 */
export function priceRuleAppliesAt(daysOfWeek: number[] | null | undefined, startTime: string, endTime: string, weekday: number, currentMinutes: number): boolean {
  const start = parseRuleTime(startTime);
  const end = parseRuleTime(endTime);
  if (start === null || end === null || start === end || weekday < 0 || weekday > 6) return false;

  const days = Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (start < end) return days.includes(weekday) && currentMinutes >= start && currentMinutes < end;
  if (currentMinutes >= start) return days.includes(weekday);
  return currentMinutes < end && days.includes((weekday + 6) % 7);
}
