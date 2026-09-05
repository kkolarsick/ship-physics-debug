import type { ExposureFlag, RateProvenance, ZeroReason, CoverageBasis } from './types';

export const FLAG_LABELS: Readonly<Record<ExposureFlag, string>> = {
  SOLE_PROPRIETOR_NO_EMPLOYEES: 'Sole proprietor',
  OFFICER_EXCLUSION_NOTED: 'Officer exclusion noted',
  CERT_EXPIRES_MID_TERM: 'Certificate ends mid-term',
  MATERIAL_CAP_BINDING: 'Material cap binding',
  LARGE_UNMATCHED_VENDOR: 'Large untriaged vendor',
  GL_ONLY_CERTIFICATE: 'GL-only certificate',
  PAYMENT_DATE_PROXY_USED: 'Payment date used as proxy',
  PARTIAL_WORK_PERIOD_COVERAGE: 'Work period straddles coverage',
  GOVERNING_RATE_PROXY_USED: 'Governing rate used as proxy',
  NO_RATE_AVAILABLE: 'No rate available',
  SPECIAL_CATEGORY_REQUIRES_REVIEW: 'Category needs review',
  DEEMED_LABOR_SHARE_APPLIED: 'Deemed labor share applied',
  CERTIFICATE_NOT_REVIEWED: 'Certificate not reviewed',
  MATCH_NOT_REVIEWED: 'Match not reviewed',
};

/** Flags that describe how good the inputs are, rather than what a document says. */
export const INPUT_QUALITY_FLAGS: ReadonlySet<ExposureFlag> = new Set<ExposureFlag>([
  'PAYMENT_DATE_PROXY_USED',
  'PARTIAL_WORK_PERIOD_COVERAGE',
  'GOVERNING_RATE_PROXY_USED',
  'NO_RATE_AVAILABLE',
  'CERTIFICATE_NOT_REVIEWED',
  'MATCH_NOT_REVIEWED',
  'SPECIAL_CATEGORY_REQUIRES_REVIEW',
]);

export const ZERO_REASON_LABELS: Readonly<Record<ZeroReason, string>> = {
  covered: 'Certificates on file cover the whole period worked',
  no_payments: 'No payments inside the policy term',
  not_a_subcontractor: 'Triaged as not subcontracted labor',
  special_category_excluded: 'This rules profile excludes this category from payroll',
};

export const RATE_PROVENANCE_LABELS: Readonly<Record<RateProvenance, string>> = {
  subcontractor_class: 'Subcontractor’s own class',
  prior_audit_rate: 'Rate from a prior audit',
  rules_profile_derived: 'Governing class, per the rules profile',
  governing_rate_proxy: 'Governing rate as a proxy',
  unknown: 'No rate available',
};

/** Short forms for the workpaper schedule, where the column is 82 points wide. */
export const RATE_PROVENANCE_SHORT: Readonly<Record<RateProvenance, string>> = {
  subcontractor_class: 'Own trade class',
  prior_audit_rate: 'Prior audit rate',
  rules_profile_derived: 'Governing, by rule',
  governing_rate_proxy: 'Governing (proxy)',
  unknown: 'None available',
};

export const COVERAGE_BASIS_LABELS: Readonly<Record<CoverageBasis, string>> = {
  work_period: 'Work period',
  payment_date_proxy: 'Payment date (proxy)',
  not_evaluable: 'Cannot be evaluated',
};

export function describeFlag(flag: ExposureFlag): string {
  return FLAG_LABELS[flag];
}
