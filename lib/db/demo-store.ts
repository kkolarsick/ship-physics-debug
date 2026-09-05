/**
 * A local JSON-backed store.
 *
 * This exists so the app is demonstrable in one command with no cloud account, which is
 * what §11's seed-script requirement and the build order's "sellable at step 2" both
 * need. It implements the same `Store` interface as Supabase — the screens and the
 * exposure engine cannot tell the difference.
 *
 * It is single-tenant and single-process by construction. It is not a production store
 * and it never runs when SUPABASE credentials are configured.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeName } from '@/lib/matching/normalize';
import type { PortfolioExposure, TriageDecision } from '@/lib/exposure/types';
import type { NewPayment, Store } from './store';
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

export const DEMO_DATA_PATH =
  process.env.SUBLEDGER_DEMO_DATA ?? join(process.cwd(), '.data', 'demo.json');

interface DemoFile {
  org: OrgRecord;
  policies: PolicyRecord[];
  classCodeRates: ClassCodeRateRecord[];
  subcontractors: SubcontractorRecord[];
  payments: PaymentRecord[];
  certificates: CertificateRecord[];
  aliases: AliasRecord[];
  chaseItems: ChaseItemRecord[];
  batches: ImportBatchRecord[];
  rawImports: Record<string, string>;
  snapshots: ExposureSnapshotRecord[];
  auditEvents: AuditEventRecord[];
}

const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001';

export function emptyDemoFile(orgName = 'Your company'): DemoFile {
  return {
    org: { id: DEMO_ORG_ID, name: orgName, fiscalYearEnd: null },
    policies: [],
    classCodeRates: [],
    subcontractors: [],
    payments: [],
    certificates: [],
    aliases: [],
    chaseItems: [],
    batches: [],
    rawImports: {},
    snapshots: [],
    auditEvents: [],
  };
}

export class DemoStore implements Store {
  constructor(private readonly path: string = DEMO_DATA_PATH) {}

  private read(): DemoFile {
    if (!existsSync(this.path)) return emptyDemoFile();
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as DemoFile;
    } catch {
      return emptyDemoFile();
    }
  }

  private write(data: DemoFile): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`);
  }

  private mutate<T>(fn: (data: DemoFile) => T): T {
    const data = this.read();
    const result = fn(data);
    this.write(data);
    return result;
  }

  async loadDataset(policyId?: string): Promise<Dataset> {
    const data = this.read();
    const policy =
      data.policies.find((entry) => entry.id === policyId) ??
      [...data.policies].sort((a, b) => b.termStart.localeCompare(a.termStart))[0] ??
      null;
    return {
      org: data.org,
      policy,
      policies: [...data.policies].sort((a, b) => b.termStart.localeCompare(a.termStart)),
      classCodeRates: data.classCodeRates.filter((rate) => rate.policyId === policy?.id),
      subcontractors: data.subcontractors,
      payments: data.payments,
      certificates: data.certificates,
      aliases: data.aliases,
      chaseItems: data.chaseItems.filter((item) => item.policyId === policy?.id),
      batches: data.batches.filter((batch) => batch.rolledBackAt === null),
    };
  }

  async getOrg(): Promise<OrgRecord> {
    return this.read().org;
  }

  async renameOrg(name: string): Promise<void> {
    this.mutate((data) => {
      data.org = { ...data.org, name };
    });
  }

  async savePolicy(
    input: Omit<PolicyRecord, 'orgId' | 'createdAt' | 'id'> & { id?: string },
  ): Promise<PolicyRecord> {
    return this.mutate((data) => {
      const existing = input.id ? data.policies.find((p) => p.id === input.id) : undefined;
      const record: PolicyRecord = {
        ...input,
        id: existing?.id ?? input.id ?? randomUUID(),
        orgId: data.org.id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      const index = data.policies.findIndex((p) => p.id === record.id);
      if (index >= 0) data.policies[index] = record;
      else data.policies.push(record);
      appendEvent(data, {
        actor: 'user',
        entityType: 'policy',
        entityId: record.id,
        action: existing ? 'update' : 'create',
        before: existing ?? null,
        after: record,
      });
      return record;
    });
  }

  async listPolicies(): Promise<readonly PolicyRecord[]> {
    return [...this.read().policies].sort((a, b) => b.termStart.localeCompare(a.termStart));
  }

  async saveClassCodeRate(
    input: Omit<ClassCodeRateRecord, 'id'> & { id?: string },
  ): Promise<ClassCodeRateRecord> {
    return this.mutate((data) => {
      const record: ClassCodeRateRecord = { ...input, id: input.id ?? randomUUID() };
      const index = data.classCodeRates.findIndex((rate) => rate.id === record.id);
      if (index >= 0) data.classCodeRates[index] = record;
      else data.classCodeRates.push(record);
      return record;
    });
  }

  async upsertSubcontractorsByName(
    names: readonly string[],
  ): Promise<readonly SubcontractorRecord[]> {
    return this.mutate((data) => {
      const created: SubcontractorRecord[] = [];
      for (const name of names) {
        const existing = data.subcontractors.find((sub) => sub.name === name);
        if (existing) {
          created.push(existing);
          continue;
        }
        const record: SubcontractorRecord = {
          id: randomUUID(),
          orgId: data.org.id,
          name,
          normalizedName: normalizeName(name),
          entityType: 'unknown',
          trade: null,
          triage: 'undecided',
          classCodeOverride: null,
          priorAuditRate: null,
          specialCategory: null,
          notes: null,
        };
        data.subcontractors.push(record);
        created.push(record);
      }
      return created;
    });
  }

  async setTriage(subcontractorId: string, triage: TriageDecision): Promise<void> {
    this.mutate((data) => {
      const index = data.subcontractors.findIndex((sub) => sub.id === subcontractorId);
      if (index < 0) return;
      const before = data.subcontractors[index]!;
      data.subcontractors[index] = { ...before, triage };
      appendEvent(data, {
        actor: 'user',
        entityType: 'subcontractor',
        entityId: subcontractorId,
        action: 'triage',
        before: { triage: before.triage },
        after: { triage },
      });
    });
  }

  async patchSubcontractor(
    subcontractorId: string,
    patch: Partial<
      Pick<SubcontractorRecord, 'entityType' | 'trade' | 'notes' | 'specialCategory' | 'priorAuditRate'>
    > & {
      classCodeRateId?: string | null;
    },
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.subcontractors.findIndex((sub) => sub.id === subcontractorId);
      if (index < 0) return;
      const before = data.subcontractors[index]!;
      const { classCodeRateId, ...rest } = patch;
      const override =
        classCodeRateId === undefined
          ? before.classCodeOverride
          : classCodeRateId === null
            ? null
            : rateToOverride(data, classCodeRateId);
      const after: SubcontractorRecord = { ...before, ...rest, classCodeOverride: override };
      data.subcontractors[index] = after;
      appendEvent(data, {
        actor: 'user',
        entityType: 'subcontractor',
        entityId: subcontractorId,
        action: 'update',
        before,
        after,
      });
    });
  }

  async createImportBatch(
    input: Omit<ImportBatchRecord, 'id' | 'orgId' | 'createdAt' | 'rolledBackAt'>,
    payments: readonly NewPayment[],
    rawCsv: string,
  ): Promise<ImportBatchRecord> {
    return this.mutate((data) => {
      const batch: ImportBatchRecord = {
        ...input,
        id: randomUUID(),
        orgId: data.org.id,
        createdAt: new Date().toISOString(),
        rolledBackAt: null,
      };
      data.batches.push(batch);
      data.rawImports[batch.id] = rawCsv;

      for (const payment of payments) {
        data.payments.push({
          id: randomUUID(),
          orgId: data.org.id,
          subcontractorId: payment.subcontractorId,
          paidOn: payment.paidOn,
          workFrom: payment.workFrom,
          workTo: payment.workTo,
          amount: payment.amount,
          sourceRef: payment.sourceRef,
          memo: payment.memo,
          materialAmount: null,
          materialEvidence: 'none',
          importedBatchId: batch.id,
        });
      }

      appendEvent(data, {
        actor: 'user',
        entityType: 'import_batch',
        entityId: batch.id,
        action: 'import',
        before: null,
        after: { importedCount: batch.importedCount, sourceFilename: batch.sourceFilename },
      });
      return batch;
    });
  }

  async rollbackImportBatch(batchId: string): Promise<void> {
    this.mutate((data) => {
      const index = data.batches.findIndex((batch) => batch.id === batchId);
      if (index < 0) return;
      const removed = data.payments.filter((p) => p.importedBatchId === batchId).length;
      data.payments = data.payments.filter((p) => p.importedBatchId !== batchId);
      data.batches[index] = { ...data.batches[index]!, rolledBackAt: new Date().toISOString() };
      appendEvent(data, {
        actor: 'user',
        entityType: 'import_batch',
        entityId: batchId,
        action: 'rollback',
        before: { paymentCount: removed },
        after: { paymentCount: 0 },
      });
    });
  }

  async setPaymentMaterialSplit(
    paymentId: string,
    materialAmount: number | null,
    materialEvidence: PaymentRecord['materialEvidence'],
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.payments.findIndex((payment) => payment.id === paymentId);
      if (index < 0) return;
      const before = data.payments[index]!;
      const after: PaymentRecord = {
        ...before,
        materialAmount: materialEvidence === 'none' ? null : materialAmount,
        materialEvidence,
      };
      data.payments[index] = after;
      appendEvent(data, {
        actor: 'user',
        entityType: 'payment',
        entityId: paymentId,
        action: 'material_split',
        before: { materialAmount: before.materialAmount, materialEvidence: before.materialEvidence },
        after: { materialAmount: after.materialAmount, materialEvidence: after.materialEvidence },
      });
    });
  }

  async setPaymentWorkPeriod(
    paymentId: string,
    workFrom: string | null,
    workTo: string | null,
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.payments.findIndex((payment) => payment.id === paymentId);
      if (index < 0) return;
      const before = data.payments[index]!;
      const after: PaymentRecord = { ...before, workFrom, workTo };
      data.payments[index] = after;
      appendEvent(data, {
        actor: 'user',
        entityType: 'payment',
        entityId: paymentId,
        action: 'work_period',
        before: { workFrom: before.workFrom, workTo: before.workTo },
        after: { workFrom, workTo },
      });
    });
  }

  async createCertificate(
    input: Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>,
  ): Promise<CertificateRecord> {
    return this.mutate((data) => {
      const record: CertificateRecord = {
        ...input,
        id: randomUUID(),
        orgId: data.org.id,
        createdAt: new Date().toISOString(),
      };
      data.certificates.push(record);
      appendEvent(data, {
        actor: input.rawExtraction ? 'extractor' : 'user',
        entityType: 'certificate',
        entityId: record.id,
        action: 'create',
        before: null,
        after: certificateFacts(record),
      });
      return record;
    });
  }

  async updateCertificate(
    certificateId: string,
    patch: Partial<Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>>,
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.certificates.findIndex((cert) => cert.id === certificateId);
      if (index < 0) return;
      const before = data.certificates[index]!;
      const after: CertificateRecord = {
        ...before,
        ...patch,
        normalizedNamedInsured:
          patch.namedInsured !== undefined
            ? patch.namedInsured === null
              ? null
              : normalizeName(patch.namedInsured)
            : before.normalizedNamedInsured,
      };
      data.certificates[index] = after;
      appendEvent(data, {
        actor: 'user',
        entityType: 'certificate',
        entityId: certificateId,
        action: 'update',
        before: certificateFacts(before),
        after: certificateFacts(after),
      });
    });
  }

  async matchCertificate(
    certificateId: string,
    subcontractorId: string | null,
    options: { saveAlias: boolean; method?: CertificateRecord['matchMethod'] },
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.certificates.findIndex((cert) => cert.id === certificateId);
      if (index < 0) return;
      const before = data.certificates[index]!;
      data.certificates[index] = {
        ...before,
        subcontractorId,
        matchMethod: subcontractorId === null ? 'unmatched' : (options.method ?? 'manual'),
        status: subcontractorId === null ? before.status : 'matched',
      };

      if (options.saveAlias && subcontractorId !== null && before.normalizedNamedInsured) {
        const sub = data.subcontractors.find((entry) => entry.id === subcontractorId);
        const alreadyKnown = data.aliases.some(
          (alias) => alias.normalizedAlias === before.normalizedNamedInsured,
        );
        if (sub && !alreadyKnown && before.normalizedNamedInsured !== sub.normalizedName) {
          data.aliases.push({
            id: randomUUID(),
            orgId: data.org.id,
            subcontractorId,
            alias: before.namedInsured ?? before.normalizedNamedInsured,
            normalizedAlias: before.normalizedNamedInsured,
          });
        }
      }

      appendEvent(data, {
        actor: 'user',
        entityType: 'certificate',
        entityId: certificateId,
        action: 'match',
        before: { subcontractorId: before.subcontractorId },
        after: { subcontractorId },
      });
    });
  }

  async listAliases(): Promise<readonly AliasRecord[]> {
    return this.read().aliases;
  }

  async replaceChaseItems(
    policyId: string,
    items: readonly Omit<ChaseItemRecord, 'id' | 'orgId'>[],
  ): Promise<void> {
    this.mutate((data) => {
      const existing = data.chaseItems.filter((item) => item.policyId === policyId);
      const kept = data.chaseItems.filter((item) => item.policyId !== policyId);
      const merged: ChaseItemRecord[] = [];

      for (const item of items) {
        // A chase item the user already worked keeps its identity and its history; only
        // an untouched proposal is refreshed against the current figures.
        const prior = existing.find(
          (candidate) =>
            candidate.subcontractorId === item.subcontractorId && candidate.ask === item.ask,
        );
        if (prior && prior.status !== 'open') {
          merged.push(prior);
          continue;
        }
        merged.push({ ...item, id: prior?.id ?? randomUUID(), orgId: data.org.id });
      }

      // Anything the user acted on stays on the list even if its exposure went to zero —
      // that is the record of dollars removed.
      for (const prior of existing) {
        if (prior.status === 'open') continue;
        if (merged.some((item) => item.id === prior.id)) continue;
        merged.push(prior);
      }

      data.chaseItems = [...kept, ...merged];
    });
  }

  async updateChaseItem(
    chaseItemId: string,
    patch: Partial<Omit<ChaseItemRecord, 'id' | 'orgId'>>,
  ): Promise<void> {
    this.mutate((data) => {
      const index = data.chaseItems.findIndex((item) => item.id === chaseItemId);
      if (index < 0) return;
      const before = data.chaseItems[index]!;
      const after = { ...before, ...patch };
      data.chaseItems[index] = after;
      appendEvent(data, {
        actor: 'user',
        entityType: 'chase_item',
        entityId: chaseItemId,
        action: patch.status ? `status:${patch.status}` : 'update',
        before: { status: before.status, exposureRemoved: before.exposureRemoved },
        after: { status: after.status, exposureRemoved: after.exposureRemoved },
      });
    });
  }

  async saveExposureSnapshot(
    portfolio: PortfolioExposure,
    reason: string,
  ): Promise<ExposureSnapshotRecord> {
    return this.mutate((data) => {
      const record: ExposureSnapshotRecord = {
        id: randomUUID(),
        orgId: data.org.id,
        policyId: portfolio.policyId,
        rulesetId: portfolio.provenance.rulesetId,
        rulesetVersion: portfolio.provenance.rulesetVersion,
        jurisdiction: portfolio.provenance.jurisdiction,
        ratingBureau: portfolio.provenance.ratingBureau,
        confidenceLevel: portfolio.confidence.level,
        totalExposure: portfolio.totalExposure,
        addedPayroll: portfolio.addedPayroll,
        surcharge: portfolio.auditNoncompliance.charge,
        reason,
        createdAt: portfolio.provenance.computedAt,
      };
      data.snapshots.push(record);
      appendEvent(data, {
        actor: 'system',
        entityType: 'exposure_snapshot',
        entityId: record.id,
        action: reason,
        before: null,
        after: {
          totalExposure: record.totalExposure,
          rulesetId: record.rulesetId,
          rulesetVersion: record.rulesetVersion,
          confidenceLevel: record.confidenceLevel,
        },
      });
      return record;
    });
  }

  async listExposureSnapshots(policyId: string): Promise<readonly ExposureSnapshotRecord[]> {
    return this.read()
      .snapshots.filter((snapshot) => snapshot.policyId === policyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendAuditEvent(event: Omit<AuditEventRecord, 'id' | 'orgId' | 'at'>): Promise<void> {
    this.mutate((data) => appendEvent(data, event));
  }

  async listAuditEvents(filter: { entityType?: string; entityId?: string } = {}): Promise<
    readonly AuditEventRecord[]
  > {
    return this.read()
      .auditEvents.filter(
        (event) =>
          (filter.entityType === undefined || event.entityType === filter.entityType) &&
          (filter.entityId === undefined || event.entityId === filter.entityId),
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }
}

function appendEvent(data: DemoFile, event: Omit<AuditEventRecord, 'id' | 'orgId' | 'at'>): void {
  data.auditEvents.push({
    ...event,
    id: randomUUID(),
    orgId: data.org.id,
    at: new Date().toISOString(),
  });
}

function rateToOverride(
  data: DemoFile,
  rateId: string,
): SubcontractorRecord['classCodeOverride'] {
  const rate = data.classCodeRates.find((entry) => entry.id === rateId);
  return rate ? { classCode: rate.classCode, rate: rate.rate } : null;
}

/** What an auditor would care about, without the whole model response in every event. */
function certificateFacts(record: CertificateRecord): Record<string, unknown> {
  return {
    namedInsured: record.namedInsured,
    status: record.status,
    wcPresent: record.wcPresent,
    wcEffective: record.wcEffective,
    wcExpiration: record.wcExpiration,
    wcOfficerExclusionNoted: record.wcOfficerExclusionNoted,
    extractionConfidenceThousandths: record.extractionConfidenceThousandths,
    matchMethod: record.matchMethod,
    evidence: record.evidence,
  };
}
