/**
 * Calendar dates, as YYYY-MM-DD strings.
 *
 * Engineering standard (brief §11): a payment date and a policy expiration date are
 * calendar dates, not instants. Nothing here constructs a local-time Date, so a
 * payment can never shift across a coverage boundary because of a server timezone.
 * Comparison is lexical, which is exactly ordering for zero-padded ISO dates.
 */

/** A calendar date in YYYY-MM-DD form. */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Lexical comparison. Valid for zero-padded ISO dates and nothing else. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive on both ends — a payment on the boundary date is inside the window. */
export function isOnOrBetween(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function toIsoDate(year: number, month: number, day: number): IsoDate | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days since 1970-01-01, computed from the date parts. Used for timeline geometry only. */
export function epochDay(date: IsoDate): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new TypeError(`not an ISO date: ${date}`);
  return Math.round(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000,
  );
}

export function fromEpochDay(day: number): IsoDate {
  const value = new Date(day * 86_400_000);
  return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(date) + days);
}

/** Inclusive day count between two dates. */
export function daysBetweenInclusive(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from) + 1;
}

/**
 * Parse a date out of a ledger export or a certificate.
 *
 * Handles the shapes accounting systems actually emit: ISO, MM/DD/YYYY (the ACORD 25
 * printed form), M/D/YY, and "Jan 5, 2025". Two-digit years map to 2000-2069 / 1970-1999.
 * Ambiguity is not guessed away: a DD/MM/YYYY string that is also a valid MM/DD/YYYY
 * string is read as MM/DD/YYYY, which is the US convention these sources use.
 */
export function parseLedgerDate(input: string): IsoDate | null {
  const text = input.trim();
  if (text === '') return null;

  if (ISO_DATE.test(text)) return isIsoDate(text) ? text : null;

  const numeric = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const third = Number(numeric[3]);
    if (String(numeric[1]).length === 4) return toIsoDate(first, second, third);
    // MM/DD/YYYY, falling back to DD/MM/YYYY only when the first field cannot be a month.
    const year = normalizeYear(third);
    if (year === null) return null;
    return toIsoDate(year, first, second) ?? toIsoDate(year, second, first);
  }

  const named = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/.exec(text);
  if (named) {
    const month = MONTH_NAMES[String(named[1]).toLowerCase()];
    const year = normalizeYear(Number(named[3]));
    if (month === undefined || year === null) return null;
    return toIsoDate(year, month, Number(named[2]));
  }

  const dayFirstNamed = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{2,4})$/.exec(text);
  if (dayFirstNamed) {
    const month = MONTH_NAMES[String(dayFirstNamed[2]).toLowerCase()];
    const year = normalizeYear(Number(dayFirstNamed[3]));
    if (month === undefined || year === null) return null;
    return toIsoDate(year, month, Number(dayFirstNamed[1]));
  }

  return null;
}

function normalizeYear(value: number): number | null {
  if (!Number.isInteger(value) || value < 0) return null;
  if (value >= 1900) return value;
  if (value <= 69) return 2000 + value;
  if (value <= 99) return 1900 + value;
  return null;
}

/** Today, in the given IANA timezone, as a calendar date. Defaults to the org's clock. */
export function todayIn(timeZone = 'America/Chicago'): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

/** MM/DD/YYYY, for the workpaper and anything an auditor reads. */
export function formatUsDate(date: IsoDate): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  return `${match[2]}/${match[3]}/${match[1]}`;
}
