/** Builders for engine inputs, so each test states only what it is actually about. */
import { NO_AUDIT_COMPLIANCE_ISSUES } from '@/lib/exposure/types';
import type {
  AuditComplianceInput,
  CertificateInput,
  PaymentInput,
  PolicyInput,
  SubcontractorInput,
} from '@/lib/exposure/types';

export const dollars = (amount: number): number => Math.round(amount * 100);

export function policy(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    id: 'p1',
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    experienceMod: 1_000,
    estimatedAnnualPremium: dollars(180_000),
    governingClassCode: '5645',
    governingRate: 100_000, // 10.00 per $100, so the arithmetic is easy to read
    jurisdiction: 'US-XA',
    ratingBureau: null,
    rulesetId: null,
    rulesetVersion: null,
    auditCompliance: NO_AUDIT_COMPLIANCE_ISSUES,
    ...overrides,
  };
}

export function auditCompliance(
  overrides: Partial<AuditComplianceInput> = {},
): AuditComplianceInput {
  return { ...NO_AUDIT_COMPLIANCE_ISSUES, ...overrides };
}

export function sub(overrides: Partial<SubcontractorInput> = {}): SubcontractorInput {
  return {
    id: 's1',
    name: 'Test Sub',
    entityType: 'llc',
    trade: 'General',
    triage: 'subcontractor',
    classCodeOverride: { classCode: '5645', rate: 100_000 },
    priorAuditRate: null,
    specialCategory: null,
    ...overrides,
  };
}

export function payment(
  overrides: Partial<PaymentInput> & { amount: number },
): PaymentInput {
  return {
    id: `pay-${Math.random().toString(36).slice(2, 10)}`,
    subcontractorId: 's1',
    paidOn: '2025-06-01',
    workFrom: null,
    workTo: null,
    sourceRef: null,
    materialAmount: null,
    materialEvidence: 'none',
    ...overrides,
  };
}

export function cert(overrides: Partial<CertificateInput> = {}): CertificateInput {
  return {
    id: 'c1',
    subcontractorId: 's1',
    namedInsured: 'Test Sub LLC',
    wcPresent: true,
    wcEffective: '2025-01-01',
    wcExpiration: '2025-12-31',
    wcOfficerExclusionNoted: false,
    glPresent: true,
    producerName: null,
    producerEmail: null,
    evidence: 'reviewed_by_user',
    matchMethod: 'manual',
    ...overrides,
  };
}
