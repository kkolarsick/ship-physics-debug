/**
 * The Supabase implementation of `Store`.
 *
 * Column conventions match the migration: money is BIGINT cents in `*_cents` columns,
 * rates and factors are scaled integers, and calendar dates are DATE. Mapping happens
 * here and nowhere else, so the rest of the app only ever sees domain records.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
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

type Row = Record<string, unknown>;

export class SupabaseStore implements Store {
  constructor(
    private readonly client: SupabaseClient,
    private readonly orgId: string,
    private readonly actor: string,
  ) {}

  private async select(table: string, columns = '*'): Promise<Row[]> {
    const { data, error } = await this.client.from(table).select(columns).eq('org_id', this.orgId);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  async loadDataset(policyId?: string): Promise<Dataset> {
    const [orgRows, policyRows, rateRows, subRows, paymentRows, certRows, aliasRows, chaseRows, batchRows] =
      await Promise.all([
        this.client.from('orgs').select('*').eq('id', this.orgId).single(),
        this.select('policies'),
        this.select('class_code_rates'),
        this.select('subcontractors'),
        this.select('payments'),
        this.select('certificates'),
        this.select('subcontractor_aliases'),
        this.select('chase_items'),
        this.select('import_batches'),
      ]);

    if (orgRows.error) throw new Error(`orgs: ${orgRows.error.message}`);

    const policies = policyRows
      .map((row) => toPolicy(row))
      .sort((a, b) => b.termStart.localeCompare(a.termStart));
    const policy = policies.find((entry) => entry.id === policyId) ?? policies[0] ?? null;
    const rates = rateRows.map(toClassCodeRate);
    const rateById = new Map(rates.map((rate) => [rate.id, rate]));

    return {
      org: toOrg(orgRows.data as Row),
      policy,
      policies,
      classCodeRates: rates.filter((rate) => rate.policyId === policy?.id),
      subcontractors: subRows.map((row) => toSubcontractor(row, rateById)),
      payments: paymentRows.map(toPayment),
      certificates: certRows.map(toCertificate),
      aliases: aliasRows.map(toAlias),
      chaseItems: chaseRows.map(toChaseItem).filter((item) => item.policyId === policy?.id),
      batches: batchRows.map(toBatch).filter((batch) => batch.rolledBackAt === null),
    };
  }

  async getOrg(): Promise<OrgRecord> {
    const { data, error } = await this.client
      .from('orgs')
      .select('*')
      .eq('id', this.orgId)
      .single();
    if (error) throw new Error(`orgs: ${error.message}`);
    return toOrg(data as Row);
  }

  async renameOrg(name: string): Promise<void> {
    const { error } = await this.client.from('orgs').update({ name }).eq('id', this.orgId);
    if (error) throw new Error(`orgs: ${error.message}`);
  }

  async savePolicy(
    input: Omit<PolicyRecord, 'orgId' | 'createdAt' | 'id'> & { id?: string },
  ): Promise<PolicyRecord> {
    const before = input.id
      ? (await this.client.from('policies').select('*').eq('id', input.id).maybeSingle()).data
      : null;

    const payload = {
      ...(input.id ? { id: input.id } : {}),
      org_id: this.orgId,
      carrier_name: input.carrierName,
      policy_number: input.policyNumber,
      term_start: input.termStart,
      term_end: input.termEnd,
      experience_mod_thousandths: input.experienceMod,
      estimated_annual_premium_cents: input.estimatedAnnualPremium,
      noncompliance_surcharge_pct_ten_thousandths: input.noncomplianceSurchargePct,
      governing_class_code: input.governingClassCode,
      governing_rate_ten_thousandths: input.governingRate,
    };

    const { data, error } = await this.client
      .from('policies')
      .upsert(payload)
      .select('*')
      .single();
    if (error) throw new Error(`policies: ${error.message}`);

    const record = toPolicy(data as Row);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'policy',
      entityId: record.id,
      action: before ? 'update' : 'create',
      before,
      after: data,
    });
    return record;
  }

  async listPolicies(): Promise<readonly PolicyRecord[]> {
    return (await this.select('policies'))
      .map(toPolicy)
      .sort((a, b) => b.termStart.localeCompare(a.termStart));
  }

  async saveClassCodeRate(
    input: Omit<ClassCodeRateRecord, 'id'> & { id?: string },
  ): Promise<ClassCodeRateRecord> {
    const { data, error } = await this.client
      .from('class_code_rates')
      .upsert({
        ...(input.id ? { id: input.id } : {}),
        org_id: this.orgId,
        policy_id: input.policyId,
        class_code: input.classCode,
        rate_ten_thousandths: input.rate,
        label: input.label,
      })
      .select('*')
      .single();
    if (error) throw new Error(`class_code_rates: ${error.message}`);
    return toClassCodeRate(data as Row);
  }

  async upsertSubcontractorsByName(
    names: readonly string[],
  ): Promise<readonly SubcontractorRecord[]> {
    if (names.length === 0) return [];
    const payload = names.map((name) => ({
      org_id: this.orgId,
      name,
      normalized_name: normalizeName(name),
    }));
    const { error } = await this.client
      .from('subcontractors')
      .upsert(payload, { onConflict: 'org_id,name', ignoreDuplicates: true });
    if (error) throw new Error(`subcontractors: ${error.message}`);

    const { data, error: readError } = await this.client
      .from('subcontractors')
      .select('*')
      .eq('org_id', this.orgId)
      .in('name', [...names]);
    if (readError) throw new Error(`subcontractors: ${readError.message}`);
    return ((data ?? []) as Row[]).map((row) => toSubcontractor(row, new Map()));
  }

  async setTriage(subcontractorId: string, triage: TriageDecision): Promise<void> {
    const before = (
      await this.client.from('subcontractors').select('triage').eq('id', subcontractorId).single()
    ).data;
    const { error } = await this.client
      .from('subcontractors')
      .update({ triage })
      .eq('id', subcontractorId);
    if (error) throw new Error(`subcontractors: ${error.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'subcontractor',
      entityId: subcontractorId,
      action: 'triage',
      before,
      after: { triage },
    });
  }

  async patchSubcontractor(
    subcontractorId: string,
    patch: Partial<Pick<SubcontractorRecord, 'entityType' | 'trade' | 'notes'>> & {
      classCodeRateId?: string | null;
    },
  ): Promise<void> {
    const update: Row = {};
    if (patch.entityType !== undefined) update.entity_type = patch.entityType;
    if (patch.trade !== undefined) update.trade = patch.trade;
    if (patch.notes !== undefined) update.notes = patch.notes;
    if (patch.classCodeRateId !== undefined) update.class_code_override_id = patch.classCodeRateId;
    if (Object.keys(update).length === 0) return;

    const before = (
      await this.client.from('subcontractors').select('*').eq('id', subcontractorId).single()
    ).data;
    const { error } = await this.client
      .from('subcontractors')
      .update(update)
      .eq('id', subcontractorId);
    if (error) throw new Error(`subcontractors: ${error.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'subcontractor',
      entityId: subcontractorId,
      action: 'update',
      before,
      after: update,
    });
  }

  async createImportBatch(
    input: Omit<ImportBatchRecord, 'id' | 'orgId' | 'createdAt' | 'rolledBackAt'>,
    payments: readonly NewPayment[],
    rawCsv: string,
  ): Promise<ImportBatchRecord> {
    // The source file is stored before anything is derived from it, so the raw ledger is
    // never lost even if the import itself fails partway.
    const storagePath = `${this.orgId}/${crypto.randomUUID()}.csv`;
    const upload = await this.client.storage
      .from('ledger-imports')
      .upload(storagePath, new Blob([rawCsv], { type: 'text/csv' }), { upsert: false });
    if (upload.error) throw new Error(`ledger-imports: ${upload.error.message}`);

    const { data, error } = await this.client
      .from('import_batches')
      .insert({
        org_id: this.orgId,
        policy_id: input.policyId,
        source_filename: input.sourceFilename,
        storage_path: storagePath,
        preset: input.preset,
        column_mapping: input.columnMapping,
        row_count: input.rowCount,
        imported_count: input.importedCount,
        excluded: input.excluded,
      })
      .select('*')
      .single();
    if (error) throw new Error(`import_batches: ${error.message}`);

    const batch = toBatch(data as Row);
    if (payments.length > 0) {
      const { error: paymentError } = await this.client.from('payments').insert(
        payments.map((payment) => ({
          org_id: this.orgId,
          subcontractor_id: payment.subcontractorId,
          paid_on: payment.paidOn,
          amount_cents: payment.amount,
          source_ref: payment.sourceRef,
          imported_batch_id: batch.id,
        })),
      );
      if (paymentError) throw new Error(`payments: ${paymentError.message}`);
    }

    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'import_batch',
      entityId: batch.id,
      action: 'import',
      before: null,
      after: { importedCount: batch.importedCount, storagePath },
    });
    return batch;
  }

  async rollbackImportBatch(batchId: string): Promise<void> {
    const { error } = await this.client.from('payments').delete().eq('imported_batch_id', batchId);
    if (error) throw new Error(`payments: ${error.message}`);
    const { error: batchError } = await this.client
      .from('import_batches')
      .update({ rolled_back_at: new Date().toISOString() })
      .eq('id', batchId);
    if (batchError) throw new Error(`import_batches: ${batchError.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'import_batch',
      entityId: batchId,
      action: 'rollback',
      before: null,
      after: null,
    });
  }

  async setPaymentMaterialSplit(
    paymentId: string,
    materialAmount: number | null,
    materialEvidence: PaymentRecord['materialEvidence'],
  ): Promise<void> {
    const before = (
      await this.client
        .from('payments')
        .select('material_amount_cents, material_evidence')
        .eq('id', paymentId)
        .single()
    ).data;
    const { error } = await this.client
      .from('payments')
      .update({
        material_amount_cents: materialEvidence === 'none' ? null : materialAmount,
        material_evidence: materialEvidence,
      })
      .eq('id', paymentId);
    if (error) throw new Error(`payments: ${error.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'payment',
      entityId: paymentId,
      action: 'material_split',
      before,
      after: { material_amount_cents: materialAmount, material_evidence: materialEvidence },
    });
  }

  async createCertificate(
    input: Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>,
  ): Promise<CertificateRecord> {
    const { data, error } = await this.client
      .from('certificates')
      .insert(certificatePayload(input, this.orgId))
      .select('*')
      .single();
    if (error) throw new Error(`certificates: ${error.message}`);
    const record = toCertificate(data as Row);
    await this.appendAuditEvent({
      actor: input.rawExtraction ? 'extractor' : this.actor,
      entityType: 'certificate',
      entityId: record.id,
      action: 'create',
      before: null,
      after: data,
    });
    return record;
  }

  async updateCertificate(
    certificateId: string,
    patch: Partial<Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>>,
  ): Promise<void> {
    const before = (
      await this.client.from('certificates').select('*').eq('id', certificateId).single()
    ).data;
    const payload = certificatePayload(patch, this.orgId, { partial: true });
    const { error } = await this.client
      .from('certificates')
      .update(payload)
      .eq('id', certificateId);
    if (error) throw new Error(`certificates: ${error.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'certificate',
      entityId: certificateId,
      action: 'update',
      before,
      after: payload,
    });
  }

  async matchCertificate(
    certificateId: string,
    subcontractorId: string | null,
    options: { saveAlias: boolean },
  ): Promise<void> {
    const { data: before, error: readError } = await this.client
      .from('certificates')
      .select('*')
      .eq('id', certificateId)
      .single();
    if (readError) throw new Error(`certificates: ${readError.message}`);

    const { error } = await this.client
      .from('certificates')
      .update({
        subcontractor_id: subcontractorId,
        ...(subcontractorId === null ? {} : { status: 'matched' }),
      })
      .eq('id', certificateId);
    if (error) throw new Error(`certificates: ${error.message}`);

    const normalized = (before as Row).normalized_named_insured;
    if (options.saveAlias && subcontractorId !== null && typeof normalized === 'string') {
      await this.client.from('subcontractor_aliases').upsert(
        {
          org_id: this.orgId,
          subcontractor_id: subcontractorId,
          alias: String((before as Row).named_insured ?? normalized),
          normalized_alias: normalized,
        },
        { onConflict: 'org_id,normalized_alias', ignoreDuplicates: true },
      );
    }

    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'certificate',
      entityId: certificateId,
      action: 'match',
      before: { subcontractor_id: (before as Row).subcontractor_id },
      after: { subcontractor_id: subcontractorId },
    });
  }

  async listAliases(): Promise<readonly AliasRecord[]> {
    return (await this.select('subcontractor_aliases')).map(toAlias);
  }

  async replaceChaseItems(
    policyId: string,
    items: readonly Omit<ChaseItemRecord, 'id' | 'orgId'>[],
  ): Promise<void> {
    if (items.length === 0) return;
    // The unique key is (policy, sub, ask); a worked item keeps its status and history.
    const { error } = await this.client.from('chase_items').upsert(
      items.map((item) => ({
        org_id: this.orgId,
        policy_id: policyId,
        subcontractor_id: item.subcontractorId,
        ask: item.ask,
        exposure_cents_at_open: item.exposureAtOpen,
        ruleset_version: item.rulesetVersion,
      })),
      { onConflict: 'policy_id,subcontractor_id,ask', ignoreDuplicates: true },
    );
    if (error) throw new Error(`chase_items: ${error.message}`);
  }

  async updateChaseItem(
    chaseItemId: string,
    patch: Partial<Omit<ChaseItemRecord, 'id' | 'orgId'>>,
  ): Promise<void> {
    const update: Row = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.sentTo !== undefined) update.sent_to = patch.sentTo;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.body !== undefined) update.body = patch.body;
    if (patch.sentAt !== undefined) update.sent_at = patch.sentAt;
    if (patch.respondedAt !== undefined) update.responded_at = patch.respondedAt;
    if (patch.resolvedAt !== undefined) update.resolved_at = patch.resolvedAt;
    if (patch.resolutionNote !== undefined) update.resolution_note = patch.resolutionNote;
    if (patch.exposureRemoved !== undefined) update.exposure_cents_removed = patch.exposureRemoved;
    if (Object.keys(update).length === 0) return;

    const before = (
      await this.client.from('chase_items').select('*').eq('id', chaseItemId).single()
    ).data;
    const { error } = await this.client.from('chase_items').update(update).eq('id', chaseItemId);
    if (error) throw new Error(`chase_items: ${error.message}`);
    await this.appendAuditEvent({
      actor: this.actor,
      entityType: 'chase_item',
      entityId: chaseItemId,
      action: patch.status ? `status:${patch.status}` : 'update',
      before,
      after: update,
    });
  }

  async saveExposureSnapshot(
    portfolio: PortfolioExposure,
    reason: string,
  ): Promise<ExposureSnapshotRecord> {
    const { data, error } = await this.client
      .from('exposure_snapshots')
      .insert({
        org_id: this.orgId,
        policy_id: portfolio.policyId,
        ruleset_version: portfolio.rulesetVersion,
        total_exposure_cents: portfolio.totalExposure,
        added_payroll_cents: portfolio.addedPayroll,
        surcharge_cents: portfolio.surcharge,
        detail: portfolio.subs,
        reason,
      })
      .select('*')
      .single();
    if (error) throw new Error(`exposure_snapshots: ${error.message}`);
    return toSnapshot(data as Row);
  }

  async listExposureSnapshots(policyId: string): Promise<readonly ExposureSnapshotRecord[]> {
    const { data, error } = await this.client
      .from('exposure_snapshots')
      .select('*')
      .eq('org_id', this.orgId)
      .eq('policy_id', policyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`exposure_snapshots: ${error.message}`);
    return ((data ?? []) as Row[]).map(toSnapshot);
  }

  async appendAuditEvent(event: Omit<AuditEventRecord, 'id' | 'orgId' | 'at'>): Promise<void> {
    const { error } = await this.client.from('audit_events').insert({
      org_id: this.orgId,
      actor: event.actor,
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action,
      before: event.before ?? null,
      after: event.after ?? null,
    });
    if (error) throw new Error(`audit_events: ${error.message}`);
  }

  async listAuditEvents(
    filter: { entityType?: string; entityId?: string } = {},
  ): Promise<readonly AuditEventRecord[]> {
    let query = this.client
      .from('audit_events')
      .select('*')
      .eq('org_id', this.orgId)
      .order('at', { ascending: false })
      .limit(500);
    if (filter.entityType) query = query.eq('entity_type', filter.entityType);
    if (filter.entityId) query = query.eq('entity_id', filter.entityId);
    const { data, error } = await query;
    if (error) throw new Error(`audit_events: ${error.message}`);
    return ((data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      orgId: String(row.org_id),
      actor: String(row.actor),
      entityType: String(row.entity_type),
      entityId: row.entity_id === null ? null : String(row.entity_id),
      action: String(row.action),
      before: row.before,
      after: row.after,
      at: String(row.at),
    }));
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : value === null || value === undefined ? fallback : Number(value);
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function toOrg(row: Row): OrgRecord {
  return { id: String(row.id), name: String(row.name), fiscalYearEnd: str(row.fiscal_year_end) };
}

function toPolicy(row: Row): PolicyRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    carrierName: str(row.carrier_name),
    policyNumber: str(row.policy_number),
    termStart: String(row.term_start),
    termEnd: String(row.term_end),
    experienceMod: num(row.experience_mod_thousandths, 1000),
    estimatedAnnualPremium: num(row.estimated_annual_premium_cents),
    noncomplianceSurchargePct: num(row.noncompliance_surcharge_pct_ten_thousandths),
    governingClassCode: String(row.governing_class_code ?? ''),
    governingRate: num(row.governing_rate_ten_thousandths),
    createdAt: String(row.created_at),
  };
}

function toClassCodeRate(row: Row): ClassCodeRateRecord {
  return {
    id: String(row.id),
    policyId: String(row.policy_id),
    classCode: String(row.class_code),
    rate: num(row.rate_ten_thousandths),
    label: str(row.label),
  };
}

function toSubcontractor(
  row: Row,
  rateById: ReadonlyMap<string, ClassCodeRateRecord>,
): SubcontractorRecord {
  const overrideId = str(row.class_code_override_id);
  const override = overrideId ? rateById.get(overrideId) : undefined;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    entityType: (row.entity_type as SubcontractorRecord['entityType']) ?? 'unknown',
    trade: str(row.trade),
    triage: (row.triage as SubcontractorRecord['triage']) ?? 'undecided',
    classCodeOverride: override ? { classCode: override.classCode, rate: override.rate } : null,
    notes: str(row.notes),
  };
}

function toPayment(row: Row): PaymentRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subcontractorId: String(row.subcontractor_id),
    paidOn: String(row.paid_on),
    amount: num(row.amount_cents),
    sourceRef: str(row.source_ref),
    memo: null,
    materialAmount: row.material_amount_cents === null ? null : num(row.material_amount_cents),
    materialEvidence: (row.material_evidence as PaymentRecord['materialEvidence']) ?? 'none',
    importedBatchId: str(row.imported_batch_id),
  };
}

function toCertificate(row: Row): CertificateRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subcontractorId: str(row.subcontractor_id),
    status: (row.status as CertificateRecord['status']) ?? 'pending',
    filePath: String(row.file_path ?? ''),
    originalFilename: str(row.original_filename),
    namedInsured: str(row.named_insured),
    normalizedNamedInsured: str(row.normalized_named_insured),
    producerName: str(row.producer_name),
    producerEmail: str(row.producer_email),
    producerPhone: str(row.producer_phone),
    wcPresent: Boolean(row.wc_present),
    wcCarrier: str(row.wc_carrier),
    wcPolicyNumber: str(row.wc_policy_number),
    wcEffective: str(row.wc_effective),
    wcExpiration: str(row.wc_expiration),
    wcOfficerExclusionNoted: Boolean(row.wc_officer_exclusion_noted),
    glPresent: Boolean(row.gl_present),
    certificateHolder: str(row.certificate_holder),
    descriptionOfOperations: str(row.description_of_operations),
    extractionConfidenceThousandths:
      row.extraction_confidence_thousandths === null
        ? null
        : num(row.extraction_confidence_thousandths),
    extractionError: str(row.extraction_error),
    rawExtraction: row.raw_extraction ?? null,
    reviewedByUserAt: str(row.reviewed_by_user_at),
    createdAt: String(row.created_at),
  };
}

function certificatePayload(
  input: Partial<Omit<CertificateRecord, 'id' | 'orgId' | 'createdAt'>>,
  orgId: string,
  options: { partial?: boolean } = {},
): Row {
  const payload: Row = options.partial ? {} : { org_id: orgId };
  const set = (key: string, value: unknown): void => {
    if (value !== undefined) payload[key] = value;
  };
  set('subcontractor_id', input.subcontractorId);
  set('status', input.status);
  set('file_path', input.filePath);
  set('original_filename', input.originalFilename);
  set('named_insured', input.namedInsured);
  if (input.namedInsured !== undefined) {
    payload.normalized_named_insured =
      input.namedInsured === null ? null : normalizeName(input.namedInsured);
  }
  set('producer_name', input.producerName);
  set('producer_email', input.producerEmail);
  set('producer_phone', input.producerPhone);
  set('wc_present', input.wcPresent);
  set('wc_carrier', input.wcCarrier);
  set('wc_policy_number', input.wcPolicyNumber);
  set('wc_effective', input.wcEffective);
  set('wc_expiration', input.wcExpiration);
  set('wc_officer_exclusion_noted', input.wcOfficerExclusionNoted);
  set('gl_present', input.glPresent);
  set('certificate_holder', input.certificateHolder);
  set('description_of_operations', input.descriptionOfOperations);
  set('extraction_confidence_thousandths', input.extractionConfidenceThousandths);
  set('extraction_error', input.extractionError);
  set('raw_extraction', input.rawExtraction);
  set('reviewed_by_user_at', input.reviewedByUserAt);
  return payload;
}

function toAlias(row: Row): AliasRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    subcontractorId: String(row.subcontractor_id),
    alias: String(row.alias),
    normalizedAlias: String(row.normalized_alias),
  };
}

function toBatch(row: Row): ImportBatchRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    policyId: str(row.policy_id),
    sourceFilename: String(row.source_filename),
    storagePath: str(row.storage_path),
    preset: str(row.preset),
    columnMapping: (row.column_mapping as Record<string, string>) ?? {},
    rowCount: num(row.row_count),
    importedCount: num(row.imported_count),
    excluded: (row.excluded as Record<string, number>) ?? {},
    createdAt: String(row.created_at),
    rolledBackAt: str(row.rolled_back_at),
  };
}

function toChaseItem(row: Row): ChaseItemRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    policyId: String(row.policy_id),
    subcontractorId: String(row.subcontractor_id),
    subcontractorName: '',
    ask: row.ask as ChaseItemRecord['ask'],
    exposureAtOpen: num(row.exposure_cents_at_open),
    status: row.status as ChaseItemRecord['status'],
    sentTo: str(row.sent_to),
    subject: str(row.subject),
    body: str(row.body),
    sentAt: str(row.sent_at),
    respondedAt: str(row.responded_at),
    resolvedAt: str(row.resolved_at),
    resolutionNote: str(row.resolution_note),
    exposureRemoved:
      row.exposure_cents_removed === null ? null : num(row.exposure_cents_removed),
    rulesetVersion: String(row.ruleset_version),
  };
}

function toSnapshot(row: Row): ExposureSnapshotRecord {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    policyId: String(row.policy_id),
    rulesetVersion: String(row.ruleset_version),
    totalExposure: num(row.total_exposure_cents),
    addedPayroll: num(row.added_payroll_cents),
    surcharge: num(row.surcharge_cents),
    reason: str(row.reason),
    createdAt: String(row.created_at),
  };
}
