/**
 * Named presets for the ledger exports contractors actually have (brief §4a).
 *
 * A preset is a set of header aliases, not a fixed schema — the column-mapping step
 * still runs and the user can override every guess. Accounting systems rename these
 * columns between versions, so a preset that misses just falls back to the generic
 * matcher rather than failing the import.
 */
export interface LedgerPreset {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly aliases: {
    readonly vendorName: readonly string[];
    readonly paidOn: readonly string[];
    readonly amount: readonly string[];
    readonly sourceRef: readonly string[];
    readonly memo: readonly string[];
    /** Service/work period columns. Rare in AP exports, common in job-cost exports. */
    readonly workFrom: readonly string[];
    readonly workTo: readonly string[];
  };
}

const GENERIC_ALIASES = {
  vendorName: ['vendor', 'vendor name', 'payee', 'name', 'supplier', 'subcontractor'],
  paidOn: ['date', 'payment date', 'paid date', 'transaction date', 'check date', 'post date'],
  amount: ['amount', 'total', 'paid', 'payment amount', 'debit', 'net amount'],
  sourceRef: ['num', 'number', 'check #', 'check number', 'invoice', 'invoice #', 'reference', 'ref'],
  memo: ['memo', 'description', 'memo/description', 'notes'],
  workFrom: [
    'work from', 'service from', 'period from', 'work start', 'service start',
    'start date', 'from date', 'job start',
  ],
  workTo: [
    'work to', 'service to', 'period to', 'work end', 'service end',
    'end date', 'to date', 'job end', 'completion date',
  ],
} as const;

export const LEDGER_PRESETS: readonly LedgerPreset[] = [
  {
    id: 'qbo_expenses_by_vendor_detail',
    label: 'QuickBooks Online — Expenses by Vendor Detail',
    hint: 'Reports → Expenses by Vendor Detail. Export to CSV without the summary rows if you can.',
    aliases: {
      vendorName: ['vendor', 'name', 'payee', ...GENERIC_ALIASES.vendorName],
      paidOn: ['date', 'transaction date', ...GENERIC_ALIASES.paidOn],
      amount: ['amount', 'total', ...GENERIC_ALIASES.amount],
      sourceRef: ['num', 'no.', ...GENERIC_ALIASES.sourceRef],
      memo: ['memo/description', 'memo', ...GENERIC_ALIASES.memo],
      workFrom: GENERIC_ALIASES.workFrom,
      workTo: GENERIC_ALIASES.workTo,
    },
  },
  {
    id: 'qbo_1099_transaction_detail',
    label: 'QuickBooks Online — 1099 Transaction Detail Report',
    hint: 'Reports → 1099 Transaction Detail Report. Covers exactly the vendors an auditor asks about first.',
    aliases: {
      vendorName: ['vendor', 'name', 'payee', ...GENERIC_ALIASES.vendorName],
      paidOn: ['date', ...GENERIC_ALIASES.paidOn],
      amount: ['amount', '1099 amount', 'total amount', ...GENERIC_ALIASES.amount],
      sourceRef: ['num', ...GENERIC_ALIASES.sourceRef],
      memo: ['memo/description', ...GENERIC_ALIASES.memo],
      workFrom: GENERIC_ALIASES.workFrom,
      workTo: GENERIC_ALIASES.workTo,
    },
  },
  {
    id: 'sage_100_contractor_ap_history',
    label: 'Sage 100 Contractor — AP vendor payment history',
    hint: 'Accounts Payable → Vendor Payment History, exported to CSV.',
    aliases: {
      vendorName: ['vendor name', 'vendor', 'payee', ...GENERIC_ALIASES.vendorName],
      paidOn: ['check date', 'payment date', 'date paid', ...GENERIC_ALIASES.paidOn],
      amount: ['payment amount', 'check amount', 'amount paid', ...GENERIC_ALIASES.amount],
      sourceRef: ['check number', 'check#', 'invoice number', ...GENERIC_ALIASES.sourceRef],
      memo: ['description', ...GENERIC_ALIASES.memo],
      workFrom: ['service from', 'work start', ...GENERIC_ALIASES.workFrom],
      workTo: ['service to', 'work end', ...GENERIC_ALIASES.workTo],
    },
  },
  {
    id: 'foundation_vendor_payment_register',
    label: 'Foundation — vendor payment register',
    hint: 'Accounts Payable → Payment Register for the policy term.',
    aliases: {
      vendorName: ['vendor name', 'vendor', ...GENERIC_ALIASES.vendorName],
      paidOn: ['payment date', 'check date', ...GENERIC_ALIASES.paidOn],
      amount: ['payment amount', 'gross', 'amount', ...GENERIC_ALIASES.amount],
      sourceRef: ['check no', 'check no.', 'invoice no', ...GENERIC_ALIASES.sourceRef],
      memo: ['description', ...GENERIC_ALIASES.memo],
      workFrom: ['period from', ...GENERIC_ALIASES.workFrom],
      workTo: ['period to', ...GENERIC_ALIASES.workTo],
    },
  },
  {
    id: 'generic',
    label: 'Generic — map the columns yourself',
    hint: 'Any CSV with a vendor name, a payment date, and an amount.',
    aliases: GENERIC_ALIASES,
  },
];

export function presetById(id: string): LedgerPreset {
  return LEDGER_PRESETS.find((preset) => preset.id === id) ?? LEDGER_PRESETS[LEDGER_PRESETS.length - 1]!;
}
