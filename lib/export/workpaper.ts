import 'server-only';
import PDFDocument from 'pdfkit';
import { DISCLAIMER } from '@/lib/copy';
import {
  FLAG_LABELS,
  RATE_PROVENANCE_LABELS,
  RATE_PROVENANCE_SHORT,
  ZERO_REASON_LABELS,
} from '@/lib/exposure/labels';
import { CONFIDENCE_FACTOR_LABELS, CONFIDENCE_LABELS } from '@/lib/exposure/confidence';
import { formatUsDate } from '@/lib/dates';
import { formatDollars, formatDollarsExact, formatMod, formatRate } from '@/lib/money';
import type { PortfolioExposure, SubExposure } from '@/lib/exposure/types';
import type { PolicyRecord } from '@/lib/db/types';

/**
 * The audit workpaper.
 *
 * This is the artifact that may end up in front of a carrier's auditor, so it is built to
 * be read as a workpaper: a schedule with totals that foot, the ruleset and jurisdiction
 * that governed it, a page of assumptions stating exactly which figures rest on a proxy
 * and which do not, and the generation timestamp on every page.
 *
 * Where no estimate could be produced it says so on the cover and prints no dollar figure
 * anywhere. A workpaper that quietly omits its own uncertainty is worse than no workpaper.
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
  if (input.portfolio.status === 'estimated') {
    scheduleTable(doc, input);
    assumptionsPage(doc, input);
    flagsPage(doc, input);
  }
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

  if (portfolio.status === 'unavailable') {
    doc.fillColor('#8A6A17').font('Helvetica-Bold').fontSize(18).text('Estimate unavailable');
    doc
      .fillColor('#000000')
      .font('Helvetica')
      .fontSize(9)
      .text(portfolio.unavailable?.message ?? 'No rules profile is in effect for this policy.', {
        width: PAGE_WIDTH - MARGIN * 2,
      });
    doc.moveDown(0.5);
    doc
      .fontSize(8.5)
      .text(
        `Ledger on file for this term: ${formatDollars(portfolio.subs.reduce((total, sub) => total + sub.paidTotal, 0))} across ${portfolio.subs.length} vendors. No premium figure is produced for it, and none should be inferred from this document.`,
        { width: PAGE_WIDTH - MARGIN * 2 },
      );
    doc.moveDown(0.6);
    doc.fillColor('#666666').fontSize(7.5).text(DISCLAIMER, { width: PAGE_WIDTH - MARGIN * 2 });
    doc.fillColor('#000000');
    return;
  }

  doc
    .fillColor('#9E2B1B')
    .font('Helvetica-Bold')
    .fontSize(30)
    .text(formatDollars(portfolio.totalExposure));
  doc
    .fillColor('#000000')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `${formatDollars(portfolio.addedPayroll)} of payments added to auditable payroll · ${policy.jurisdiction ?? 'jurisdiction not set'} · ${portfolio.provenance.ratingBureau ?? 'bureau not set'} · ruleset ${portfolio.provenance.rulesetId} ${portfolio.provenance.rulesetVersion} · carrier ${policy.carrierName ?? '—'} · policy ${policy.policyNumber ?? '—'} · experience mod ${formatMod(policy.experienceMod)}`,
      { width: PAGE_WIDTH - MARGIN * 2 },
    );

  doc
    .fontSize(8.5)
    .fillColor('#8A6A17')
    .text(`Confidence: ${CONFIDENCE_LABELS[portfolio.confidence.level]}.`, { continued: true })
    .fillColor('#444444')
    .text(
      portfolio.confidence.assumptions.length === 0
        ? ' No assumptions were needed to produce this figure.'
        : ` ${portfolio.confidence.assumptions.length} assumption${portfolio.confidence.assumptions.length === 1 ? '' : 's'} — see the assumptions page.`,
    );

  doc.moveDown(0.5);
  doc.fillColor('#666666').fontSize(7.5).text(DISCLAIMER, { width: PAGE_WIDTH - MARGIN * 2 });
  doc.fillColor('#000000');
  doc.moveDown(0.7);
}

interface Column {
  readonly label: string;
  readonly width: number;
  readonly align: 'left' | 'right';
}

const COLUMNS: readonly Column[] = [
  { label: 'Subcontractor', width: 128, align: 'left' },
  { label: 'Class', width: 36, align: 'left' },
  { label: 'Rate', width: 36, align: 'right' },
  { label: 'Rate basis', width: 82, align: 'left' },
  { label: 'Paid in term', width: 68, align: 'right' },
  { label: 'Outside coverage', width: 76, align: 'right' },
  { label: 'Material allowed', width: 74, align: 'right' },
  { label: 'Added payroll', width: 70, align: 'right' },
  { label: 'Added premium', width: 72, align: 'right' },
  { label: 'Treatment', width: 54, align: 'left' },
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

    doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
    const outOfScope = sub.zeroReason === 'not_a_subcontractor';

    cells(doc, y, [
      sub.subcontractorName,
      outOfScope ? '—' : (sub.rate.classCode ?? 'unknown'),
      outOfScope || sub.rate.rate === null ? '—' : formatRate(sub.rate.rate),
      outOfScope ? '—' : RATE_PROVENANCE_SHORT[sub.rate.provenance],
      formatDollars(sub.paidTotal),
      outOfScope ? 'n/a' : formatDollars(sub.uncoveredTotal),
      outOfScope || sub.materialAllowed === 0 ? '—' : formatDollars(sub.materialAllowed),
      sub.addedPayroll === 0 ? '—' : formatDollars(sub.addedPayroll),
      sub.addedPremium === null ? 'unrated' : sub.addedPremium === 0 ? '—' : formatDollars(sub.addedPremium),
      treatmentOf(sub),
    ]);
    y += 14;
    rule(doc, y - 4, '#E2DFD5');
  }

  // Totals that foot, because that is the first thing an auditor checks.
  doc.font('Helvetica-Bold').fontSize(8);
  rule(doc, y - 3, '#000000');
  cells(doc, y + 2, [
    'Total',
    '',
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

  doc.font('Helvetica').fontSize(8);

  if (input.portfolio.unratedPayroll > 0) {
    cells(doc, y, [
      `Payroll with no defensible rate (${input.portfolio.unratedSubcontractorCount} subcontractor${input.portfolio.unratedSubcontractorCount === 1 ? '' : 's'})`,
      '', '', '', '', '', '',
      formatDollars(input.portfolio.unratedPayroll),
      'not rated',
      '',
    ]);
    y += 16;
  }

  if (input.portfolio.auditNoncompliance.applies) {
    cells(doc, y, [
      'Audit noncompliance charge',
      '', '', '', '', '', '', '',
      formatDollars(input.portfolio.auditNoncompliance.charge),
      '',
    ]);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(9);
    rule(doc, y - 4, '#000000');
    cells(doc, y, [
      'Estimated additional premium',
      '', '', '', '', '', '', '',
      formatDollars(input.portfolio.totalExposure),
      '',
    ]);
    y += 20;
  }

  doc.y = y + 6;
}

function treatmentOf(sub: SubExposure): string {
  if (sub.zeroReason === 'not_a_subcontractor') return 'Not sub labor';
  if (sub.zeroReason === 'special_category_excluded') return 'Excluded';
  if (sub.addedPremium === null && sub.addedPayroll > 0) return 'Unrated';
  return sub.addedPayroll > 0 ? 'Included' : 'Excluded';
}

function header(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#555555');
  cells(
    doc,
    y,
    COLUMNS.map((column) => column.label.toUpperCase()),
  );
  rule(doc, y + 10, '#999999');
  doc.fillColor('#000000');
  return y + 16;
}

function cells(doc: PDFKit.PDFDocument, y: number, values: readonly string[]): void {
  let x = MARGIN;
  COLUMNS.forEach((column, index) => {
    doc.text(values[index] ?? '', x, y, {
      width: column.width - 5,
      align: column.align,
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  });
}

function rule(doc: PDFKit.PDFDocument, y: number, color: string): void {
  const width = COLUMNS.reduce((total, column) => total + column.width, 0);
  doc.save().moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.5).strokeColor(color).stroke().restore();
}

/**
 * What the figure rests on. This page is the difference between an estimate an auditor can
 * argue with and a number they can dismiss.
 */
function assumptionsPage(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  const { portfolio } = input;
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text('Assumptions and confidence');
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#555555')
    .text(
      'The arithmetic below is exact. The inputs it runs on are not all equally certain, and this page says which is which.',
      { width: PAGE_WIDTH - MARGIN * 2 },
    );
  doc.fillColor('#000000').moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(9).text(`Overall: ${CONFIDENCE_LABELS[portfolio.confidence.level]}`);
  doc.moveDown(0.3);

  for (const entry of portfolio.confidence.factors) {
    doc.font('Helvetica-Bold').fontSize(8).text(
      `${CONFIDENCE_FACTOR_LABELS[entry.id]} — ${CONFIDENCE_LABELS[entry.level]}`,
    );
    doc.font('Helvetica').fontSize(8).fillColor('#333333').text(`  ${entry.statement}`, {
      width: PAGE_WIDTH - MARGIN * 2 - 12,
    });
    if (entry.assumption) {
      doc.fillColor('#8A6A17').text(`  Assumption: ${entry.assumption}`, {
        width: PAGE_WIDTH - MARGIN * 2 - 12,
      });
    }
    doc.fillColor('#000000').moveDown(0.25);
  }

  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(9).text('What would make this figure exact');
  doc.font('Helvetica').fontSize(8);

  // Only the subcontractors whose inputs bear on a figure. A vendor triaged out as a
  // material supplier has no work dates and does not need any.
  const contributing = portfolio.subs.filter(
    (sub) => sub.addedPayroll > 0 || sub.zeroReason === 'covered' || sub.status === 'unavailable',
  );
  const proxied = contributing.filter((sub) => sub.usedPaymentDateProxy);
  if (proxied.length > 0) {
    doc.text(
      `  Work dates for ${proxied.length} subcontractor${proxied.length === 1 ? '' : 's'}. Coverage was tested against the payment date, which can misstate exposure in either direction where work and payment fall on opposite sides of a certificate’s expiry.`,
      { width: PAGE_WIDTH - MARGIN * 2 - 12 },
    );
  }
  if (portfolio.proxyRatedPremium > 0) {
    doc.text(
      `  A class code for the subcontractors carrying ${formatDollars(portfolio.proxyRatedPremium)} of the premium above. That figure rests on the policy’s governing rate standing in for a class nobody has established.`,
      { width: PAGE_WIDTH - MARGIN * 2 - 12 },
    );
  }
  if (portfolio.unratedPayroll > 0) {
    doc.text(
      `  A rate for the ${formatDollars(portfolio.unratedPayroll)} of payroll shown as unrated. No premium figure is produced for it.`,
      { width: PAGE_WIDTH - MARGIN * 2 - 12 },
    );
  }
  if (portfolio.provenance.rulesProfileStatus !== 'verified') {
    doc.text(
      '  A review of the rules profile against the governing bureau manual. Until then the treatment applied is this product’s model of the jurisdiction.',
      { width: PAGE_WIDTH - MARGIN * 2 - 12 },
    );
  }
  if (
    proxied.length === 0 &&
    portfolio.proxyRatedPremium === 0 &&
    portfolio.unratedPayroll === 0 &&
    portfolio.provenance.rulesProfileStatus === 'verified'
  ) {
    doc.text('  Nothing. Every input behind this figure is a recorded fact.', {
      width: PAGE_WIDTH - MARGIN * 2 - 12,
    });
  }
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
    if (doc.y > PAGE_HEIGHT - MARGIN - 60) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(9).text(sub.subcontractorName);
    for (const flag of sub.flags) {
      doc.font('Helvetica-Bold').fontSize(8).text(`  ${FLAG_LABELS[flag.flag]}`);
      doc.font('Helvetica').fontSize(8).fillColor('#333333').text(`    ${flag.detail}`, {
        width: PAGE_WIDTH - MARGIN * 2 - 20,
      });
      doc.fillColor('#000000');
    }
    doc.moveDown(0.4);
  }

  const excluded = input.portfolio.subs.filter(
    (sub) => sub.paidTotal > 0 && sub.addedPayroll === 0 && sub.zeroReason !== null,
  );
  if (excluded.length > 0) {
    if (doc.y > PAGE_HEIGHT - MARGIN - 60) doc.addPage();
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
  const { portfolio, policy } = input;
  const profile = portfolio.rulesProfile;

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(11).text('Methodology');
  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(8.5).fillColor('#000000');
  if (profile) {
    doc.font('Helvetica-Bold').fontSize(9).text(`${profile.label}`);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(
        `${profile.rulesetId} ${profile.rulesetVersion} · ${profile.ratingBureau} · effective from ${formatUsDate(profile.effectiveFrom)} · status: ${profile.status}${profile.status === 'verified' ? ` (reviewed by ${profile.verifiedBy ?? 'a reviewer'})` : ' (not yet reviewed against the governing manual)'}`,
        { width: PAGE_WIDTH - MARGIN * 2 },
      );
    doc.fillColor('#000000').moveDown(0.4);

    doc.fontSize(8.5);
    profile.statements.forEach((statement, index) => {
      doc.text(`${index + 1}.  ${statement}`, {
        width: PAGE_WIDTH - MARGIN * 2,
        paragraphGap: 5,
      });
    });

    if (profile.sources.length > 0) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(9).text('Sources this profile is drawn from');
      doc.font('Helvetica').fontSize(8);
      for (const source of profile.sources) {
        doc.text(`  ${source.label} — ${source.reference}`, { width: PAGE_WIDTH - MARGIN * 2 - 12 });
      }
    }
  } else {
    doc.text(
      'No rules profile was in effect for this policy term, so no treatment was applied and no figure was produced.',
      { width: PAGE_WIDTH - MARGIN * 2 },
    );
  }

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(9).text('Inputs used');
  doc.font('Helvetica').fontSize(8.5).text(
    [
      `Audit period: ${formatUsDate(policy.termStart)} to ${formatUsDate(policy.termEnd)}`,
      `Jurisdiction: ${policy.jurisdiction ?? 'not set'}`,
      `Rating bureau: ${portfolio.provenance.ratingBureau ?? 'not set'}`,
      `Governing class code: ${policy.governingClassCode}`,
      `Governing rate: ${formatRate(policy.governingRate)} per $100 of payroll`,
      `Experience modification factor: ${formatMod(policy.experienceMod)}`,
      `Estimated annual premium: ${formatDollarsExact(policy.estimatedAnnualPremium)}`,
      `Ruleset: ${portfolio.provenance.rulesetId} ${portfolio.provenance.rulesetVersion}`,
    ].join('\n'),
    { paragraphGap: 2 },
  );

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(9).text('Audit noncompliance');
  doc.font('Helvetica').fontSize(8.5).text(portfolio.auditNoncompliance.statement, {
    width: PAGE_WIDTH - MARGIN * 2,
  });
  if (portfolio.auditNoncompliance.triggersPresent.length > 0) {
    for (const trigger of portfolio.auditNoncompliance.triggersPresent) {
      doc.text(`  ${trigger}`, { width: PAGE_WIDTH - MARGIN * 2 - 12 });
    }
  }

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(9).text('Coverage status');
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      'Coverage status in this workpaper reflects the certificates on file as of the generation timestamp below. It has not been confirmed with any insurer. Coverage is tested against the period the work was performed; where a payment carries no work dates, the payment date was used as a labelled proxy and the affected rows are named on the assumptions page.',
      { width: PAGE_WIDTH - MARGIN * 2 },
    );
}

function stampEveryPage(doc: PDFKit.PDFDocument, input: WorkpaperInput): void {
  const range = doc.bufferedPageRange();
  const { provenance } = input.portfolio;
  const stamp = `${input.orgName} · ${provenance.jurisdiction ?? 'no jurisdiction'} · ruleset ${provenance.rulesetId} ${provenance.rulesetVersion} · Generated ${input.generatedAt.toISOString()}`;

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
