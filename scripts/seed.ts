#!/usr/bin/env tsx
/**
 * Seed the local demo store with the §6d golden fixtures so the app is demonstrable in
 * one command (brief §11).
 *
 * The six subcontractors, their payments, and their certificates are exactly the fixtures
 * the Vitest suite asserts against, so the dashboard headline is $52,822 and can be
 * checked against the brief by eye. Three extras are layered on that change no figure but
 * make the screens show what they are for: a material supplier to triage, a GL-only
 * certificate, and a certificate that matches nothing.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEMO_DATA_PATH, emptyDemoFile } from '../lib/db/demo-store';
import {
  GOLDEN_CERTIFICATES,
  GOLDEN_PAYMENTS,
  GOLDEN_POLICY,
  GOLDEN_SUBS,
} from '../lib/exposure/fixtures';
import { CONFIDENCE_LABELS } from '../lib/exposure/confidence';
import { computePortfolioExposure } from '../lib/exposure/compute';
import { normalizeName } from '../lib/matching/normalize';
import { formatDollars } from '../lib/money';
import type { CertificateRecord, PaymentRecord, SubcontractorRecord } from '../lib/db/types';

const ORG_NAME = 'Northgate Construction LLC';
const now = new Date().toISOString();

const file = emptyDemoFile(ORG_NAME);
const orgId = file.org.id;
const policyId = randomUUID();

file.org = { ...file.org, fiscalYearEnd: '2025-12-31' };

file.policies = [
  {
    ...GOLDEN_POLICY,
    id: policyId,
    orgId,
    carrierName: 'Cornerstone Casualty',
    policyNumber: 'WC-2025-441908',
    createdAt: now,
  },
];

file.classCodeRates = [
  { id: randomUUID(), policyId, classCode: '5645', rate: 124_000, label: 'Carpentry — dwellings' },
  { id: randomUUID(), policyId, classCode: '5551', rate: 315_000, label: 'Roofing' },
  { id: randomUUID(), policyId, classCode: '5183', rate: 61_000, label: 'Plumbing' },
];

// The golden fixtures use readable string ids; the app expects UUIDs, so map them once.
const idByFixture = new Map<string, string>();
for (const sub of GOLDEN_SUBS) idByFixture.set(sub.id, randomUUID());

const subs: SubcontractorRecord[] = GOLDEN_SUBS.map((sub) => ({
  id: idByFixture.get(sub.id)!,
  orgId,
  name: sub.name,
  normalizedName: normalizeName(sub.name),
  entityType: sub.entityType,
  trade: sub.trade,
  triage: 'subcontractor',
  classCodeOverride: sub.classCodeOverride,
  priorAuditRate: null,
  specialCategory: null,
  actualPayroll: null,
  notes: null,
}));

// A lumber yard is not a subcontractor. It appears in the ledger, it is triaged as a
// supplier, and it prices at zero — the decision removed it, not a classifier.
const supplierId = randomUUID();
subs.push({
  id: supplierId,
  orgId,
  name: 'Cascade Lumber Supply',
  normalizedName: normalizeName('Cascade Lumber Supply'),
  entityType: 'corporation',
  trade: 'Material supplier',
  triage: 'supplier',
  classCodeOverride: null,
  priorAuditRate: null,
  specialCategory: null,
  actualPayroll: null,
  notes: 'Material only — no labor on site.',
});

file.subcontractors = subs;

const batchId = randomUUID();
const payments: PaymentRecord[] = GOLDEN_PAYMENTS.map((payment) => ({
  id: randomUUID(),
  orgId,
  subcontractorId: idByFixture.get(payment.subcontractorId)!,
  paidOn: payment.paidOn,
  workFrom: payment.workFrom,
  workTo: payment.workTo,
  amount: payment.amount,
  sourceRef: payment.sourceRef,
  memo: null,
  materialAmount: payment.materialAmount,
  materialEvidence: payment.materialEvidence,
  importedBatchId: batchId,
}));

payments.push(
  payment(supplierId, '2025-04-02', 3_640_000, 'INV-77120', batchId, orgId),
  payment(supplierId, '2025-08-14', 2_910_000, 'INV-79004', batchId, orgId),
);

file.payments = payments;

file.batches = [
  {
    id: batchId,
    orgId,
    policyId,
    sourceFilename: 'expenses-by-vendor-detail-2025.csv',
    storagePath: null,
    preset: 'qbo_expenses_by_vendor_detail',
    columnMapping: {
      vendorName: 'Date',
      paidOn: 'Date',
      amount: 'Amount',
      sourceRef: 'Num',
      workFrom: 'Service From',
      workTo: 'Service To',
    },
    rowCount: payments.length + 12,
    importedCount: payments.length,
    excluded: {
      outside_term: 3,
      non_positive_amount: 2,
      subtotal_row: 7,
      group_heading: 0,
      unreadable_amount: 0,
      unreadable_date: 0,
      missing_vendor: 0,
    },
    createdAt: now,
    rolledBackAt: null,
  },
];

const certificates: CertificateRecord[] = GOLDEN_CERTIFICATES.map((cert) => ({
  id: randomUUID(),
  orgId,
  subcontractorId: idByFixture.get(cert.subcontractorId!)!,
  status: 'matched',
  filePath: '',
  originalFilename: `${cert.namedInsured}.pdf`,
  namedInsured: cert.namedInsured,
  normalizedNamedInsured: normalizeName(cert.namedInsured ?? ''),
  producerName: cert.producerName,
  producerEmail: cert.producerEmail,
  producerPhone: null,
  wcPresent: cert.wcPresent,
  wcCarrier: 'Keystone Mutual',
  wcPolicyNumber: `WC-${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
  wcEffective: cert.wcEffective,
  wcExpiration: cert.wcExpiration,
  wcOfficerExclusionNoted: cert.wcOfficerExclusionNoted,
  glPresent: cert.glPresent,
  certificateHolder: ORG_NAME,
  descriptionOfOperations: null,
  extractionConfidenceThousandths: 940,
  extractionError: null,
  rawExtraction: null,
  reviewedByUserAt: now,
  evidence: 'reviewed_by_user',
  matchMethod: 'manual',
  createdAt: now,
}));

// The most common false sense of security in the whole dataset: a certificate is on file,
// and its workers' comp section is empty.
certificates.push({
  id: randomUUID(),
  orgId,
  subcontractorId: idByFixture.get('bk-drywall')!,
  status: 'matched',
  filePath: '',
  originalFilename: 'B&K Drywall - COI.pdf',
  namedInsured: 'B & K Drywall Partners',
  normalizedNamedInsured: normalizeName('B & K Drywall Partners'),
  producerName: 'Lakeside Insurance Services',
  producerEmail: 'coi@lakesideins.example',
  producerPhone: '(555) 010-4417',
  wcPresent: false,
  wcCarrier: null,
  wcPolicyNumber: null,
  wcEffective: null,
  wcExpiration: null,
  wcOfficerExclusionNoted: false,
  glPresent: true,
  certificateHolder: ORG_NAME,
  descriptionOfOperations: 'Interior drywall and finishing.',
  extractionConfidenceThousandths: 910,
  extractionError: null,
  rawExtraction: null,
  reviewedByUserAt: now,
  evidence: 'reviewed_by_user',
  matchMethod: 'manual',
  createdAt: now,
});

// A certificate that matches nothing. Usually it means the sub was paid under a different
// name, or the certificate is for a party who never got paid. Both are worth surfacing.
certificates.push({
  id: randomUUID(),
  orgId,
  subcontractorId: null,
  status: 'needs_review',
  filePath: '',
  originalFilename: 'scan-0043.pdf',
  namedInsured: 'Harrow Mechanical Contractors LLC',
  normalizedNamedInsured: normalizeName('Harrow Mechanical Contractors LLC'),
  producerName: 'Bellweather Agency',
  producerEmail: 'certs@bellweather.example',
  producerPhone: null,
  wcPresent: true,
  wcCarrier: 'Granite State Indemnity',
  wcPolicyNumber: 'WC-8830114',
  wcEffective: '2025-02-01',
  wcExpiration: '2026-02-01',
  wcOfficerExclusionNoted: true,
  glPresent: true,
  certificateHolder: ORG_NAME,
  descriptionOfOperations:
    'Officers of the named insured are excluded from workers’ compensation coverage.',
  extractionConfidenceThousandths: 780,
  extractionError: null,
  rawExtraction: null,
  reviewedByUserAt: null,
  evidence: 'model_extracted',
  matchMethod: 'unmatched',
  createdAt: now,
});

file.certificates = certificates;

file.auditEvents = [
  {
    id: randomUUID(),
    orgId,
    actor: 'seed',
    entityType: 'import_batch',
    entityId: batchId,
    action: 'import',
    before: null,
    after: { importedCount: payments.length, sourceFilename: 'expenses-by-vendor-detail-2025.csv' },
    at: now,
  },
];

mkdirSync(dirname(DEMO_DATA_PATH), { recursive: true });
writeFileSync(DEMO_DATA_PATH, `${JSON.stringify(file, null, 2)}\n`);

const portfolio = computePortfolioExposure({
  subs: file.subcontractors,
  payments: file.payments,
  certificates: file.certificates,
  policy: file.policies[0]!,
});

console.log(`Seeded ${DEMO_DATA_PATH}`);
console.log(`  ${file.subcontractors.length} vendors, ${file.payments.length} payments, ${file.certificates.length} certificates`);
console.log(`  Jurisdiction   ${GOLDEN_POLICY.jurisdiction} · ${portfolio.provenance.ratingBureau}`);
console.log(`  Ruleset        ${portfolio.provenance.rulesetId} ${portfolio.provenance.rulesetVersion} (${portfolio.provenance.rulesProfileStatus})`);
console.log(`  Added payroll  ${formatDollars(portfolio.addedPayroll)}`);
console.log(`  Added premium  ${formatDollars(portfolio.totalExposure)}`);
console.log(`  Confidence     ${CONFIDENCE_LABELS[portfolio.confidence.level]}`);
for (const assumption of portfolio.confidence.assumptions) {
  console.log(`    assumption: ${assumption}`);
}

/**
 * The supplier rows deliberately carry no work period: a lumber yard's invoices rarely do,
 * and it is worth seeing what the payment-date proxy looks like on a screen. It costs
 * nothing here — the vendor is triaged as a supplier, so it prices at zero either way.
 */
function payment(
  subcontractorId: string,
  paidOn: string,
  amount: number,
  sourceRef: string,
  importedBatchId: string,
  org: string,
): PaymentRecord {
  return {
    id: randomUUID(),
    orgId: org,
    subcontractorId,
    paidOn,
    workFrom: null,
    workTo: null,
    amount,
    sourceRef,
    memo: null,
    materialAmount: null,
    materialEvidence: 'none',
    importedBatchId,
  };
}
