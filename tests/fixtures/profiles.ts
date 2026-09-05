/**
 * Two rules profiles that disagree on every axis that moves a dollar.
 *
 * The point of these is to prove the rules layer is real rather than cosmetic: the same
 * subcontract cost, the same certificates, the same payments, run under each of them,
 * must come out at different payroll and different premium for different reasons.
 *
 * They are test fixtures, not jurisdictions. The shipped profiles live in lib/rules/profiles.
 */
import type { RulesProfile } from '@/lib/rules/types';

/**
 * "Invoice split" — the full uncovered cost is payroll, and an original invoice buys back
 * up to half of it. Rates at the subcontractor's own trade class, and falls back to the
 * governing rate when that is unknown. Accepts the payment date as a proxy for the work
 * period, and treats a straddling period as uncovered in full.
 */
export const PROFILE_INVOICE_SPLIT: RulesProfile = {
  rulesetId: 'test-invoice-split',
  rulesetVersion: '1.0.0',
  label: 'Test — full cost with an invoice split',
  ratingBureau: 'TEST-A',
  jurisdictions: ['US-XA'],
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  status: 'verified',
  verifiedBy: 'test suite',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  sourceAuthority: 'rating_bureau_manual',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'Test fixture',
      reference: 'tests/fixtures/profiles.ts',
      url: null,
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  ],

  uninsuredSubcontractor: {
    treatment: 'full_cost_included',
    deemedLaborShare: null,
    citations: [],
    notes: 'The full uncovered amount is payroll before any split.',
  },
  payrollBasis: {
    actualPayrollPreferred: true,
    acceptedPayrollEvidence: ['subcontractor_payroll_records'],
    subcontractPriceFallback: 'full_price',
    deemedLaborShare: null,
    citations: [],
    notes: 'The subcontractor’s own payroll displaces the contract price where it is on file.',
  },
  laborMaterial: {
    separationPermitted: true,
    acceptedEvidence: ['original_invoice'],
    cap: { kind: 'share_of_uncovered', share: { numerator: 1, denominator: 2 } },
    citations: [],
    notes: 'Original invoice only, capped at half of the uncovered amount.',
  },
  classification: {
    basis: 'subcontractor_trade_class',
    governingRateProxyPermitted: true,
    citations: [],
    notes: 'Rated at the subcontractor’s trade class; the governing rate may stand in.',
  },
  experienceMod: {
    appliesToAddedPayroll: true,
    citations: [],
    notes: 'The mod applies to premium on added payroll.',
  },
  specialCategories: [
    {
      category: 'equipment_with_operator',
      treatment: 'deemed_labor_share_included',
      deemedLaborShare: { numerator: 1, denominator: 3 },
      citations: [],
      notes: 'One third of the contract is deemed payroll for the operator.',
    },
    {
      category: 'owner_operator_vehicle',
      treatment: 'requires_review',
      deemedLaborShare: null,
      citations: [],
      notes: 'Not settled by this profile.',
    },
    {
      category: 'licensed_professional',
      treatment: 'excluded_from_payroll',
      deemedLaborShare: null,
      citations: [],
      notes: 'Licensed professional services are excluded from payroll under this profile.',
    },
  ],
  coveragePeriod: {
    paymentDateProxyPermitted: true,
    partialOverlap: 'treat_as_uncovered',
    citations: [],
    notes: 'The payment date may stand in; a straddling period is uncovered in full.',
  },
  auditNoncompliance: {
    supported: true,
    triggers: ['endorsement_on_policy', 'records_not_furnished', 'audit_not_permitted'],
    charge: { kind: 'carrier_configured_percentage' },
    citations: [],
    notes: 'Percentage from the insured’s own policy.',
  },
  unsupportedConditions: [],
  exceptions: [],
  openQuestions: [],
  largeUntriagedVendorThreshold: 1_000_000,
  statements: ['Full uncovered cost is payroll; an original invoice buys back up to half.'],
};

/**
 * "Deemed labor share" — disagrees with the first profile on every axis. A fixed share of
 * the uncovered cost is deemed payroll and no labor/material split is permitted at all;
 * payroll is rated at the hiring contractor's governing class by rule rather than by
 * proxy; the payment date is not accepted as a stand-in for the work period; a straddling
 * period is split across covered and uncovered days; and the noncompliance charge is a
 * multiple of premium rather than a percentage off the policy.
 */
export const PROFILE_DEEMED_SHARE: RulesProfile = {
  rulesetId: 'test-deemed-share',
  rulesetVersion: '1.0.0',
  label: 'Test — deemed labor share, no split permitted',
  ratingBureau: 'TEST-B',
  jurisdictions: ['US-XB'],
  effectiveFrom: '2025-01-01',
  effectiveTo: null,
  status: 'verified',
  verifiedBy: 'test suite',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  sourceAuthority: 'rating_bureau_manual',
  sources: [
    {
      authority: 'rating_bureau_manual',
      label: 'Test fixture',
      reference: 'tests/fixtures/profiles.ts',
      url: null,
      retrievedAt: '2026-01-01T00:00:00.000Z',
    },
  ],

  uninsuredSubcontractor: {
    treatment: 'labor_share_included',
    deemedLaborShare: { numerator: 3, denominator: 5 },
    citations: [],
    notes: 'Three fifths of the uncovered cost is deemed payroll, whatever the documents show.',
  },
  payrollBasis: {
    actualPayrollPreferred: false,
    acceptedPayrollEvidence: [],
    subcontractPriceFallback: 'deemed_labor_share',
    deemedLaborShare: { numerator: 3, denominator: 5 },
    citations: [],
    notes: 'The deemed share is applied to the contract price; payroll records do not displace it.',
  },
  laborMaterial: {
    separationPermitted: false,
    acceptedEvidence: [],
    cap: { kind: 'none' },
    citations: [],
    notes: 'No labor/material separation; the deemed share already accounts for materials.',
  },
  classification: {
    basis: 'governing_class',
    governingRateProxyPermitted: false,
    citations: [],
    notes: 'Uninsured subcontract payroll is rated at the governing class by rule.',
  },
  experienceMod: {
    appliesToAddedPayroll: true,
    citations: [],
    notes: 'The mod applies to premium on added payroll.',
  },
  specialCategories: [
    {
      category: 'equipment_with_operator',
      treatment: 'full_cost_included',
      deemedLaborShare: null,
      citations: [],
      notes: 'No relief for equipment with an operator under this profile.',
    },
  ],
  coveragePeriod: {
    paymentDateProxyPermitted: false,
    partialOverlap: 'prorate_by_covered_days',
    citations: [],
    notes: 'Work dates are required; a straddling period is split by covered days.',
  },
  auditNoncompliance: {
    supported: true,
    triggers: ['endorsement_on_policy', 'audit_not_permitted'],
    charge: { kind: 'multiple_of_estimated_premium', multiple: { numerator: 2, denominator: 1 } },
    citations: [],
    notes: 'Two times the estimated annual premium, so one further premium is added.',
  },
  unsupportedConditions: ['classification_unknown'],
  exceptions: [],
  openQuestions: [],
  largeUntriagedVendorThreshold: 500_000,
  statements: ['Three fifths of uncovered subcontract cost is deemed payroll.'],
};

/** A profile that recognises a jurisdiction without modelling it. */
export const PROFILE_DECLARED_ONLY: RulesProfile = {
  ...PROFILE_INVOICE_SPLIT,
  rulesetId: 'test-declared-only',
  rulesetVersion: '1.0.0',
  label: 'Test — declared but not populated',
  jurisdictions: ['US-XC'],
  ratingBureau: 'TEST-C',
  status: 'draft',
  verifiedBy: null,
  verifiedAt: null,
  uninsuredSubcontractor: {
    treatment: 'not_modeled',
    deemedLaborShare: null,
    citations: [],
    notes: 'Not transcribed.',
  },
};

export const TEST_CATALOGUE: readonly RulesProfile[] = [
  PROFILE_INVOICE_SPLIT,
  PROFILE_DEEMED_SHARE,
  PROFILE_DECLARED_ONLY,
];
