/**
 * The data access boundary.
 *
 * Two implementations satisfy it: Supabase (the deployment target) and a local JSON store
 * used for the seeded demo and the E2E run. Screens depend on this interface only, so the
 * exposure figures on a demo machine and on production come out of the same code path.
 */
import type {
  AliasRecord,
  AuditEventRecord,
  CertificateRecord,
  ChaseItemRecord,
  ClassCodeRateRecord,
  Dataset,
  ExposureSnapshotRecord,
  ImportBatchRecord,
  OrgRecord,
  PaymentRecord,
  PolicyRecord,
  SubcontractorRecord,
} from './types';
import type { PortfolioExposure } from '@/lib/exposure/types';
import type { TriageDecision } from '@/lib/exposure/types';

export interface NewPayment {
  readonly subcontractorId: string;
  readonly paidOn: string;
  readonly amount: number;
  readonly sourceRef: string | null;
  readonly memo: string | null;
}

export interface Store {
  /** Everything one org needs to render any screen, for the currently selected term. */
  loadDataset(policyId?: string): Promise<Dataset>;

  getOrg(): Promise<OrgRecord>;
  renameOrg(name: string): Promise<void>;

  savePolicy(input: Omit<PolicyRecord, 'orgId' | 'createdAt' | 'id'> & { id?: string }): Promise<PolicyRecord>;
  listPolicies(): Promise<readonly PolicyRecord[]>;
  saveClassCodeRate(
    input: Omit<ClassCodeRateRecord, 'id'> & { id?: string },
  ): Promise<ClassCodeRateRecord>;

  upsertSubcontractorsByName(names: readonly string[]): Promise<readonly SubcontractorRecord[]>;
  setTriage(subcontractorId: string, triage: TriageDecision): Promise<void>;
  patchSubcontractor(
    subcontractorId: string,
    patch: Partial<Pick<SubcontractorRecord, 'entityType' | 'trade' | 'notes'>> & {
      classCodeRateId?: string | null;
    },
  ): Promise<void>;

  createImportBatch(
    input: Omit<ImportBatchRecord, 'id' | 'orgId' | 'createdAt' | 'rolledBackAt'>,
    payments: readonly NewPayment[],
    rawCsv: string,
  ): Promise<ImportBatchRecord>;
  rollbackImportBatch(batchId: string): Promise<void>;

  setPaymentMaterialSplit(
    paymentId: string,
    materialAmount: number | null,
    materialEvidence: PaymentRecord['materialEvidence'],
  ): Promise<void>;

  createCertificate(
    input: Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>,
  ): Promise<CertificateRecord>;
  updateCertificate(
    certificateId: string,
    patch: Partial<Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>>,
  ): Promise<void>;
  matchCertificate(
    certificateId: string,
    subcontractorId: string | null,
    options: { saveAlias: boolean },
  ): Promise<void>;
  listAliases(): Promise<readonly AliasRecord[]>;

  replaceChaseItems(policyId: string, items: readonly Omit<ChaseItemRecord, 'id' | 'orgId'>[]): Promise<void>;
  updateChaseItem(
    chaseItemId: string,
    patch: Partial<Omit<ChaseItemRecord, 'id' | 'orgId'>>,
  ): Promise<void>;

  saveExposureSnapshot(
    portfolio: PortfolioExposure,
    reason: string,
  ): Promise<ExposureSnapshotRecord>;
  listExposureSnapshots(policyId: string): Promise<readonly ExposureSnapshotRecord[]>;

  appendAuditEvent(
    event: Omit<AuditEventRecord, 'id' | 'orgId' | 'at'>,
  ): Promise<void>;
  listAuditEvents(filter?: { entityType?: string; entityId?: string }): Promise<readonly AuditEventRecord[]>;
}
