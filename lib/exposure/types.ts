import type { Cents, ModThousandths, PctTenThousandths, RateTenThousandths } from '@/lib/money';
import type { IsoDate } from '@/lib/dates';
import type {
  Jurisdiction,
  MaterialEvidence,
  RatingBureau,
  RulesProfile,
  SpecialCategory,
} from '@/lib/rules/types';
import type { RulesResolutionFailure } from '@/lib/rules/registry';
import type { EstimateConfidence } from './confidence';

export type { MaterialEvidence, SpecialCategory };

export type EntityType =
  | 'unknown'
  | 'corporation'
  | 'llc'
  | 'partnership'
  | 'sole_proprietor';

export type TriageDecision = 'undecided' | 'subcontractor' | 'supplier' | 'not_applicable';

/**
 * How the audit compliance state of the term was answered.
 *
 * These are the only inputs that can produce an audit noncompliance charge. A
 * subcontractor lacking coverage is not one of them — that is uninsured-subcontract
 * exposure, a different mechanism with a different remedy.
 */
export interface AuditComplianceInput {
  /** Does the policy actually carry an audit noncompliance endorsement or equivalent? */
  readonly endorsementOnPolicy: boolean;
  /** Were the records the auditor asked for provided? */
  readonly recordsFurnished: boolean;
  /** Was the audit permitted to take place? */
  readonly auditPermitted: boolean;
  /** Has the carrier already issued an estimated audit for this term? */
  readonly estimatedAuditIssued: boolean;
  /** The percentage printed on the insured's own policy, where the profile uses one. */
  readonly carrierConfiguredPct: PctTenThousandths;
}

export const NO_AUDIT_COMPLIANCE_ISSUES: AuditComplianceInput = {
  endorsementOnPolicy: false,
  recordsFurnished: true,
  auditPermitted: true,
  estimatedAuditIssued: false,
  carrierConfiguredPct: 0,
};

/** The engine's view of a policy term. No I/O types, no database rows. */
export interface PolicyInput {
  readonly id: string;
  readonly termStart: IsoDate;
  readonly termEnd: IsoDate;
  readonly experienceMod: ModThousandths;
  readonly estimatedAnnualPremium: Cents;
  readonly governingClassCode: string;
  readonly governingRate: RateTenThousandths;

  /** Which rules govern this policy. Without a jurisdiction nothing can be estimated. */
  readonly jurisdiction: Jurisdiction | null;
  readonly ratingBureau: RatingBureau | null;
  /** Set to pin a saved figure to the exact ruleset that produced it. */
  readonly rulesetId: string | null;
  readonly rulesetVersion: string | null;

  readonly auditCompliance: AuditComplianceInput;
}

export interface SubcontractorInput {
  readonly id: string;
  readonly name: string;
  readonly entityType: EntityType;
  readonly trade: string | null;
  readonly triage: TriageDecision;
  /** The class and rate for the work this subcontractor actually did, when known. */
  readonly classCodeOverride: { readonly classCode: string; readonly rate: RateTenThousandths } | null;
  /** The rate an auditor actually applied to this subcontractor on a prior audit. */
  readonly priorAuditRate: { readonly classCode: string; readonly rate: RateTenThousandths } | null;
  /** An explicit assertion about the kind of arrangement, when the user has made one. */
  readonly specialCategory: SpecialCategory | null;
}

export interface PaymentInput {
  readonly id: string;
  readonly subcontractorId: string;
  readonly paidOn: IsoDate;
  /** When the work was performed. Both or neither; coverage is tested against this. */
  readonly workFrom: IsoDate | null;
  readonly workTo: IsoDate | null;
  readonly amount: Cents;
  readonly sourceRef: string | null;
  readonly materialAmount: Cents | null;
  readonly materialEvidence: MaterialEvidence;
}

/** How a certificate's fields came to be what they are. Feeds confidence, not dollars. */
export type CertificateEvidence = 'reviewed_by_user' | 'model_extracted' | 'entered_by_user';
export type MatchMethod = 'manual' | 'alias' | 'auto_trigram' | 'unmatched';

export interface CertificateInput {
  readonly id: string;
  readonly subcontractorId: string | null;
  readonly namedInsured: string | null;
  readonly wcPresent: boolean;
  readonly wcEffective: IsoDate | null;
  readonly wcExpiration: IsoDate | null;
  readonly wcOfficerExclusionNoted: boolean;
  readonly glPresent: boolean;
  readonly producerName: string | null;
  readonly producerEmail: string | null;
  readonly evidence: CertificateEvidence;
  readonly matchMethod: MatchMethod;
}

/** A period during which the documents on file show workers' comp for this sub. */
export interface CoverageWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** Every certificate whose window contributed to this merged span. */
  readonly certificateIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Coverage assessment
// ---------------------------------------------------------------------------

export type CoverageBasis =
  /** Tested against the period the work was performed. */
  | 'work_period'
  /** Tested against the payment date because no work period is on file. */
  | 'payment_date_proxy'
  /** Could not be tested: no work period, and the profile forbids the proxy. */
  | 'not_evaluable';

export interface PaymentAssessment {
  readonly paymentId: string;
  readonly amount: Cents;
  readonly coveredAmount: Cents;
  readonly uncoveredAmount: Cents;
  readonly basis: CoverageBasis;
  /** The period actually tested. Equal dates when a payment date stood in. */
  readonly evaluatedFrom: IsoDate | null;
  readonly evaluatedTo: IsoDate | null;
  readonly coveredDays: number;
  readonly totalDays: number;
  /** Certificates whose windows covered any part of it. The documents behind the figure. */
  readonly certificateIds: readonly string[];
  /** True when the period straddles a coverage boundary. */
  readonly partialOverlap: boolean;
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

export type RateProvenance =
  /** A class and rate recorded for this subcontractor's own trade. */
  | 'subcontractor_class'
  /** The rate an auditor actually applied to this subcontractor previously. */
  | 'prior_audit_rate'
  /** The rules profile says the governing class is the correct basis here. */
  | 'rules_profile_derived'
  /** No class is known; the governing rate stands in. Flagged, never presented as known. */
  | 'governing_rate_proxy'
  /** No defensible rate. Payroll is reported; no premium figure is produced. */
  | 'unknown';

export interface RateSelection {
  readonly provenance: RateProvenance;
  readonly rate: RateTenThousandths | null;
  readonly classCode: string | null;
  readonly statement: string;
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export type ExposureFlag =
  | 'SOLE_PROPRIETOR_NO_EMPLOYEES'
  | 'OFFICER_EXCLUSION_NOTED'
  | 'CERT_EXPIRES_MID_TERM'
  | 'MATERIAL_CAP_BINDING'
  | 'LARGE_UNMATCHED_VENDOR'
  | 'GL_ONLY_CERTIFICATE'
  | 'PAYMENT_DATE_PROXY_USED'
  | 'PARTIAL_WORK_PERIOD_COVERAGE'
  | 'GOVERNING_RATE_PROXY_USED'
  | 'NO_RATE_AVAILABLE'
  | 'SPECIAL_CATEGORY_REQUIRES_REVIEW'
  | 'DEEMED_LABOR_SHARE_APPLIED'
  | 'CERTIFICATE_NOT_REVIEWED'
  | 'MATCH_NOT_REVIEWED';

export interface FlagDetail {
  readonly flag: ExposureFlag;
  /** A statement of what the documents show. Never a coverage judgment. */
  readonly detail: string;
  /** Figures the flag refers to, so the UI can show its work. */
  readonly figures?: Readonly<Record<string, Cents>>;
}

export type ZeroReason =
  | 'covered'
  | 'no_payments'
  | 'not_a_subcontractor'
  | 'special_category_excluded';

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type EstimateStatus = 'estimated' | 'unavailable';

export interface EstimateUnavailable {
  readonly reason:
    | RulesResolutionFailure
    | 'rules_not_populated'
    | 'work_period_required'
    | 'no_rate_available';
  readonly message: string;
}

/** Everything needed to re-explain a figure later, without recomputing it. */
export interface ExposureProvenance {
  readonly jurisdiction: Jurisdiction | null;
  readonly ratingBureau: RatingBureau | null;
  readonly rulesetId: string;
  readonly rulesetVersion: string;
  readonly rulesProfileStatus: RulesProfile['status'];
  readonly computedAt: string;
  /** Certificates that produced the coverage windows used. */
  readonly certificateIds: readonly string[];
  /** Payments the figure was built from. */
  readonly paymentIds: readonly string[];
}

export interface SubExposure {
  readonly subcontractorId: string;
  readonly subcontractorName: string;
  readonly status: EstimateStatus;
  readonly unavailable: EstimateUnavailable | null;

  readonly paidTotal: Cents;
  readonly coveredTotal: Cents;
  readonly uncoveredTotal: Cents;
  readonly assessments: readonly PaymentAssessment[];
  readonly coverageWindows: readonly CoverageWindow[];
  /** True when any payment fell back to the payment date. Disclosed in the UI and export. */
  readonly usedPaymentDateProxy: boolean;

  /** Material deduction, as claimed by the documents and as allowed by the profile. */
  readonly materialClaimed: Cents;
  readonly materialAllowed: Cents;
  /** Set when the profile deemed a fixed share of the contract to be payroll. */
  readonly deemedLaborShareApplied: { readonly numerator: number; readonly denominator: number } | null;

  readonly addedPayroll: Cents;
  /** Null when no defensible rate exists. Payroll is still reported. */
  readonly addedPremium: Cents | null;

  /** Dollars of added premium each available action removes. Null when unrated. */
  readonly ifCertificateObtained: Cents | null;
  readonly ifSplitInvoiceObtained: Cents | null;

  readonly rate: RateSelection;
  readonly experienceMod: ModThousandths;

  readonly flags: readonly FlagDetail[];
  readonly zeroReason: ZeroReason | null;
  readonly confidence: EstimateConfidence;
  readonly provenance: ExposureProvenance;
}

export interface AuditNoncomplianceAssessment {
  readonly applies: boolean;
  readonly charge: Cents;
  /** Which recognised conditions are actually present. Empty means no charge. */
  readonly triggersPresent: readonly string[];
  readonly basis: string;
  readonly statement: string;
}

export interface PortfolioExposure {
  readonly policyId: string;
  readonly status: EstimateStatus;
  readonly unavailable: EstimateUnavailable | null;

  readonly subs: readonly SubExposure[];
  readonly addedPayroll: Cents;
  /** Sum of the subcontractors that could actually be rated. */
  readonly addedPremiumBeforeSurcharge: Cents;
  /** Payroll with no defensible rate. Reported separately, never rated by proxy silently. */
  readonly unratedPayroll: Cents;
  readonly unratedSubcontractorCount: number;
  /** Premium that rests on the governing-rate proxy rather than a known class. */
  readonly proxyRatedPremium: Cents;

  readonly auditNoncompliance: AuditNoncomplianceAssessment;
  readonly totalExposure: Cents;

  /** Dollars that only a certificate can clear, and dollars a split invoice also reaches. */
  readonly clearedByCertificateOnly: Cents;
  readonly clearedBySplitInvoice: Cents;

  readonly confidence: EstimateConfidence;
  readonly provenance: ExposureProvenance;
  readonly rulesProfile: RulesProfile | null;
}
