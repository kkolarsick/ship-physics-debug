/**
 * Ledger CSV ingestion (brief §4a).
 *
 * The import never assumes a fixed schema and never guesses away a row: everything it
 * declines to import is counted, reasoned, and shown back to the user. Credits and voids
 * in particular are a common source of overstated exposure, so they are excluded loudly
 * rather than silently summed.
 *
 * Nothing here tries to tell a material supplier from a labor sub. That decision belongs
 * to the triage screen (§4a) — a classifier would be wrong often enough to destroy trust.
 */
import Papa from 'papaparse';
import { isOnOrBetween, parseLedgerDate, type IsoDate } from '@/lib/dates';
import { parseMoneyToCents, sumCents, type Cents } from '@/lib/money';
import { normalizeName } from '@/lib/matching/normalize';
import type { ColumnMapping } from '@/lib/schemas';
import { presetById, type LedgerPreset } from './presets';

export interface SniffedTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Index of the header row inside the raw file, for showing the user what was skipped. */
  readonly headerRowIndex: number;
  readonly preambleRows: readonly (readonly string[])[];
}

export type ExclusionReason =
  | 'outside_term'
  | 'non_positive_amount'
  | 'unreadable_amount'
  | 'unreadable_date'
  | 'missing_vendor'
  | 'group_heading'
  | 'subtotal_row';

export const EXCLUSION_LABELS: Readonly<Record<ExclusionReason, string>> = {
  outside_term: 'Payment date outside the policy term',
  non_positive_amount: 'Credit, void, or zero-dollar line',
  unreadable_amount: 'Amount could not be read',
  unreadable_date: 'Payment date could not be read',
  missing_vendor: 'No vendor name on the row',
  group_heading: 'Vendor heading row (its detail rows were imported)',
  subtotal_row: 'Report subtotal or total row',
};

export interface ParsedPayment {
  readonly rowNumber: number;
  readonly vendorName: string;
  readonly normalizedVendorName: string;
  readonly paidOn: IsoDate;
  /**
   * The period the work was performed, when the export carries it. Coverage is tested
   * against this; where it is null the payment date is used as a labelled proxy.
   */
  readonly workFrom: IsoDate | null;
  readonly workTo: IsoDate | null;
  readonly amount: Cents;
  readonly sourceRef: string | null;
  readonly memo: string | null;
}

export interface ExcludedRow {
  readonly rowNumber: number;
  readonly reason: ExclusionReason;
  readonly vendorName: string;
  readonly raw: readonly string[];
}

export interface ParsedVendor {
  readonly vendorName: string;
  readonly normalizedVendorName: string;
  readonly paymentCount: number;
  readonly total: Cents;
}

export interface ImportPreview {
  readonly payments: readonly ParsedPayment[];
  /** How many imported rows carry a usable work period. The rest will be proxied. */
  readonly withWorkPeriod: number;
  readonly vendors: readonly ParsedVendor[];
  readonly excluded: readonly ExcludedRow[];
  readonly excludedCounts: Readonly<Record<ExclusionReason, number>>;
  readonly totalRows: number;
  readonly importedTotal: Cents;
  readonly excludedTotal: Cents;
}

const SUBTOTAL_PATTERN = /^\s*(total\b|subtotal\b|grand total\b|total for\b|beginning balance|ending balance)/i;

/**
 * Find the header row in an accounting export. QuickBooks and Foundation both emit a
 * title, a company name, and a date range above the actual header, so the first row of
 * the file is usually not the header.
 */
export function sniffTable(csvText: string): SniffedTable {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' });
  const rows = (parsed.data ?? []).filter((row) => Array.isArray(row));

  let headerRowIndex = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const headers = headerRow.map((cell, index) =>
    (cell ?? '').trim() === '' ? `Column ${index + 1}` : String(cell).trim(),
  );

  return {
    headers,
    rows: rows.slice(headerRowIndex + 1),
    headerRowIndex,
    preambleRows: rows.slice(0, headerRowIndex),
  };
}

function headerScore(row: readonly string[]): number {
  const filled = row.filter((cell) => (cell ?? '').trim() !== '');
  if (filled.length < 2) return -1;
  // A header row is text, not numbers or dates.
  const textual = filled.filter(
    (cell) => parseMoneyToCents(cell) === null && parseLedgerDate(cell) === null,
  );
  const known = filled.filter((cell) => isKnownHeader(cell)).length;
  return textual.length + known * 3;
}

function isKnownHeader(cell: string): boolean {
  const value = cell.trim().toLowerCase();
  return [
    'date', 'vendor', 'name', 'payee', 'amount', 'memo', 'num', 'total',
    'description', 'transaction type', 'check date', 'payment amount', 'vendor name',
  ].includes(value);
}

/** Guess a column mapping from the headers, using the preset's aliases first. */
export function suggestMapping(
  headers: readonly string[],
  presetId: string,
): Partial<ColumnMapping> {
  const preset = presetById(presetId);
  return {
    vendorName: pick(headers, preset, 'vendorName'),
    paidOn: pick(headers, preset, 'paidOn'),
    amount: pick(headers, preset, 'amount'),
    sourceRef: pick(headers, preset, 'sourceRef'),
    memo: pick(headers, preset, 'memo'),
    workFrom: pick(headers, preset, 'workFrom'),
    workTo: pick(headers, preset, 'workTo'),
  };
}

function pick(
  headers: readonly string[],
  preset: LedgerPreset,
  field: keyof LedgerPreset['aliases'],
): string | undefined {
  const aliases = preset.aliases[field];
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return headers[index];
  }
  for (const alias of aliases) {
    const index = normalized.findIndex((header) => header.includes(alias));
    if (index >= 0) return headers[index];
  }
  return undefined;
}

/**
 * Turn mapped rows into payments, applying the import rules. Vendors are grouped by the
 * name as it appears in the ledger — two spellings stay two vendors until a human says
 * otherwise (§5).
 */
export function buildImportPreview(input: {
  readonly table: SniffedTable;
  readonly mapping: ColumnMapping;
  readonly termStart: IsoDate;
  readonly termEnd: IsoDate;
}): ImportPreview {
  const { table, mapping, termStart, termEnd } = input;
  const index = (column: string | undefined): number =>
    column === undefined ? -1 : table.headers.indexOf(column);

  const vendorIndex = index(mapping.vendorName);
  const dateIndex = index(mapping.paidOn);
  const amountIndex = index(mapping.amount);
  const refIndex = index(mapping.sourceRef);
  const memoIndex = index(mapping.memo);
  const workFromIndex = index(mapping.workFrom);
  const workToIndex = index(mapping.workTo);

  const payments: ParsedPayment[] = [];
  const excluded: ExcludedRow[] = [];
  // QuickBooks and Foundation print the vendor once, as a heading above its detail rows,
  // and leave the vendor cell blank underneath. Carry the last heading down.
  let lastVendor = '';
  // When the mapped vendor column is also the date column, the file is one of those
  // grouped reports: the vendor never appears on a detail row at all.
  const vendorIsGroupColumn = vendorIndex >= 0 && vendorIndex === dateIndex;

  table.rows.forEach((row, offset) => {
    const rowNumber = table.headerRowIndex + offset + 2; // 1-based, counting the header
    const filled = row.filter((value) => (value ?? '').toString().trim() !== '');

    if (row.some((value) => SUBTOTAL_PATTERN.test((value ?? '').toString()))) {
      excluded.push({ rowNumber, reason: 'subtotal_row', vendorName: '', raw: row });
      return;
    }

    // A lone text cell on an otherwise empty row is a vendor heading, not a payment.
    const soleCell = filled.length === 1 ? filled[0]!.toString().trim() : null;
    if (soleCell !== null && parseLedgerDate(soleCell) === null && parseMoneyToCents(soleCell) === null) {
      lastVendor = soleCell;
      excluded.push({ rowNumber, reason: 'group_heading', vendorName: soleCell, raw: row });
      return;
    }

    const rawVendor = vendorIsGroupColumn ? '' : cell(row, vendorIndex);
    const rawDate = cell(row, dateIndex);
    const rawAmount = cell(row, amountIndex);

    const vendorName = rawVendor !== '' ? rawVendor : lastVendor;
    if (rawVendor !== '') lastVendor = rawVendor;

    if (vendorName === '') {
      excluded.push({ rowNumber, reason: 'missing_vendor', vendorName: '', raw: row });
      return;
    }

    const paidOn = parseLedgerDate(rawDate);
    if (paidOn === null) {
      excluded.push({ rowNumber, reason: 'unreadable_date', vendorName, raw: row });
      return;
    }

    const amount = parseMoneyToCents(rawAmount);
    if (amount === null) {
      excluded.push({ rowNumber, reason: 'unreadable_amount', vendorName, raw: row });
      return;
    }

    if (amount <= 0) {
      excluded.push({ rowNumber, reason: 'non_positive_amount', vendorName, raw: row });
      return;
    }

    if (!isOnOrBetween(paidOn, termStart, termEnd)) {
      excluded.push({ rowNumber, reason: 'outside_term', vendorName, raw: row });
      return;
    }

    // A work period needs both ends and has to be ordered. A half-populated column is
    // worse than none: it would look like a work period and be tested like one.
    const workFrom = parseLedgerDate(cell(row, workFromIndex));
    const workTo = parseLedgerDate(cell(row, workToIndex));
    const usableWorkPeriod = workFrom !== null && workTo !== null && workFrom <= workTo;

    payments.push({
      rowNumber,
      vendorName,
      normalizedVendorName: normalizeName(vendorName),
      paidOn,
      workFrom: usableWorkPeriod ? workFrom : null,
      workTo: usableWorkPeriod ? workTo : null,
      amount,
      sourceRef: nullable(cell(row, refIndex)),
      memo: nullable(cell(row, memoIndex)),
    });
  });

  const vendorTotals = new Map<string, { count: number; total: Cents; normalized: string }>();
  for (const payment of payments) {
    const existing = vendorTotals.get(payment.vendorName);
    if (existing) {
      existing.count += 1;
      existing.total += payment.amount;
    } else {
      vendorTotals.set(payment.vendorName, {
        count: 1,
        total: payment.amount,
        normalized: payment.normalizedVendorName,
      });
    }
  }

  const vendors: ParsedVendor[] = [...vendorTotals.entries()]
    .map(([vendorName, value]) => ({
      vendorName,
      normalizedVendorName: value.normalized,
      paymentCount: value.count,
      total: value.total,
    }))
    // Dollars descending, so the first ten keystrokes on the triage screen cover most
    // of the money.
    .sort((a, b) => b.total - a.total || a.vendorName.localeCompare(b.vendorName));

  const excludedCounts = Object.fromEntries(
    (Object.keys(EXCLUSION_LABELS) as ExclusionReason[]).map((reason) => [
      reason,
      excluded.filter((row) => row.reason === reason).length,
    ]),
  ) as Record<ExclusionReason, number>;

  const excludedTotal = sumCents(
    excluded
      .map((row) => parseMoneyToCents(cell(row.raw, amountIndex)) ?? 0)
      .map((value) => Math.abs(value)),
  );

  return {
    payments,
    withWorkPeriod: payments.filter((payment) => payment.workFrom !== null).length,
    vendors,
    excluded,
    excludedCounts,
    totalRows: table.rows.length,
    importedTotal: sumCents(payments.map((p) => p.amount)),
    excludedTotal,
  };
}

function cell(row: readonly string[], index: number): string {
  if (index < 0) return '';
  return (row[index] ?? '').toString().trim();
}

function nullable(value: string): string | null {
  return value === '' ? null : value;
}
