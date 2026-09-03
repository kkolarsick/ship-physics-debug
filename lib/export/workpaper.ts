import 'server-only';
import PDFDocument from 'pdfkit';
import { DISCLAIMER } from '@/lib/copy';
import { RULESET_STATEMENTS } from '@/lib/exposure/ruleset';
import { FLAG_LABELS, ZERO_REASON_LABELS } from '@/lib/exposure/labels';
import { formatUsDate } from '@/lib/dates';
import { formatDollars, formatDollarsExact, formatMod, formatRate } from '@/lib/money';
import type { PortfolioExposure } from '@/lib/exposure/types';
import type { PolicyRecord } from '@/lib/db/types';

/**
 * The audit workpaper (brief §8.8).
 *
 * This is the artifact that may end up in front of a carrier's auditor, so it is built to
 * be read as a workpaper: a schedule with totals that foot, a methodology page stating the
 * modeled rules as modeled rules, and the ruleset version and generation timestamp on
 * every page. The disclaimer is on the cover and in the footer of every page.
 */
export interface WorkpaperInput {
  readonly orgName: string;
  readonly policy: PolicyRecord;
  readonly portfolio: PortfolioExposure;
  readonly generatedAt: Date;
}

const MARGIN = 48;
const PAGE_WIDTH = 792; // US Letter, landscape — the schedule needs the columns.
const PAGE_HEIGHT = 612;

export async function renderWorkpaper(input: WorkpaperInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Subcontractor premium exposure — ${input.orgName}`,
      Author: input.orgName,
      Subject: `Policy term ${input.policy.termStart} to ${input.policy.termEnd}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  coverBlock(doc, input);
  scheduleTable(doc, input);
  flagsPage(doc, input);
  methodologyPage(doc, input);
  stampEveryPage(doc, input);

  doc.end();
  return finished;
}

function coverBlock(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  const { portfolio, policy } = input;

  doc.font('Helvetica-Bold').fontSize(16).text(input.orgName);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#444444')
    .text(
      `Estimated additional workers’ compensation premium at audit — policy term ${formatUsDate(policy.termStart)} to ${formatUsDate(policy.termEnd)}`,
    );
  doc.moveDown(0.8);

  doc.fillColor('#9E2B1B').font('Helvetica-Bold').fontSize(30).text(formatDollars(portfolio.totalExposure));
  doc
    .fillColor('#000000')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `${formatDollars(portfolio.addedPayroll)} of payments added to auditable payroll · carrier ${policy.carrierName ?? '—'} · policy ${policy.policyNumber ?? '—'} · class ${policy.governingClassCode} at ${formatRate(policy.governingRate)} per $100 · experience mod ${formatMod(policy.experienceMod)}`,
    );

  doc.moveDown(0.6);
  doc.fillColor('#666666').fontSize(7.5).text(DISCLAIMER, { width: PAGE_WIDTH - MARGIN * 2 });
  doc.fillColor('#000000');
  doc.moveDown(0.8);
}

interface Column {
  readonly label: string;
  readonly width: number;
  readonly align: 'left' | 'right';
}

const COLUMNS: readonly Column[] = [
  { label: 'Subcontractor', width: 148, align: 'left' },
  { label: 'Class', width: 42, align: 'left' },
  { label: 'Rate', width: 42, align: 'right' },
  { label: 'Paid in term', width: 74, align: 'right' },
  { label: 'Outside coverage', width: 82, align: 'right' },
  { label: 'Material allowed', width: 84, align: 'right' },
  { label: 'Added payroll', width: 76, align: 'right' },
  { label: 'Added premium', width: 80, align: 'right' },
  { label: 'Basis', width: 68, align: 'left' },
];

function scheduleTable(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  doc.font('Helvetica-Bold').fontSize(9).text('Schedule of subcontractor exposure');
  doc.moveDown(0.4);

  let y = doc.y;
  y = header(doc, y);

  const rows = input.portfolio.subs.filter((sub) => sub.paidTotal > 0);
  // A vendor triaged out of subcontracted labor is listed for completeness, but its
  // coverage columns are not in scope and are excluded from the totals so they foot.
  const inScope = rows.filter((sub) => sub.zeroReason !== 'not_a_subcontractor');

  for (const sub of rows) {
    if (y > PAGE_HEIGHT - MARGIN - 46) {
      doc.addPage();
      y = MARGIN;
      y = header(doc, y);
    }

    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    const basis =
      sub.addedPremium > 0
        ? 'Included'
        : sub.zeroReason === 'not_a_subcontractor'
          ? 'Not sub labor'
          : 'Excluded';

    const outOfScope = sub.zeroReason === 'not_a_subcontractor';
    cells(doc, y, [
      sub.subcontractorName,
      outOfScope ? '—' : sub.classCode,
      outOfScope ? '—' : formatRate(sub.rate),
      formatDollars(sub.paidTotal),
      outOfScope ? 'n/a' : formatDollars(sub.uncoveredTotal),
      outOfScope || sub.materialAllowed === 0 ? '—' : formatDollars(sub.materialAllowed),
      sub.addedPayroll === 0 ? '—' : formatDollars(sub.addedPayroll),
      sub.addedPremium === 0 ? '—' : formatDollars(sub.addedPremium),
      basis,
    ]);
    y += 15;
    rule(doc, y - 4, '#E2DFD5');
  }

  // Totals that foot, because that is the first thing an auditor checks.
  doc.font('Helvetica-Bold').fontSize(8);
  rule(doc, y - 3, '#000000');
  cells(doc, y + 2, [
    'Total',
    '',
    '',
    formatDollars(inScope.reduce((total, sub) => total + sub.paidTotal, 0)),
    formatDollars(inScope.reduce((total, sub) => total + sub.uncoveredTotal, 0)),
    formatDollars(inScope.reduce((total, sub) => total + sub.materialAllowed, 0)),
    formatDollars(input.portfolio.addedPayroll),
    formatDollars(input.portfolio.addedPremiumBeforeSurcharge),
    '',
  ]);
  y += 20;

  if (input.portfolio.surcharge > 0) {
    doc.font('Helvetica').fontSize(8);
    cells(doc, y, [
      `Non-compliance surcharge, ${formatDollarsExact(input.policy.estimatedAnnualPremium)} estimated premium`,
      '',
      '',
      '',
      '',
      '',
      '',
      formatDollars(input.portfolio.surcharge),
      '',
    ]);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(9);
    rule(doc, y - 4, '#000000');
    cells(doc, y, ['Estimated additional premium', '', '', '', '', '', '', formatDollars(input.portfolio.totalExposure), '']);
    y += 20;
  }

  doc.y = y + 6;
}

function header(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555555');
  cells(
    doc,
    y,
    COLUMNS.map((column) => column.label.toUpperCase()),
  );
  rule(doc, y + 11, '#999999');
  doc.fillColor('#000000');
  return y + 17;
}

function cells(doc: PDFKit.PDFDocument, y: number, values: readonly string[]): void {
  let x = MARGIN;
  COLUMNS.forEach((column, index) => {
    doc.text(values[index] ?? '', x, y, {
      width: column.width - 6,
      align: column.align,
      lineBreak: false,
    });
    x += column.width;
  });
}

function rule(doc: PDFKit.PDFDocument, y: number, color: string): void {
  const width = COLUMNS.reduce((total, column) => total + column.width, 0);
  doc.save().moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.5).strokeColor(color).stroke().restore();
}

function flagsPage(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  const flagged = input.portfolio.subs.filter((sub) => sub.flags.length > 0);
  if (flagged.length === 0) return;

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text('Questions for the auditor');
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#555555')
    .text('Each item below is an annotation on the schedule. None of them adjusts a figure.');
  doc.fillColor('#000000').moveDown(0.6);

  for (const sub of flagged) {
    doc.font('Helvetica-Bold').fontSize(9).text(sub.subcontractorName);
    for (const flag of sub.flags) {
      doc.font('Helvetica-Bold').fontSize(8).text(`  ${FLAG_LABELS[flag.flag]}`, { continued: false });
      doc.font('Helvetica').fontSize(8).fillColor('#333333').text(`    ${flag.detail}`, {
        width: PAGE_WIDTH - MARGIN * 2 - 20,
      });
      doc.fillColor('#000000');
    }
    doc.moveDown(0.4);
  }

  const excluded = input.portfolio.subs.filter(
    (sub) => sub.paidTotal > 0 && sub.addedPremium === 0 && sub.zeroReason !== null,
  );
  if (excluded.length > 0) {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(9).text('Vendors carrying no exposure, and why');
    for (const sub of excluded) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(
          `  ${sub.subcontractorName} — ${formatDollars(sub.paidTotal)} — ${sub.zeroReason ? ZERO_REASON_LABELS[sub.zeroReason] : ''}`,
        );
    }
  }
}

function methodologyPage(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text('Methodology');
  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
  RULESET_STATEMENTS.forEach((statement, index) => {
    doc.text(`${index + 1}.  ${statement}`, { width: PAGE_WIDTH - MARGIN * 2, paragraphGap: 6 });
  });

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(9).text('Inputs used');
  doc.font('Helvetica').fontSize(8.5).text(
    [
      `Audit period: ${formatUsDate(input.policy.termStart)} to ${formatUsDate(input.policy.termEnd)}`,
      `Governing class code: ${input.policy.governingClassCode}`,
      `Rate: ${formatRate(input.policy.governingRate)} per $100 of payroll`,
      `Experience modification factor: ${formatMod(input.policy.experienceMod)}`,
      `Estimated annual premium: ${formatDollarsExact(input.policy.estimatedAnnualPremium)}`,
      `Non-compliance surcharge modeled: ${input.portfolio.surcharge > 0 ? formatDollarsExact(input.portfolio.surcharge) : 'none'}`,
      `Ruleset version: ${input.portfolio.rulesetVersion}`,
    ].join('\n'),
    { paragraphGap: 2 },
  );

  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(9).text('Coverage status');
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      'Coverage status in this workpaper reflects the certificates on file as of the generation timestamp below. It has not been confirmed with any insurer. Where a certificate shows workers’ compensation for part of the period worked, only the payments dated outside every covered window are included.',
      { width: PAGE_WIDTH - MARGIN * 2 },
    );
}

function stampEveryPage(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  const range = doc.bufferedPageRange();
  const stamp = `${input.orgName} · Ruleset ${input.portfolio.rulesetVersion} · Generated ${input.generatedAt.toISOString()}`;

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    // Writing below the bottom margin would otherwise flow onto a new page, and each new
    // page would then need its own footer. Drop the margin for the footer, then restore it.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font('Helvetica').fontSize(6.5).fillColor('#777777');
    doc.text(stamp, MARGIN, PAGE_HEIGHT - 40, {
      width: PAGE_WIDTH - MARGIN * 2 - 70,
      lineBreak: false,
    });
    doc.text(`Page ${index + 1} of ${range.count}`, PAGE_WIDTH - MARGIN - 70, PAGE_HEIGHT - 40, {
      width: 70,
      align: 'right',
      lineBreak: false,
    });
    doc.fontSize(6).text(DISCLAIMER, MARGIN, PAGE_HEIGHT - 30, {
      width: PAGE_WIDTH - MARGIN * 2,
    });

    doc.fillColor('#000000');
    doc.page.margins.bottom = bottom;
  }
}
