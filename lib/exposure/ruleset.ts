/**
 * The modeled ruleset (brief §6a).
 *
 * Every rule here is a modeled assumption about how an auditor is likely to treat a
 * figure, not a universal rule — treatment varies by state, bureau, and carrier. The
 * version stamp is written onto every saved calculation and every export so a figure
 * produced in March can be explained in November.
 */

export const RULESET = {
  version: '2026.1.0',

  /**
   * Where the contractor holds the subcontractor's original invoice separating labor
   * from materials, the material portion may be deducted — capped at this share of the
   * total paid to that subcontractor.
   */
  MATERIAL_CAP_NUMERATOR: 1,
  MATERIAL_CAP_DENOMINATOR: 2,

  /**
   * Only an original invoice from the subcontractor supports a material deduction.
   * A contract schedule is recorded but does not reduce the figure.
   */
  MATERIAL_EVIDENCE_ACCEPTED: ['original_invoice'] as const,

  /** A vendor paid more than this with no triage decision and no certificate is flagged. */
  LARGE_UNMATCHED_VENDOR_CENTS: 1_000_000,
} as const;

export type RulesetVersion = typeof RULESET.version;

/** Human-readable statements of the modeled rules, for the workpaper's methodology page. */
export const RULESET_STATEMENTS: readonly string[] = [
  'Amounts paid to a subcontractor who cannot evidence their own workers’ compensation coverage for the period of the work are generally included in the hiring contractor’s auditable payroll at audit.',
  'Where the contractor holds the subcontractor’s original invoice separating labor from materials, the material portion may be deducted — capped at 50% of the total paid to that subcontractor. With no split invoice, the full amount is subject to inclusion.',
  'Included amounts are rated at the applicable class code rate per $100 of payroll and multiplied by the experience modification factor.',
  'Some carriers apply a non-compliance surcharge, taken as a percentage of premium, where records are inadequate. It is modeled here as a policy-level percentage you entered from your own policy, defaulting to zero.',
  'Each of the above is a modeled assumption, not a universal rule. Treatment varies by state, rating bureau, and carrier.',
];
