import 'server-only';
import ExcelJS from 'exceljs';
import { DISCLAIMER } from '@/lib/copy';
import { RULESET_STATEMENTS } from '@/lib/exposure/ruleset';
import { FLAG_LABELS, ZERO_REASON_LABELS } from '@/lib/exposure/labels';
import { formatMod, formatRate } from '@/lib/money';
import type { PortfolioExposure } from '@/lib/exposure/types';
import type { Dataset, PolicyRecord } from '@/lib/db/types';

/**
 * Sub-level detail as a workbook (brief §8.8).
 *
 * Money is written as real numbers in dollars with a currency format, so an auditor or a
 * bookkeeper can foot the columns themselves. The conversion from integer cents happens
 * here, at the boundary, and nowhere earlier.
 */
export interface WorkbookInput {
  readonly orgName: string;
  readonly policy: PolicyRecord;
  readonly portfolio: PortfolioExposure;
  readonly data: Dataset;
  readonly generatedAt: Date;
}

const MONEY = '#,##0.00;[Red]("#,##0.00")';

export async function renderWorkbook(input: WorkbookInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.orgName;
  workbook.created = input.generatedAt;

  summarySheet(workbook, input);
  subcontractorSheet(workbook, input);
  paymentSheet(workbook, input);
  certificateSheet(workbook, input);
  methodologySheet(workbook, input);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function dollars(cents: number): number {
  return cents / 100;
}

function summarySheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [{ width: 46 }, { width: 22 }];

  const rows: [string, string | number][] = [
    ['Company', input.orgName],
    ['Carrier', input.policy.carrierName ?? '—'],
    ['Policy number', input.policy.policyNumber ?? '—'],
    ['Audit period start', input.policy.termStart],
    ['Audit period end', input.policy.termEnd],
    ['Governing class code', input.policy.governingClassCode],
    ['Rate per $100 of payroll', formatRate(input.policy.governingRate)],
    ['Experience modification factor', formatMod(input.policy.experienceMod)],
    ['Estimated annual premium', dollars(input.policy.estimatedAnnualPremium)],
    ['', ''],
    ['Added to auditable payroll', dollars(input.portfolio.addedPayroll)],
    ['Estimated additional premium', dollars(input.portfolio.addedPremiumBeforeSurcharge)],
    ['Non-compliance surcharge modeled', dollars(input.portfolio.surcharge)],
    ['Total estimated additional premium', dollars(input.portfolio.totalExposure)],
    ['', ''],
    ['Removed by a certificate covering the work dates', dollars(input.portfolio.addedPremiumBeforeSurcharge)],
    ['Reachable by an original split invoice', dollars(input.portfolio.clearedBySplitInvoice)],
    ['Only a certificate clears', dollars(input.portfolio.clearedByCertificateOnly)],
    ['', ''],
    ['Ruleset version', input.portfolio.rulesetVersion],
    ['Generated', input.generatedAt.toISOString()],
  ];

  for (const [label, value] of rows) {
    const row = sheet.addRow([label, value]);
    if (typeof value === 'number') row.getCell(2).numFmt = MONEY;
  }

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(14).font = { bold: true };

  sheet.addRow([]);
  const disclaimerRow = sheet.addRow([DISCLAIMER]);
  disclaimerRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  disclaimerRow.height = 46;
  sheet.mergeCells(disclaimerRow.number, 1, disclaimerRow.number, 2);
}

function subcontractorSheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Subcontractors');
  sheet.columns = [
    { header: 'Subcontractor', key: 'name', width: 34 },
    { header: 'Triage', key: 'triage', width: 15 },
    { header: 'Entity type', key: 'entity', width: 16 },
    { header: 'Class code', key: 'class', width: 11 },
    { header: 'Rate', key: 'rate', width: 9 },
    { header: 'Paid in term', key: 'paid', width: 15 },
    { header: 'Inside coverage', key: 'covered', width: 15 },
    { header: 'Outside coverage', key: 'uncovered', width: 16 },
    { header: 'Material claimed', key: 'claimed', width: 16 },
    { header: 'Material allowed', key: 'allowed', width: 16 },
    { header: 'Added payroll', key: 'payroll', width: 15 },
    { header: 'Added premium', key: 'premium', width: 15 },
    { header: 'Basis', key: 'basis', width: 42 },
    { header: 'Flags', key: 'flags', width: 44 },
  ];

  for (const sub of input.portfolio.subs) {
    const record = input.data.subcontractors.find((entry) => entry.id === sub.subcontractorId);
    sheet.addRow({
      name: sub.subcontractorName,
      triage: record?.triage ?? 'undecided',
      entity: record?.entityType ?? 'unknown',
      class: sub.classCode,
      rate: Number(formatRate(sub.rate)),
      paid: dollars(sub.paidTotal),
      covered: dollars(sub.coveredTotal),
      uncovered: dollars(sub.uncoveredTotal),
      claimed: dollars(sub.materialClaimed),
      allowed: dollars(sub.materialAllowed),
      payroll: dollars(sub.addedPayroll),
      premium: dollars(sub.addedPremium),
      basis:
        sub.addedPremium > 0
          ? 'Will be included in auditable payroll'
          : sub.zeroReason
            ? ZERO_REASON_LABELS[sub.zeroReason]
            : 'Will be excluded from auditable payroll',
      flags: sub.flags.map((flag) => FLAG_LABELS[flag.flag]).join('; '),
    });
  }

  // Vendors triaged out of subcontracted labor are listed but not totalled, so the
  // columns foot against the added payroll below them.
  const inScope = input.portfolio.subs.filter((sub) => sub.zeroReason !== 'not_a_subcontractor');
  const total = sheet.addRow({
    name: 'Total (subcontracted labor only)',
    paid: dollars(inScope.reduce((sum, sub) => sum + sub.paidTotal, 0)),
    uncovered: dollars(inScope.reduce((sum, sub) => sum + sub.uncoveredTotal, 0)),
    allowed: dollars(inScope.reduce((sum, sub) => sum + sub.materialAllowed, 0)),
    payroll: dollars(input.portfolio.addedPayroll),
    premium: dollars(input.portfolio.addedPremiumBeforeSurcharge),
  });
  total.font = { bold: true };

  formatMoneyColumns(sheet, ['paid', 'covered', 'uncovered', 'claimed', 'allowed', 'payroll', 'premium']);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function paymentSheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Payments');
  sheet.columns = [
    { header: 'Subcontractor', key: 'name', width: 34 },
    { header: 'Paid on', key: 'paidOn', width: 13 },
    { header: 'Reference', key: 'ref', width: 16 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Against coverage on file', key: 'covered', width: 26 },
    { header: 'Material claimed', key: 'material', width: 16 },
    { header: 'Evidence', key: 'evidence', width: 20 },
  ];

  const coveredByPayment = new Map<string, boolean>();
  for (const sub of input.portfolio.subs) {
    for (const id of sub.coveredPaymentIds) coveredByPayment.set(id, true);
    for (const id of sub.uncoveredPaymentIds) coveredByPayment.set(id, false);
  }

  const nameById = new Map(input.data.subcontractors.map((sub) => [sub.id, sub.name]));

  for (const payment of [...input.data.payments].sort(
    (a, b) => a.paidOn.localeCompare(b.paidOn) || a.subcontractorId.localeCompare(b.subcontractorId),
  )) {
    const covered = coveredByPayment.get(payment.id);
    sheet.addRow({
      name: nameById.get(payment.subcontractorId) ?? payment.subcontractorId,
      paidOn: payment.paidOn,
      ref: payment.sourceRef ?? '',
      amount: dollars(payment.amount),
      covered:
        covered === undefined
          ? 'Outside the audit period'
          : covered
            ? 'Inside a covered window'
            : 'Outside every covered window',
      material: payment.materialAmount === null ? '' : dollars(payment.materialAmount),
      evidence: payment.materialEvidence,
    });
  }

  formatMoneyColumns(sheet, ['amount', 'material']);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function certificateSheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Certificates');
  sheet.columns = [
    { header: 'Named insured', key: 'insured', width: 34 },
    { header: 'Matched to', key: 'matched', width: 34 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'WC section present', key: 'wc', width: 18 },
    { header: 'WC effective', key: 'from', width: 13 },
    { header: 'WC expires', key: 'to', width: 13 },
    { header: 'Officer exclusion noted', key: 'exclusion', width: 21 },
    { header: 'Producer', key: 'producer', width: 30 },
    { header: 'Producer email', key: 'email', width: 30 },
    { header: 'Extraction confidence', key: 'confidence', width: 20 },
  ];

  const nameById = new Map(input.data.subcontractors.map((sub) => [sub.id, sub.name]));

  for (const certificate of input.data.certificates) {
    sheet.addRow({
      insured: certificate.namedInsured ?? certificate.originalFilename ?? '',
      matched: certificate.subcontractorId
        ? (nameById.get(certificate.subcontractorId) ?? '')
        : 'Unassigned',
      status: certificate.status,
      wc: certificate.wcPresent ? 'Yes' : 'No',
      from: certificate.wcEffective ?? '',
      to: certificate.wcExpiration ?? '',
      exclusion: certificate.wcOfficerExclusionNoted ? 'Yes' : 'No',
      producer: certificate.producerName ?? '',
      email: certificate.producerEmail ?? '',
      confidence:
        certificate.extractionConfidenceThousandths === null
          ? 'Entered by hand'
          : `${(certificate.extractionConfidenceThousandths / 10).toFixed(0)}%`,
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function methodologySheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Methodology');
  sheet.columns = [{ width: 120 }];

  sheet.addRow(['Methodology']).font = { bold: true };
  for (const statement of RULESET_STATEMENTS) {
    const row = sheet.addRow([statement]);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.height = 32;
  }
  sheet.addRow([]);
  sheet.addRow([`Ruleset version: ${input.portfolio.rulesetVersion}`]);
  sheet.addRow([`Generated: ${input.generatedAt.toISOString()}`]);
  sheet.addRow([]);
  const disclaimer = sheet.addRow([DISCLAIMER]);
  disclaimer.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  disclaimer.height = 46;
}

function formatMoneyColumns(sheet: ExcelJS.Worksheet, keys: readonly string[]): void {
  for (const key of keys) {
    const column = sheet.getColumn(key);
    column.numFmt = MONEY;
  }
}
