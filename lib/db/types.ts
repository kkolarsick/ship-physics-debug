/**
 * Application records — the domain types the screens work with.
 *
 * These extend the engine's pure inputs rather than duplicating them, so a record can be
 * handed straight to `computeExposure` without a mapping step that could drift.
 */
import type {
  CertificateInput,
  PaymentInput,
  PolicyInput,
  SubcontractorInput,
} from '@/lib/exposure/types';
import type { ChaseItem } from '@/lib/chase/types';
import type { Cents } from '@/lib/money';
import type { IsoDate } from '@/lib/dates';

export interface OrgRecord {
  readonly id: string;
  readonly name: string;
  readonly fiscalYearEnd: IsoDate | null;
}

export interface PolicyRecord extends PolicyInput {
  readonly orgId: string;
  readonly carrierName: string | null;
  readonly policyNumber: string | null;
  readonly createdAt: string;
}

export interface ClassCodeRateRecord {
  readonly id: string;
  readonly policyId: string;
  readonly classCode: string;
  readonly rate: number;
  readonly label: string | null;
}

export interface SubcontractorRecord extends SubcontractorInput {
  readonly orgId: string;
  readonly normalizedName: string;
  readonly notes: string | null;
}

export interface PaymentRecord extends PaymentInput {
  readonly orgId: string;
  readonly memo: string | null;
  readonly importedBatchId: string | null;
}

export type CertificateStatus =
  | 'pending'
  | 'extracted'
  | 'needs_review'
  | 'matched'
  | 'rejected';

export interface CertificateRecord extends CertificateInput {
  readonly orgId: string;
  readonly status: CertificateStatus;
  readonly filePath: string;
  readonly originalFilename: string | null;
  readonly normalizedNamedInsured: string | null;
  readonly producerPhone: string | null;
  readonly wcCarrier: string | null;
  readonly wcPolicyNumber: string | null;
  readonly certificateHolder: string | null;
  readonly descriptionOfOperations: string | null;
  readonly extractionConfidenceThousandths: number | null;
  readonly extractionError: string | null;
  readonly rawExtraction: unknown;
  readonly reviewedByUserAt: string | null;
  readonly createdAt: string;
}

export interface AliasRecord {
  readonly id: string;
  readonly orgId: string;
  readonly subcontractorId: string;
  readonly alias: string;
  readonly normalizedAlias: string;
}

export interface ImportBatchRecord {
  readonly id: string;
  readonly orgId: string;
  readonly policyId: string | null;
  readonly sourceFilename: string;
  readonly storagePath: string | null;
  readonly preset: string | null;
  readonly columnMapping: Record<string, string | undefined>;
  readonly rowCount: number;
  readonly importedCount: number;
  readonly excluded: Record<string, number>;
  readonly createdAt: string;
  readonly rolledBackAt: string | null;
}

export interface AuditEventRecord {
  readonly id: string;
  readonly orgId: string;
  readonly actor: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly action: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly at: string;
}

export interface ExposureSnapshotRecord {
  readonly id: string;
  readonly orgId: string;
  readonly policyId: string;
  readonly rulesetVersion: string;
  readonly totalExposure: Cents;
  readonly addedPayroll: Cents;
  readonly surcharge: Cents;
  readonly reason: string | null;
  readonly createdAt: string;
}

export type ChaseItemRecord = ChaseItem & {
  readonly orgId: string;
  readonly sentTo: string | null;
  readonly subject: string | null;
  readonly body: string | null;
};

export interface Dataset {
  readonly org: OrgRecord;
  readonly policy: PolicyRecord | null;
  readonly policies: readonly PolicyRecord[];
  readonly classCodeRates: readonly ClassCodeRateRecord[];
  readonly subcontractors: readonly SubcontractorRecord[];
  readonly payments: readonly PaymentRecord[];
  readonly certificates: readonly CertificateRecord[];
  readonly aliases: readonly AliasRecord[];
  readonly chaseItems: readonly ChaseItemRecord[];
  readonly batches: readonly ImportBatchRecord[];
}
