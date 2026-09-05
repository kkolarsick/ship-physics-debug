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

/** Evidence that establishes a subcontractor's own payroll for the work. */
export type PayrollEvidence =
  | 'subcontractor_payroll_records'
  | 'certified_payroll'
  | 'subcontractor_attestation';

/**
 * Where a rule comes from. Calculation logic is traceable to a primary or authoritative
 * source; a blog post is not one, and there is no authority value that admits one.
 */
export type SourceAuthority =
  | 'rating_bureau_manual'
  | 'state_regulation'
  | 'state_regulator_guidance'
  | 'ncci_manual'
  | 'carrier_audit_manual';

export interface SourceCitation {
  readonly authority: SourceAuthority;
  /** The document. */
  readonly label: string;
  /** The rule, section, or page inside it. */
  readonly reference: string;
  readonly url: string | null;
  /** When a person last checked this citation against the document. */
  readonly retrievedAt: string | null;
}

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
  readonly citations: readonly SourceCitation[];
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
  readonly citations: readonly SourceCitation[];
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
  readonly citations: readonly SourceCitation[];
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
  | 'labor_only_no_materials'
  | 'piecework'
  | 'independent_contractor';

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
  readonly citations: readonly SourceCitation[];
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Payroll basis
// ---------------------------------------------------------------------------

/**
 * What the added payroll figure is built from.
 *
 * Bureaus generally prefer the subcontractor's actual payroll for the work where the
 * hiring contractor can produce it, and fall back to the subcontract price only when they
 * cannot. Which evidence counts, and what the fallback is, differ by jurisdiction.
 */
export type SubcontractPriceFallback =
  /** The whole contract price stands in for payroll. */
  | 'full_price'
  /** A deemed share of the contract price stands in. */
  | 'deemed_labor_share'
  /** No fallback: without payroll records the scenario is outside what is modelled. */
  | 'not_permitted';

export interface PayrollBasisRule {
  /** Whether the subcontractor's own payroll records displace the contract price. */
  readonly actualPayrollPreferred: boolean;
  readonly acceptedPayrollEvidence: readonly PayrollEvidence[];
  readonly subcontractPriceFallback: SubcontractPriceFallback;
  /** Used when the fallback is `deemed_labor_share`. */
  readonly deemedLaborShare: Fraction | null;
  readonly citations: readonly SourceCitation[];
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// Experience modification
// ---------------------------------------------------------------------------

export interface ExperienceModRule {
  /** Whether the experience mod applies to premium on uninsured subcontract payroll. */
  readonly appliesToAddedPayroll: boolean;
  readonly citations: readonly SourceCitation[];
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
  readonly citations: readonly SourceCitation[];
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
  readonly citations: readonly SourceCitation[];
  /** Which of the triggers this jurisdiction recognises. */
  readonly triggers: readonly NoncomplianceTrigger[];
  readonly charge: NoncomplianceCharge;
  readonly notes: string;
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Conditions a profile refuses to estimate
// ---------------------------------------------------------------------------

/**
 * Situations the engine knows how to detect and that a profile may declare outside what
 * it models. Listing one here makes the engine return "estimate unavailable — manual
 * review required" for the affected subcontractor rather than producing a figure.
 */
export type UnsupportedCondition =
  /** The profile prefers actual payroll and none is on file. */
  | 'actual_payroll_missing'
  /** No work dates, and this profile does not accept the payment date as a stand-in. */
  | 'work_period_missing'
  /** No defensible class code for the subcontractor's trade. */
  | 'classification_unknown'
  /** The subcontractor is in a category the profile lists but does not settle. */
  | 'special_category_unsettled';

export const UNSUPPORTED_CONDITION_LABELS: Readonly<Record<UnsupportedCondition, string>> = {
  actual_payroll_missing:
    'This jurisdiction requires the subcontractor’s own payroll records, and none are on file.',
  work_period_missing:
    'This jurisdiction requires the period the work was performed, and no work dates are on file.',
  classification_unknown:
    'No class code is recorded for this subcontractor and this jurisdiction does not permit a proxy.',
  special_category_unsettled:
    'This subcontractor is in a category this jurisdiction’s profile does not settle.',
};

/** A carve-out the profile deliberately does not model, named so it can be shown. */
export interface RuleException {
  readonly id: string;
  readonly summary: string;
  readonly citations: readonly SourceCitation[];
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
  /** The authority whose manual governs this jurisdiction. */
  readonly sourceAuthority: SourceAuthority;
  readonly sources: readonly SourceCitation[];

  readonly uninsuredSubcontractor: UninsuredSubcontractorRule;
  readonly payrollBasis: PayrollBasisRule;
  readonly laborMaterial: LaborMaterialRule;
  readonly classification: ClassificationRule;
  readonly experienceMod: ExperienceModRule;
  readonly specialCategories: readonly SpecialCategoryRule[];
  readonly coveragePeriod: CoveragePeriodRule;
  readonly auditNoncompliance: AuditNoncomplianceRule;

  /** Conditions this profile declines to estimate. The engine fails closed on each. */
  readonly unsupportedConditions: readonly UnsupportedCondition[];
  /** Carve-outs it deliberately does not model, named so the product can say so. */
  readonly exceptions: readonly RuleException[];
  /**
   * What still has to be sourced before this profile can be populated or verified. Drives
   * the "what SubLedger will not calculate" copy on the public state page, so the marketing
   * surface cannot claim more than the engine implements.
   */
  readonly openQuestions: readonly string[];

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

/** Every citation a profile rests on, across all of its rule families. */
export function profileCitations(profile: RulesProfile): SourceCitation[] {
  const families = [
    profile.uninsuredSubcontractor,
    profile.payrollBasis,
    profile.laborMaterial,
    profile.classification,
    profile.experienceMod,
    profile.coveragePeriod,
    profile.auditNoncompliance,
  ];

  const all = [
    ...profile.sources,
    ...families.flatMap((family) => family.citations),
    ...profile.specialCategories.flatMap((rule) => rule.citations),
    ...profile.exceptions.flatMap((exception) => exception.citations),
  ];

  const seen = new Set<string>();
  return all.filter((citation) => {
    const key = `${citation.label}|${citation.reference}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
