// All dates are plain YYYY-MM-DD strings. Arithmetic is done in UTC on the
// calendar date only, so a local timezone can never shift a date by a day.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toUTC(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return fromUTC(toUTC(value)) === value;
}

/** Local calendar date of a Date (used for "today"). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  return toUTC(date).getUTCDay();
}

export function isMonday(date: string): boolean {
  return isISODate(date) && dayOfWeek(date) === 1;
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: string): string {
  const offset = (dayOfWeek(date) + 6) % 7;
  return addDays(date, -offset);
}

export function weekRange(weekStart: string): { start: string; end: string } {
  return { start: weekStart, end: addDays(weekStart, 6) };
}

export function isDateInWeek(date: string, weekStart: string): boolean {
  const { start, end } = weekRange(weekStart);
  return date >= start && date <= end;
}
