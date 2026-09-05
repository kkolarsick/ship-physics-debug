import type { RulesProfile } from '../types';

/**
 * NCCI states — basic manual treatment.
 *
 * STATUS: draft. The rules below are the treatment this product models for NCCI
 * jurisdictions. They have not been checked line by line against the current Basic Manual
 * by a person, so `status` is `draft` and every estimate produced under this profile
 * carries an unverified-rules flag through the UI and both exports. Verifying it is a
 * data change — set `status`, `verifiedBy`, and `verifiedAt` — not a code change.
 */
export const US_NCCI_BASIC_MANUAL: RulesProfile = {
  rulesetId: 'us-ncci-basic-manual',
  rulesetVersion: '2026.1.0',
  label: 'NCCI states — basic manual treatment',
  ratingBureau: 'NCCI',
  jurisdictions: [
    'US-AK', 'US-AL', 'US-AR', 'US-AZ', 'US-CO', 'US-CT', 'US-DC', 'US-GA',
    'US-IA', 'US-ID', 'US-IL', 'US-KS', 'US-KY', 'US-LA', 'US-MD', 'US-ME', 'US-MO',
    'US-MS', 'US-MT', 'US-NE', 'US-NH', 'US-NM', 'US-NV', 'US-OK', 'US-OR', 'US-RI',
    'US-SC', 'US-SD', 'US-TN', 'US-UT', 'US-VA', 'US-VT', 'US-WV',
  ],
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  status: 'draft',
  verifiedBy: null,
  verifiedAt: null,
  sourceAuthority: 'ncci_manual',
  sources: [
    {
      authority: 'ncci_manual',
      label: 'NCCI Basic Manual for Workers Compensation and Employers Liability Insurance',
      reference: 'Rule 2 — Premium Basis and Payroll Allocation; uninsured subcontractors',
      url: 'https://www.ncci.com/',
      retrievedAt: null,
    },
    {
      authority: 'ncci_manual',
      label: 'NCCI Basic Manual',
      reference: 'Rule 3 — Classifications',
      url: 'https://www.ncci.com/',
      retrievedAt: null,
    },
  ],

  uninsuredSubcontractor: {
    treatment: 'full_cost_included',
    deemedLaborShare: null,
    citations: [],
    notes:
      'Amounts paid to a subcontractor who cannot evidence workers’ compensation for the period of the work are treated as subject to inclusion in the hiring contractor’s auditable payroll in full, before any labor/material separation.',
  },

  payrollBasis: {
    // The subcontractor's own payroll for the work displaces the contract price where the
    // hiring contractor can produce records for it; the contract price is the fallback.
    actualPayrollPreferred: true,
    acceptedPayrollEvidence: ['subcontractor_payroll_records', 'certified_payroll'],
    subcontractPriceFallback: 'full_price',
    deemedLaborShare: null,
    citations: [],
    notes:
      'Where the subcontractor’s own payroll records for the work are on file, they are used in place of the amount paid. Otherwise the amount paid stands in.',
  },

  laborMaterial: {
    separationPermitted: true,
    acceptedEvidence: ['original_invoice'],
    cap: { kind: 'share_of_uncovered', share: { numerator: 1, denominator: 2 } },
    citations: [],
    notes:
      'Where the contractor holds the subcontractor’s original invoice separating labor from materials, the material portion may be deducted, capped at half of the uncovered amount for that subcontractor. A contract schedule is recorded but does not support a deduction.',
  },

  classification: {
    basis: 'subcontractor_trade_class',
    governingRateProxyPermitted: true,
    citations: [],
    notes:
      'Added payroll is rated at the class code applicable to the work the subcontractor performed. Where that class is not known, the policy’s governing rate may stand in, and the result is marked as proxy-rated.',
  },

  experienceMod: {
    appliesToAddedPayroll: true,
    citations: [],
    notes: 'The experience modification factor applies to premium on this added payroll.',
  },

  specialCategories: [
    {
      category: 'sole_proprietor_no_employees',
      treatment: 'requires_review',
      deemedLaborShare: null,
      citations: [],
      notes:
        'A sole proprietor with no employees is often not required to carry coverage on themselves. Treatment at audit varies by state and carrier, so this product does not price it either way.',
    },
    {
      category: 'equipment_with_operator',
      treatment: 'deemed_labor_share_included',
      deemedLaborShare: { numerator: 1, denominator: 3 },
      citations: [],
      notes:
        'Where equipment is hired with an operator and the operator is not covered, a share of the contract is commonly deemed to be payroll for the operator. One third is the share this profile models.',
    },
    {
      category: 'owner_operator_vehicle',
      treatment: 'requires_review',
      deemedLaborShare: null,
      citations: [],
      notes:
        'Owner-operator trucking arrangements turn on state-specific tests this product does not model.',
    },
    {
      category: 'labor_only_no_materials',
      treatment: 'full_cost_included',
      deemedLaborShare: null,
      citations: [],
      notes:
        'Where the subcontract is labor only, there is no material portion to separate and the full uncovered amount stands.',
    },
    {
      category: 'licensed_professional',
      treatment: 'requires_review',
      deemedLaborShare: null,
      citations: [],
      notes: 'Licensed professional services are outside what this profile models.',
    },
  ],

  coveragePeriod: {
    paymentDateProxyPermitted: true,
    partialOverlap: 'treat_as_uncovered',
    citations: [],
    notes:
      'Coverage is tested against the period the work was performed. Where work dates are not on file, the payment date stands in as a proxy and the result is marked accordingly. A work period that is only partly inside a covered window is treated as uncovered in full under this profile.',
  },

  auditNoncompliance: {
    supported: true,
    triggers: ['endorsement_on_policy', 'records_not_furnished', 'audit_not_permitted'],
    charge: { kind: 'carrier_configured_percentage' },
    citations: [],
    notes:
      'An audit noncompliance charge applies only where the policy carries the endorsement and the insured did not furnish records or permit the audit. It is not a consequence of a subcontractor lacking coverage. The percentage comes off the insured’s own policy.',
  },

  unsupportedConditions: ['special_category_unsettled'],

  exceptions: [
    {
      id: 'state_exceptions',
      summary:
        'Individual NCCI states publish exception pages that override the Basic Manual. This profile models the manual’s general treatment and does not carry per-state exceptions; a state with material exceptions gets its own profile.',
      citations: [],
    },
    {
      id: 'payroll_limitation',
      summary:
        'States that limit or cap payroll for construction classifications are not modelled here.',
      citations: [],
    },
  ],

  openQuestions: [
    'Confirm Rule 2’s treatment of uninsured subcontract cost line by line against the current Basic Manual.',
    'Confirm the labor/material cap and the evidence that supports a deduction.',
    'Confirm the deemed share for equipment hired with an operator.',
    'Identify which of the listed states carry exceptions material enough to need their own profile.',
  ],

  largeUntriagedVendorThreshold: 1_000_000,

  statements: [
    'Amounts paid to a subcontractor who cannot evidence their own workers’ compensation coverage for the period of the work are generally included in the hiring contractor’s auditable payroll at audit.',
    'Where the contractor holds the subcontractor’s original invoice separating labor from materials, the material portion may be deducted — capped at 50% of the uncovered amount for that subcontractor. With no original invoice, the full amount is subject to inclusion.',
    'Included amounts are rated at the class code applicable to the subcontractor’s work and multiplied by the experience modification factor. Where that class is not known, the governing rate is used as a proxy and the figure is marked as such.',
    'Where equipment was hired with an operator who was not covered, one third of the contract is modeled as payroll for the operator.',
    'An audit noncompliance charge is modeled only where the policy carries the endorsement and records were not furnished or the audit was not permitted. It does not follow from a subcontractor lacking coverage.',
    'Each of the above is a modeled assumption drawn from this rules profile, not a universal rule. Treatment varies by state, rating bureau, and carrier.',
  ],
};
