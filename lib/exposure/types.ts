import type { Cents, ModThousandths, PctTenThousandths, RateTenThousandths } from '@/lib/money';
import type { IsoDate } from '@/lib/dates';

export type EntityType =
  | 'unknown'
  | 'corporation'
  | 'llc'
  | 'partnership'
  | 'sole_proprietor';

export type MaterialEvidence = 'none' | 'original_invoice' | 'contract_schedule';

export type TriageDecision = 'undecided' | 'subcontractor' | 'supplier' | 'not_applicable';

/** The engine's view of a policy term. No I/O types, no database rows. */
export interface PolicyInput {
  readonly id: string;
  readonly termStart: IsoDate;
  readonly termEnd: IsoDate;
  readonly experienceMod: ModThousandths;
  readonly estimatedAnnualPremium: Cents;
  readonly noncomplianceSurchargePct: PctTenThousandths;
  readonly governingClassCode: string;
  readonly governingRate: RateTenThousandths;
}

export interface SubcontractorInput {
  readonly id: string;
  readonly name: string;
  readonly entityType: EntityType;
  readonly trade: string | null;
  readonly triage: TriageDecision;
  /** Per-trade rate override. When absent the governing rate is used. */
  readonly classCodeOverride: { readonly classCode: string; readonly rate: RateTenThousandths } | null;
}

export interface PaymentInput {
  readonly id: string;
  readonly subcontractorId: string;
  readonly paidOn: IsoDate;
  readonly amount: Cents;
  readonly sourceRef: string | null;
  readonly materialAmount: Cents | null;
  readonly materialEvidence: MaterialEvidence;
}

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
}

/** A period during which the documents on file show workers' comp for this sub. */
export interface CoverageWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
  /** Every certificate whose window contributed to this merged span. */
  readonly certificateIds: readonly string[];
}

export type ExposureFlag =
  | 'SOLE_PROPRIETOR_NO_EMPLOYEES'
  | 'OFFICER_EXCLUSION_NOTED'
  | 'CERT_EXPIRES_MID_TERM'
  | 'MATERIAL_CAP_BINDING'
  | 'LARGE_UNMATCHED_VENDOR'
  | 'GL_ONLY_CERTIFICATE';

export interface FlagDetail {
  readonly flag: ExposureFlag;
  /** A statement of what the documents show. Never a coverage judgment. */
  readonly detail: string;
  /** Figures the flag refers to, so the UI can show its work. */
  readonly figures?: Readonly<Record<string, Cents>>;
}

export type ZeroReason = 'covered' | 'no_payments' | 'not_a_subcontractor';

export interface SubExposure {
  readonly subcontractorId: string;
  readonly subcontractorName: string;

  /** Every payment inside the policy term, split by the documents on file. */
  readonly paidTotal: Cents;
  readonly coveredTotal: Cents;
  readonly uncoveredTotal: Cents;
  readonly coveredPaymentIds: readonly string[];
  readonly uncoveredPaymentIds: readonly string[];
  readonly coverageWindows: readonly CoverageWindow[];

  /** Material deduction, as claimed by the documents and as allowed by the cap. */
  readonly materialClaimed: Cents;
  readonly materialAllowed: Cents;

  readonly addedPayroll: Cents;
  readonly addedPremium: Cents;

  /** Dollars of added premium each available action removes. */
  readonly ifCertificateObtained: Cents;
  readonly ifSplitInvoiceObtained: Cents;

  readonly rate: RateTenThousandths;
  readonly rateSource: 'class_code_override' | 'governing';
  readonly classCode: string;
  readonly experienceMod: ModThousandths;

  readonly flags: readonly FlagDetail[];
  readonly zeroReason: ZeroReason | null;
  readonly rulesetVersion: string;
}

export interface PortfolioExposure {
  readonly policyId: string;
  readonly subs: readonly SubExposure[];
  readonly addedPayroll: Cents;
  readonly addedPremiumBeforeSurcharge: Cents;
  readonly surcharge: Cents;
  readonly totalExposure: Cents;
  /** Dollars that only a certificate can clear, and dollars a split invoice also reaches. */
  readonly clearedByCertificateOnly: Cents;
  readonly clearedBySplitInvoice: Cents;
  readonly rulesetVersion: string;
  readonly computedAt: string;
}
