/**
 * The scenario matrix every supported state must answer.
 *
 * One set of inputs, run against any rules profile. A jurisdiction is not "supported"
 * because a file exists for it — it is supported when it produces a defensible outcome for
 * each of these, and the outcomes are recorded as that state's golden table.
 *
 * Populating a state is therefore: source the rules, fill in the profile, run this matrix,
 * and commit the resulting table. Nothing in the core engine changes.
 */
import { computePortfolioExposure } from '@/lib/exposure/compute';
import type { PortfolioExposure } from '@/lib/exposure/types';
import type { RulesProfile } from '@/lib/rules/types';
import { auditCompliance, cert, dollars, payment, policy, sub } from '../fixtures/scenario';

export interface StateScenario {
  readonly id: string;
  /** What an auditor would call this situation. */
  readonly description: string;
  readonly build: (jurisdiction: string) => Parameters<typeof computePortfolioExposure>[0];
}

const TERM = { termStart: '2025-01-01', termEnd: '2025-12-31' } as const;
const WORK = { workFrom: '2025-03-01', workTo: '2025-03-31', paidOn: '2025-04-15' } as const;

/** $120,000 of subcontract cost, so every share is a round number. */
const AMOUNT = dollars(120_000);

function scenario(
  id: string,
  description: string,
  build: (jurisdiction: string) => Parameters<typeof computePortfolioExposure>[0],
): StateScenario {
  return { id, description, build };
}

export const STATE_SCENARIOS: readonly StateScenario[] = [
  scenario(
    'uninsured_no_payroll_records',
    'Uninsured subcontractor, no payroll records, contract price only',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'actual_payroll_available',
    'Uninsured subcontractor, own payroll records on file',
    (jurisdiction) => ({
      subs: [
        sub({
          actualPayroll: { amount: dollars(45_000), evidence: 'subcontractor_payroll_records' },
        }),
      ],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'labor_and_material_contract',
    'Labor-and-material contract with an original invoice separating $72,000 of materials',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [
        payment({
          ...WORK,
          amount: AMOUNT,
          materialAmount: dollars(72_000),
          materialEvidence: 'original_invoice',
        }),
      ],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'labor_only_contract',
    'Labor-only subcontract, no materials supplied',
    (jurisdiction) => ({
      subs: [sub({ specialCategory: 'labor_only_no_materials' })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'equipment_with_operator',
    'Equipment hired with an operator who is not covered',
    (jurisdiction) => ({
      subs: [sub({ specialCategory: 'equipment_with_operator' })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'piecework',
    'Piecework arrangement',
    (jurisdiction) => ({
      subs: [sub({ specialCategory: 'piecework' })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'sole_proprietor_no_employees',
    'Sole proprietor with no employees',
    (jurisdiction) => ({
      subs: [sub({ entityType: 'sole_proprietor', specialCategory: 'sole_proprietor_no_employees' })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'partial_certificate_coverage',
    'Certificate covers part of the term; some work falls outside it',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [
        payment({ workFrom: '2025-02-01', workTo: '2025-02-28', paidOn: '2025-03-15', amount: dollars(60_000) }),
        payment({ workFrom: '2025-08-01', workTo: '2025-08-31', paidOn: '2025-09-15', amount: dollars(60_000) }),
      ],
      certificates: [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'coverage_lapses_mid_work_period',
    'Coverage lapses partway through a single work period',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [
        payment({ workFrom: '2025-06-01', workTo: '2025-07-31', paidOn: '2025-08-10', amount: dollars(61_000) }),
      ],
      certificates: [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'work_period_unknown_payment_date_proxy',
    'No work dates on file; only the payment date is known',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [payment({ paidOn: '2025-08-15', amount: AMOUNT })],
      certificates: [cert({ wcEffective: '2025-01-01', wcExpiration: '2025-06-30' })],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'known_class_and_rate',
    'The subcontractor’s own class and rate are recorded',
    (jurisdiction) => ({
      subs: [sub({ classCodeOverride: { classCode: '5551', rate: 315_000 } })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'governing_rate_proxy',
    'No class recorded for the subcontractor’s trade',
    (jurisdiction) => ({
      subs: [sub({ classCodeOverride: null })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction }),
    }),
  ),

  scenario(
    'unsupported_classification',
    'No class recorded and no governing rate on the policy either',
    (jurisdiction) => ({
      subs: [sub({ classCodeOverride: null })],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({ ...TERM, jurisdiction, governingRate: 0, governingClassCode: '' }),
    }),
  ),

  scenario(
    'audit_noncompliance',
    'Records were not furnished and the policy carries the endorsement',
    (jurisdiction) => ({
      subs: [sub()],
      payments: [payment({ ...WORK, amount: AMOUNT })],
      certificates: [],
      policy: policy({
        ...TERM,
        jurisdiction,
        auditCompliance: auditCompliance({
          endorsementOnPolicy: true,
          recordsFurnished: false,
          carrierConfiguredPct: 100_000, // 10%
        }),
      }),
    }),
  ),
];

export interface ScenarioOutcome {
  readonly id: string;
  readonly status: PortfolioExposure['status'];
  readonly reason: string | null;
  readonly addedPayroll: number;
  readonly addedPremium: number | null;
  readonly payrollBasis: string;
  readonly rateProvenance: string;
  readonly noncomplianceCharge: number;
  readonly confidence: string;
}

/** Run one scenario against one profile and reduce it to a comparable row. */
export function runScenario(
  profile: RulesProfile,
  entry: StateScenario,
  jurisdiction: string,
): ScenarioOutcome {
  const portfolio = computePortfolioExposure({
    ...entry.build(jurisdiction),
    computedAt: '2026-01-01T00:00:00.000Z',
    catalogue: [profile],
  });
  const first = portfolio.subs[0];

  // A profile can resolve and still decline to price a particular subcontractor. Both are
  // refusals as far as this matrix is concerned.
  const status =
    portfolio.status === 'estimated' && first?.status === 'unavailable'
      ? ('unavailable' as const)
      : portfolio.status;

  return {
    id: entry.id,
    status,
    reason: portfolio.unavailable?.reason ?? first?.unavailable?.reason ?? null,
    addedPayroll: portfolio.addedPayroll,
    addedPremium: status === 'estimated' ? portfolio.addedPremiumBeforeSurcharge : null,
    payrollBasis: first?.payrollBasis ?? 'none',
    rateProvenance: first?.rate.provenance ?? 'unknown',
    noncomplianceCharge: portfolio.auditNoncompliance.charge,
    confidence: portfolio.confidence.level,
  };
}

export function runMatrix(profile: RulesProfile, jurisdiction: string): ScenarioOutcome[] {
  return STATE_SCENARIOS.map((entry) => runScenario(profile, entry, jurisdiction));
}
