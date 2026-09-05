import 'server-only';
import ExcelJS from 'exceljs';
import { DISCLAIMER } from '@/lib/copy';
import {
  COVERAGE_BASIS_LABELS,
  FLAG_LABELS,
  RATE_PROVENANCE_LABELS,
  ZERO_REASON_LABELS,
} from '@/lib/exposure/labels';
import { CONFIDENCE_FACTOR_LABELS, CONFIDENCE_LABELS } from '@/lib/exposure/confidence';
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
  confidenceSheet(workbook, input);
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
    ['', ''],
    ['Jurisdiction', input.policy.jurisdiction ?? 'not set'],
    ['Rating bureau', input.portfolio.provenance.ratingBureau ?? 'not set'],
    ['Rules profile', input.portfolio.rulesProfile?.label ?? 'none resolved'],
    ['Rules profile status', input.portfolio.provenance.rulesProfileStatus],
    ['', ''],
    ['Estimate status', input.portfolio.status],
    ...(input.portfolio.status === 'unavailable'
      ? ([['Why no estimate', input.portfolio.unavailable?.message ?? '']] as [string, string][])
      : ([] as [string, string][])),
    ['Added to auditable payroll', dollars(input.portfolio.addedPayroll)],
    ['Estimated additional premium', dollars(input.portfolio.addedPremiumBeforeSurcharge)],
    ['Payroll with no defensible rate (not rated)', dollars(input.portfolio.unratedPayroll)],
    ['Premium resting on the governing-rate proxy', dollars(input.portfolio.proxyRatedPremium)],
    ['Audit noncompliance charge', dollars(input.portfolio.auditNoncompliance.charge)],
    ['Audit noncompliance basis', input.portfolio.auditNoncompliance.statement],
    ['Total estimated additional premium', dollars(input.portfolio.totalExposure)],
    ['', ''],
    ['Removed by a certificate covering the period worked', dollars(input.portfolio.addedPremiumBeforeSurcharge)],
    ['Reachable by an original split invoice', dollars(input.portfolio.clearedBySplitInvoice)],
    ['Only a certificate clears', dollars(input.portfolio.clearedByCertificateOnly)],
    ['', ''],
    ['Overall confidence', CONFIDENCE_LABELS[input.portfolio.confidence.level]],
    ['Ruleset', `${input.portfolio.provenance.rulesetId} ${input.portfolio.provenance.rulesetVersion}`],
    ['Generated', input.generatedAt.toISOString()],
  ];

  for (const [label, value] of rows) {
    const row = sheet.addRow([label, value]);
    if (typeof value === 'number') row.getCell(2).numFmt = MONEY;
  }

  sheet.getRow(1).font = { bold: true };

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
    { header: 'Rate basis', key: 'rateBasis', width: 28 },
    { header: 'Coverage tested against', key: 'coverageBasis', width: 24 },
    { header: 'Confidence', key: 'confidence', width: 16 },
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
      class: sub.rate.classCode ?? '',
      rate: sub.rate.rate === null ? '' : Number(formatRate(sub.rate.rate)),
      rateBasis: RATE_PROVENANCE_LABELS[sub.rate.provenance],
      coverageBasis: sub.usedPaymentDateProxy
        ? COVERAGE_BASIS_LABELS.payment_date_proxy
        : COVERAGE_BASIS_LABELS.work_period,
      confidence: CONFIDENCE_LABELS[sub.confidence.level],
      paid: dollars(sub.paidTotal),
      covered: dollars(sub.coveredTotal),
      uncovered: dollars(sub.uncoveredTotal),
      claimed: dollars(sub.materialClaimed),
      allowed: dollars(sub.materialAllowed),
      payroll: dollars(sub.addedPayroll),
      premium: sub.addedPremium === null ? '' : dollars(sub.addedPremium),
      basis:
        (sub.addedPremium ?? 0) > 0
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
    { header: 'Work from', key: 'workFrom', width: 13 },
    { header: 'Work to', key: 'workTo', width: 13 },
    { header: 'Tested against', key: 'testedAgainst', width: 22 },
    { header: 'Reference', key: 'ref', width: 16 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Against coverage on file', key: 'covered', width: 30 },
    { header: 'Material claimed', key: 'material', width: 16 },
    { header: 'Evidence', key: 'evidence', width: 20 },
  ];

  const assessmentByPayment = new Map(
    input.portfolio.subs.flatMap((sub) =>
      sub.assessments.map((assessment) => [assessment.paymentId, assessment] as const),
    ),
  );

  const nameById = new Map(input.data.subcontractors.map((sub) => [sub.id, sub.name]));

  for (const payment of [...input.data.payments].sort(
    (a, b) => a.paidOn.localeCompare(b.paidOn) || a.subcontractorId.localeCompare(b.subcontractorId),
  )) {
    const assessment = assessmentByPayment.get(payment.id);
    sheet.addRow({
      name: nameById.get(payment.subcontractorId) ?? payment.subcontractorId,
      paidOn: payment.paidOn,
      workFrom: payment.workFrom ?? '',
      workTo: payment.workTo ?? '',
      testedAgainst: assessment ? COVERAGE_BASIS_LABELS[assessment.basis] : 'Not evaluated',
      ref: payment.sourceRef ?? '',
      amount: dollars(payment.amount),
      covered:
        assessment === undefined
          ? 'Outside the audit period'
          : assessment.uncoveredAmount === 0
            ? 'Inside a covered period'
            : assessment.coveredAmount === 0
              ? 'Outside every covered period'
              : `Split: ${assessment.coveredDays} of ${assessment.totalDays} days covered`,
      material: payment.materialAmount === null ? '' : dollars(payment.materialAmount),
      evidence: payment.materialEvidence,
    });
  }

  formatMoneyColumns(sheet, ['amount', 'material']);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function confidenceSheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Assumptions');
  sheet.columns = [
    { header: 'Factor', key: 'factor', width: 26 },
    { header: 'Level', key: 'level', width: 18 },
    { header: 'What is known', key: 'statement', width: 78 },
    { header: 'Assumption made', key: 'assumption', width: 78 },
  ];

  for (const entry of input.portfolio.confidence.factors) {
    const row = sheet.addRow({
      factor: CONFIDENCE_FACTOR_LABELS[entry.id],
      level: CONFIDENCE_LABELS[entry.level],
      statement: entry.statement,
      assumption: entry.assumption ?? '',
    });
    row.getCell('statement').alignment = { wrapText: true, vertical: 'top' };
    row.getCell('assumption').alignment = { wrapText: true, vertical: 'top' };
  }

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
    { header: 'How it was matched', key: 'matchMethod', width: 20 },
    { header: 'Reviewed by a person', key: 'reviewed', width: 20 },
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
      matchMethod: certificate.matchMethod,
      reviewed: certificate.evidence === 'model_extracted' ? 'No' : 'Yes',
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function methodologySheet(workbook: ExcelJS.Workbook, input: WorkbookInput): void {
  const sheet = workbook.addWorksheet('Methodology');
  sheet.columns = [{ width: 120 }];

  sheet.addRow([
    input.portfolio.rulesProfile
      ? `${input.portfolio.rulesProfile.label} — ${input.portfolio.provenance.rulesetId} ${input.portfolio.provenance.rulesetVersion} (${input.portfolio.provenance.rulesProfileStatus})`
      : 'No rules profile was in effect for this policy term.',
  ]).font = { bold: true };
  for (const statement of input.portfolio.rulesProfile?.statements ?? []) {
    const row = sheet.addRow([statement]);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.height = 32;
  }
  sheet.addRow([]);
  sheet.addRow([`Jurisdiction: ${input.policy.jurisdiction ?? 'not set'}`]);
  sheet.addRow([
    `Ruleset: ${input.portfolio.provenance.rulesetId} ${input.portfolio.provenance.rulesetVersion}`,
  ]);
  sheet.addRow([`Audit noncompliance: ${input.portfolio.auditNoncompliance.statement}`]);
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
