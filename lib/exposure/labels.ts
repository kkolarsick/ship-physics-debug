import type { ExposureFlag, ZeroReason } from './types';

export const FLAG_LABELS: Readonly<Record<ExposureFlag, string>> = {
  SOLE_PROPRIETOR_NO_EMPLOYEES: 'Sole proprietor',
  OFFICER_EXCLUSION_NOTED: 'Officer exclusion noted',
  CERT_EXPIRES_MID_TERM: 'Certificate ends mid-term',
  MATERIAL_CAP_BINDING: 'Material cap binding',
  LARGE_UNMATCHED_VENDOR: 'Large untriaged vendor',
  GL_ONLY_CERTIFICATE: 'GL-only certificate',
};

export const ZERO_REASON_LABELS: Readonly<Record<ZeroReason, string>> = {
  covered: 'Certificates on file cover every payment date in the term',
  no_payments: 'No payments inside the policy term',
  not_a_subcontractor: 'Triaged as not subcontracted labor',
};

export function describeFlag(flag: ExposureFlag): string {
  return FLAG_LABELS[flag];
}
