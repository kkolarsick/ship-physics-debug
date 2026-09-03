import { describe, expect, it } from 'vitest';
import { buildImportPreview, sniffTable, suggestMapping } from '@/lib/ingest/csv';
import { LEDGER_PRESETS, presetById } from '@/lib/ingest/presets';

const QBO_EXPENSES_BY_VENDOR = `Northgate Construction LLC
Expenses by Vendor Detail
January 1 - December 31, 2025

Date,Transaction Type,Num,Memo/Description,Amount
Kowalczyk Framing
03/14/2025,Bill Payment,1201,Framing draw 1,"90,000.00"
07/08/2025,Bill Payment,1288,Framing draw 2,"124,000.00"
Total for Kowalczyk Framing,,,,"214,000.00"
Cascade Lumber Supply
04/02/2025,Bill Payment,1215,Material order,"36,400.00"
Total for Cascade Lumber Supply,,,,"36,400.00"
B&K Drywall
04/11/2025,Bill Payment,1219,,"26,400.00"
08/22/2025,Bill Payment,1242,,"31,800.00"
05/30/2025,Vendor Credit,CR-9,Returned material,"-4,200.00"
Total for B&K Drywall,,,,"54,000.00"
Delgado Electric
12/28/2024,Bill Payment,1102,Prior term,"18,000.00"
02/20/2025,Bill Payment,1188,Rough-in,"41,500.00"
Total for Delgado Electric,,,,"59,500.00"
TOTAL,,,,"363,900.00"
`;

const TERM = { termStart: '2025-01-01', termEnd: '2025-12-31' } as const;

describe('sniffTable', () => {
  it('finds the header row under a QuickBooks report preamble', () => {
    const table = sniffTable(QBO_EXPENSES_BY_VENDOR);
    expect(table.headers).toEqual(['Date', 'Transaction Type', 'Num', 'Memo/Description', 'Amount']);
    expect(table.headerRowIndex).toBe(3);
    expect(table.preambleRows).toHaveLength(3);
  });

  it('handles a plain CSV whose first row is already the header', () => {
    const table = sniffTable('Vendor,Date,Amount\nAcme,01/02/2025,100.00\n');
    expect(table.headerRowIndex).toBe(0);
    expect(table.headers).toEqual(['Vendor', 'Date', 'Amount']);
    expect(table.rows).toHaveLength(1);
  });

  it('names unlabeled columns rather than dropping them', () => {
    const table = sniffTable('Vendor,,Amount\nAcme,x,100.00\n');
    expect(table.headers[1]).toBe('Column 2');
  });
});

describe('suggestMapping', () => {
  it('maps the QuickBooks Online expenses report columns', () => {
    const table = sniffTable(QBO_EXPENSES_BY_VENDOR);
    const mapping = suggestMapping(table.headers, 'qbo_expenses_by_vendor_detail');
    expect(mapping.paidOn).toBe('Date');
    expect(mapping.amount).toBe('Amount');
    expect(mapping.sourceRef).toBe('Num');
    expect(mapping.memo).toBe('Memo/Description');
  });

  it('leaves a field unmapped rather than guessing at a column that is not there', () => {
    const mapping = suggestMapping(['Date', 'Amount'], 'generic');
    expect(mapping.vendorName).toBeUndefined();
  });

  it('ships a preset for every system named in the brief', () => {
    expect(LEDGER_PRESETS.map((preset) => preset.id)).toEqual([
      'qbo_expenses_by_vendor_detail',
      'qbo_1099_transaction_detail',
      'sage_100_contractor_ap_history',
      'foundation_vendor_payment_register',
      'generic',
    ]);
  });

  it('falls back to the generic preset for an unknown id', () => {
    expect(presetById('nope').id).toBe('generic');
  });
});

describe('buildImportPreview', () => {
  const table = sniffTable(QBO_EXPENSES_BY_VENDOR);
  const preview = buildImportPreview({
    table,
    mapping: {
      vendorName: 'Date',
      paidOn: 'Date',
      amount: 'Amount',
      sourceRef: 'Num',
      memo: 'Memo/Description',
    },
    ...TERM,
  });

  it('excludes credits and voids but counts them', () => {
    expect(preview.excludedCounts.non_positive_amount).toBe(1);
    expect(preview.excluded.some((row) => row.raw.includes('Returned material'))).toBe(true);
  });

  it('excludes payments outside the policy term but counts them', () => {
    expect(preview.excludedCounts.outside_term).toBe(1);
    const outside = preview.excluded.find((row) => row.reason === 'outside_term');
    expect(outside?.raw).toContain('Prior term');
  });

  it('excludes report subtotal and vendor heading rows', () => {
    expect(preview.excludedCounts.subtotal_row).toBeGreaterThanOrEqual(5);
  });

  it('imports only the rows that survived every rule', () => {
    expect(preview.payments).toHaveLength(6);
    expect(preview.importedTotal).toBe(35_010_000); // $350,100.00
  });

  it('accounts for every row it was given', () => {
    expect(preview.payments.length + preview.excluded.length).toBe(preview.totalRows);
  });
});

describe('vendor grouping', () => {
  const csv = `Vendor,Date,Amount
KOWALCZYK FRAMING,03/14/2025,"90,000.00"
Kowalczyk Framing & Carpentry LLC,07/08/2025,"124,000.00"
Cascade Lumber Supply,04/02/2025,"36,400.00"
`;

  const preview = buildImportPreview({
    table: sniffTable(csv),
    mapping: { vendorName: 'Vendor', paidOn: 'Date', amount: 'Amount' },
    ...TERM,
  });

  it('does not deduplicate across differing spellings automatically', () => {
    expect(preview.vendors.map((v) => v.vendorName)).toEqual([
      'Kowalczyk Framing & Carpentry LLC',
      'KOWALCZYK FRAMING',
      'Cascade Lumber Supply',
    ]);
  });

  it('sorts vendors by dollars descending, so triage covers the money first', () => {
    expect(preview.vendors[0]?.total).toBe(12_400_000);
    expect(preview.vendors.at(-1)?.total).toBe(3_640_000);
  });

  it('records the normalized name for the matching step without merging on it', () => {
    expect(preview.vendors[0]?.normalizedVendorName).toBe('KOWALCZYK FRAMING AND CARPENTRY');
  });
});

describe('unreadable rows', () => {
  const csv = `Vendor,Date,Amount
Acme,not a date,"100.00"
Beta,03/01/2025,not money
Gamma,03/01/2025,"0.00"
`;

  const preview = buildImportPreview({
    table: sniffTable(csv),
    mapping: { vendorName: 'Vendor', paidOn: 'Date', amount: 'Amount' },
    ...TERM,
  });

  it('reports each reason separately rather than dropping rows silently', () => {
    expect(preview.excludedCounts.unreadable_date).toBe(1);
    expect(preview.excludedCounts.unreadable_amount).toBe(1);
    expect(preview.excludedCounts.non_positive_amount).toBe(1);
    expect(preview.payments).toHaveLength(0);
  });
});

describe('re-import stability', () => {
  it('produces identical output for identical input', () => {
    const build = () =>
      buildImportPreview({
        table: sniffTable(QBO_EXPENSES_BY_VENDOR),
        mapping: { vendorName: 'Date', paidOn: 'Date', amount: 'Amount' },
        ...TERM,
      });
    expect(build().payments).toEqual(build().payments);
    expect(build().vendors).toEqual(build().vendors);
  });
});
