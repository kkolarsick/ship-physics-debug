/**
 * The golden fixtures, in one place so the Vitest suite, the seed script, and the demo
 * dataset can never drift from each other.
 *
 * These are jurisdiction-aware: the policy names a jurisdiction and a rating bureau, every
 * subcontractor carries the class its work was actually rated at, and every payment
 * carries the period the work was performed. That is deliberate — this set is the
 * high-confidence case, the one where nothing is proxied, and it doubles as the regression
 * anchor for the arithmetic ($405,700 added payroll, $52,822 added premium under the NCCI
 * profile at rate 12.40 and mod 1.050).
 *
 * The degraded cases — no work dates, no class code, an unsupported jurisdiction — live in
 * the tests, where they belong.
 */
import { US_NCCI_BASIC_MANUAL } from '@/lib/rules/profiles';
import type {
  CertificateInput,
  PaymentInput,
  PolicyInput,
  SubcontractorInput,
} from './types';
import { NO_AUDIT_COMPLIANCE_ISSUES } from './types';

const dollars = (amount: number): number => Math.round(amount * 100);

/** Rate 12.40 per $100, the rate the §6d table assumes for every subcontractor. */
const GOVERNING_RATE = 124_000;
const CARPENTRY = { classCode: '5645', rate: GOVERNING_RATE };

export const GOLDEN_JURISDICTION = 'US-TN';
export const GOLDEN_PROFILE = US_NCCI_BASIC_MANUAL;

export const GOLDEN_POLICY: PolicyInput = {
  id: 'policy-golden',
  termStart: '2025-01-01',
  termEnd: '2025-12-31',
  experienceMod: 1_050, // 1.050
  estimatedAnnualPremium: dollars(180_000),
  governingClassCode: '5645',
  governingRate: GOVERNING_RATE,
  jurisdiction: GOLDEN_JURISDICTION,
  ratingBureau: 'NCCI',
  rulesetId: null,
  rulesetVersion: null,
  auditCompliance: NO_AUDIT_COMPLIANCE_ISSUES,
};

export const GOLDEN_SUBS: readonly SubcontractorInput[] = [
  sub('kowalczyk', 'Kowalczyk Framing', 'llc', 'Framing'),
  sub('delgado', 'Delgado Electric', 'corporation', 'Electrical'),
  sub('ridgeline', 'Ridgeline Roofing', 'llc', 'Roofing'),
  sub('bk-drywall', 'B&K Drywall', 'partnership', 'Drywall'),
  sub('tristate', 'Tri-State Plumbing', 'corporation', 'Plumbing'),
  sub('vega', 'Vega Concrete', 'sole_proprietor', 'Concrete/flatwork'),
];

export const GOLDEN_PAYMENTS: readonly PaymentInput[] = [
  // Kowalczyk Framing — $214,000 paid, no workers' comp certificate on file,
  // original invoice on hand splitting $74,000 of materials out of the total.
  payment('kow-1', 'kowalczyk', '2025-03-14', ['2025-02-03', '2025-03-07'], 90_000, 'INV-2201', 30_000, 'original_invoice'),
  payment('kow-2', 'kowalczyk', '2025-07-08', ['2025-05-19', '2025-06-27'], 124_000, 'INV-2288', 44_000, 'original_invoice'),

  // Delgado Electric — $96,500 paid, certificate covers the whole span of the work.
  payment('del-1', 'delgado', '2025-02-20', ['2025-01-13', '2025-02-07'], 41_500, 'INV-5510', null, 'none'),
  payment('del-2', 'delgado', '2025-09-02', ['2025-07-28', '2025-08-22'], 55_000, 'INV-5642', null, 'none'),

  // Ridgeline Roofing — $143,000 paid, the only certificate on file expired before any of
  // this work started, so none of it sits inside a covered window.
  payment('ridge-1', 'ridgeline', '2025-03-03', ['2025-02-10', '2025-02-28'], 48_000, 'INV-880', null, 'none'),
  payment('ridge-2', 'ridgeline', '2025-06-19', ['2025-05-27', '2025-06-13'], 52_000, 'INV-913', null, 'none'),
  payment('ridge-3', 'ridgeline', '2025-09-30', ['2025-09-02', '2025-09-24'], 43_000, 'INV-957', null, 'none'),

  // B&K Drywall — $58,200 paid, a certificate on file with an empty workers' comp section.
  payment('bk-1', 'bk-drywall', '2025-04-11', ['2025-03-17', '2025-04-04'], 26_400, 'INV-119', null, 'none'),
  payment('bk-2', 'bk-drywall', '2025-08-22', ['2025-07-21', '2025-08-15'], 31_800, 'INV-142', null, 'none'),

  // Tri-State Plumbing — $71,400 paid, covered.
  payment('tri-1', 'tristate', '2025-05-06', ['2025-04-07', '2025-04-30'], 33_400, 'INV-7701', null, 'none'),
  payment('tri-2', 'tristate', '2025-10-15', ['2025-09-15', '2025-10-10'], 38_000, 'INV-7788', null, 'none'),

  // Vega Concrete — $129,000 paid, no certificate, $81,000 of material claimed against the
  // profile's cap. This is the cap-binding case: $64,500 is the deduction it allows.
  payment('vega-1', 'vega', '2025-02-27', ['2025-01-27', '2025-02-21'], 60_000, 'INV-311', 40_000, 'original_invoice'),
  payment('vega-2', 'vega', '2025-06-30', ['2025-06-02', '2025-06-24'], 69_000, 'INV-364', 41_000, 'original_invoice'),
];

export const GOLDEN_CERTIFICATES: readonly CertificateInput[] = [
  certificate('cert-delgado', 'delgado', 'Delgado Electric Inc.', '2024-12-01', '2025-12-01', {
    producerName: 'Harbor Point Insurance Group',
    producerEmail: 'certs@harborpointins.example',
  }),
  certificate('cert-ridgeline', 'ridgeline', 'Ridgeline Roofing LLC', '2024-06-01', '2025-01-31', {
    producerName: 'Cutler & Sons Agency',
    producerEmail: 'service@cutlersons.example',
  }),
  certificate('cert-tristate', 'tristate', 'Tri-State Plumbing Co.', '2025-01-01', '2026-01-01', {
    producerName: 'Meridian Risk Partners',
    producerEmail: 'coi@meridianrisk.example',
  }),
];

/** Per-sub expectations from the §6d table, in cents. */
export const GOLDEN_EXPECTATIONS: readonly {
  readonly subcontractorId: string;
  readonly paid: number;
  readonly addedPayroll: number;
  readonly addedPremium: number;
}[] = [
  { subcontractorId: 'kowalczyk', paid: dollars(214_000), addedPayroll: dollars(140_000), addedPremium: 1_822_800 },
  { subcontractorId: 'delgado', paid: dollars(96_500), addedPayroll: 0, addedPremium: 0 },
  { subcontractorId: 'ridgeline', paid: dollars(143_000), addedPayroll: dollars(143_000), addedPremium: 1_861_860 },
  { subcontractorId: 'bk-drywall', paid: dollars(58_200), addedPayroll: dollars(58_200), addedPremium: 757_764 },
  { subcontractorId: 'tristate', paid: dollars(71_400), addedPayroll: 0, addedPremium: 0 },
  { subcontractorId: 'vega', paid: dollars(129_000), addedPayroll: dollars(64_500), addedPremium: 839_790 },
];

export const GOLDEN_TOTALS = {
  addedPayroll: dollars(405_700),
  /** $52,822.14 — the brief's $52,822 once rounded to whole dollars for the workpaper. */
  addedPremium: 5_282_214,
} as const;

function sub(
  id: string,
  name: string,
  entityType: SubcontractorInput['entityType'],
  trade: string,
): SubcontractorInput {
  return {
    id,
    name,
    entityType,
    trade,
    triage: 'subcontractor',
    // The §6d table rates every subcontractor at 12.40, so each carries that class
    // explicitly. Nothing in this fixture rests on a governing-rate proxy.
    classCodeOverride: CARPENTRY,
    priorAuditRate: null,
    specialCategory: null,
  };
}

function payment(
  id: string,
  subcontractorId: string,
  paidOn: string,
  work: readonly [string, string],
  amount: number,
  sourceRef: string,
  material: number | null,
  materialEvidence: PaymentInput['materialEvidence'],
): PaymentInput {
  return {
    id,
    subcontractorId,
    paidOn,
    workFrom: work[0],
    workTo: work[1],
    amount: dollars(amount),
    sourceRef,
    materialAmount: material === null ? null : dollars(material),
    materialEvidence,
  };
}

function certificate(
  id: string,
  subcontractorId: string,
  namedInsured: string,
  wcEffective: string,
  wcExpiration: string,
  producer: { producerName: string; producerEmail: string },
): CertificateInput {
  return {
    id,
    subcontractorId,
    namedInsured,
    wcPresent: true,
    wcEffective,
    wcExpiration,
    wcOfficerExclusionNoted: false,
    glPresent: true,
    producerName: producer.producerName,
    producerEmail: producer.producerEmail,
    evidence: 'reviewed_by_user',
    matchMethod: 'manual',
  };
}
