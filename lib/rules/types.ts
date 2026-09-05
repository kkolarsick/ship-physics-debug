/**
 * Jurisdiction rules profiles.
 *
 * Audit treatment of uninsured subcontract cost is not universal. It is set by the rating
 * bureau and the state that govern a given policy, and the differences are material: one
 * jurisdiction may allow a material deduction only against an original invoice, another
 * may deem a fixed share of the contract to be payroll when records are incomplete, and a
 * third may not permit separation at all.
 *
 * A profile is data, not code. The engine reads treatment from the profile it was handed
 * and never from a global constant, so adding a jurisdiction is a data change and every
 * saved figure can name the exact ruleset that produced it.
 *
 * Nothing here is legal advice or a statement of what any bureau's manual says. Every
 * shipped profile carries its own `status` and `sources`, and a profile that has not been
 * checked against the governing manual stays `draft` and marks every estimate it produces.
 */
import type { Cents, PctTenThousandths, RateTenThousandths } from '@/lib/money';

/** An exact fraction, so shares stay integer arithmetic end to end. */
export interface Fraction {
  readonly numerator: number;
  readonly denominator: number;
}

/** ISO 3166-2 style, e.g. "US-CA". Kept as a string so new jurisdictions are data. */
export type Jurisdiction = string;

/** The bureau whose manual governs the rules, e.g. "NCCI", "WCIRB", "NYCIRB". */
export type RatingBureau = string;

export type MaterialEvidence = 'none' | 'original_invoice' | 'contract_schedule';

/**
 * `verified` means a person checked this profile against the governing manual and
 * recorded who and when. Until then it is a `draft`: it still produces estimates, but
 * every figure it touches carries an unverified-rules flag through the UI and the export.
 */
export type ProfileStatus = 'draft' | 'verified' | 'retired';

// ---------------------------------------------------------------------------
// Uninsured subcontract cost
// ---------------------------------------------------------------------------

export type UninsuredCostTreatment =
  /** The whole uncovered contract cost is subject to inclusion in auditable payroll. */
  | 'full_cost_included'
  /** Only a labor share is included; the profile supplies the share. */
  | 'labor_share_included'
  /** Not modeled here — the engine declines to produce a figure. */
  | 'not_modeled';

export interface UninsuredSubcontractorRule {
  readonly treatment: UninsuredCostTreatment;
  /**
   * Used when `treatment` is `labor_share_included`, and as the presumptive labor share
   * where a profile deems a fixed portion of the contract to be payroll because the
   * contractor cannot produce a labor/material split.
   */
  readonly deemedLaborShare: Fraction | null;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Labor / material separation
// ---------------------------------------------------------------------------

export type MaterialCap =
  | { readonly kind: 'none' }
  /** Capped at a share of the uncovered amount for that subcontractor. */
  | { readonly kind: 'share_of_uncovered'; readonly share: Fraction }
  /** Capped at a share of everything paid to that subcontractor in the term. */
  | { readonly kind: 'share_of_total_paid'; readonly share: Fraction };

export interface LaborMaterialRule {
  /** When false, no evidence removes anything — the full uncovered cost stands. */
  readonly separationPermitted: boolean;
  /** Which documents support a deduction. Anything else is recorded but not deducted. */
  readonly acceptedEvidence: readonly MaterialEvidence[];
  readonly cap: MaterialCap;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Classification and rating
// ---------------------------------------------------------------------------

export type ClassificationBasis =
  /** Rate the added payroll at the class for the work the subcontractor actually did. */
  | 'subcontractor_trade_class'
  /** Rate it at the hiring contractor's governing class. */
  | 'governing_class';

export interface ClassificationRule {
  readonly basis: ClassificationBasis;
  /**
   * Whether the engine may fall back to the policy's governing rate when the
   * subcontractor's own class is unknown. When false, an unknown class yields payroll
   * with no premium rather than a proxy-rated dollar figure.
   */
  readonly governingRateProxyPermitted: boolean;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Special subcontractor categories
// ---------------------------------------------------------------------------

export type SpecialCategory =
  | 'sole_proprietor_no_employees'
  | 'owner_operator_vehicle'
  | 'equipment_with_operator'
  | 'licensed_professional'
  | 'labor_only_no_materials';

export type SpecialCategoryTreatment =
  | 'excluded_from_payroll'
  | 'full_cost_included'
  | 'deemed_labor_share_included'
  /** The profile does not settle it; the engine declines to price and asks for review. */
  | 'requires_review';

export interface SpecialCategoryRule {
  readonly category: SpecialCategory;
  readonly treatment: SpecialCategoryTreatment;
  /** Used when the treatment is `deemed_labor_share_included`. */
  readonly deemedLaborShare: Fraction | null;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Coverage period
// ---------------------------------------------------------------------------

export type PartialOverlapTreatment =
  /** A work period only partly inside a covered window counts as uncovered in full. */
  | 'treat_as_uncovered'
  /** Split the amount across covered and uncovered days of the work period. */
  | 'prorate_by_covered_days';

export interface CoveragePeriodRule {
  /**
   * Whether a payment date may stand in for the work period when work dates are missing.
   * When false, a payment with no work dates cannot be priced and is reported as
   * unavailable rather than estimated from the check date.
   */
  readonly paymentDateProxyPermitted: boolean;
  readonly partialOverlap: PartialOverlapTreatment;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Audit noncompliance
// ---------------------------------------------------------------------------

/**
 * The conditions that can trigger an audit noncompliance charge. None of these is
 * "a subcontractor had no certificate" — that is uninsured-subcontract exposure, a
 * different concept with a different mechanism.
 */
export type NoncomplianceTrigger =
  /** The policy carries an audit noncompliance endorsement or equivalent rule. */
  | 'endorsement_on_policy'
  /** Records the auditor requested were not furnished. */
  | 'records_not_furnished'
  /** The insured did not cooperate with the audit (no access, no response). */
  | 'audit_not_permitted'
  /** An estimated audit was already issued for the term. */
  | 'estimated_audit_issued';

export type NoncomplianceCharge =
  | { readonly kind: 'not_modeled' }
  /** A multiple of the estimated annual premium, e.g. two or three times. */
  | { readonly kind: 'multiple_of_estimated_premium'; readonly multiple: Fraction }
  /** A fixed percentage of premium set by the profile. */
  | { readonly kind: 'percentage_of_premium'; readonly pct: PctTenThousandths }
  /** The percentage comes off the insured's own policy; the user enters it. */
  | { readonly kind: 'carrier_configured_percentage' };

export interface AuditNoncomplianceRule {
  /** When false, the profile does not model a charge and the engine reports none. */
  readonly supported: boolean;
  /** Which of the triggers this jurisdiction recognises. */
  readonly triggers: readonly NoncomplianceTrigger[];
  readonly charge: NoncomplianceCharge;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

export interface RulesProfileSource {
  readonly label: string;
  readonly reference: string;
}

export interface RulesProfile {
  /** Stable across versions, e.g. "us-ncci-basic-manual". */
  readonly rulesetId: string;
  /** Bumped whenever any rule below changes. Stamped onto every figure. */
  readonly rulesetVersion: string;
  readonly label: string;
  readonly jurisdictions: readonly Jurisdiction[];
  readonly ratingBureau: RatingBureau;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: ProfileStatus;
  /** Who checked this profile against the manual, and when. Null while it is a draft. */
  readonly verifiedBy: string | null;
  readonly verifiedAt: string | null;
  readonly sources: readonly RulesProfileSource[];

  readonly uninsuredSubcontractor: UninsuredSubcontractorRule;
  readonly laborMaterial: LaborMaterialRule;
  readonly classification: ClassificationRule;
  readonly specialCategories: readonly SpecialCategoryRule[];
  readonly coveragePeriod: CoveragePeriodRule;
  readonly auditNoncompliance: AuditNoncomplianceRule;

  /** A vendor paid more than this with no triage decision and no certificate is flagged. */
  readonly largeUntriagedVendorThreshold: Cents;

  /** Plain statements of the modeled rules, for the workpaper's methodology page. */
  readonly statements: readonly string[];
}

/** How a profile was selected, kept with the result so a figure can be re-explained. */
export interface RulesProfileSelection {
  readonly jurisdiction: Jurisdiction;
  readonly ratingBureau: RatingBureau | null;
  readonly rulesetId: string;
  readonly rulesetVersion: string;
}

export function specialCategoryRule(
  profile: RulesProfile,
  category: SpecialCategory,
): SpecialCategoryRule | null {
  return profile.specialCategories.find((rule) => rule.category === category) ?? null;
}

/** Rates are per $100 of payroll; a profile never carries one, policies do. */
export type ProfileRate = RateTenThousandths;
