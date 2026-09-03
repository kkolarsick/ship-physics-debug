'use server';

/**
 * Server actions.
 *
 * Every one of these validates its input with Zod before touching the store, and every
 * one that changes a number writes an audit event — the output of this tool gets handed
 * to a carrier's auditor in a dispute, so a figure that changed without a trace is worse
 * than no figure at all.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { RULESET } from '@/lib/exposure/ruleset';
import { computePortfolioExposure } from '@/lib/exposure/compute';
import { buildImportPreview, sniffTable } from '@/lib/ingest/csv';
import { normalizeName } from '@/lib/matching/normalize';
import { proposeChaseItems } from '@/lib/chase/rank';
import { getStore } from '@/lib/db';
import {
  chaseDraftSchema,
  chaseResolveSchema,
  importRequestSchema,
  manualCertificateSchema,
  matchConfirmSchema,
  materialSplitSchema,
  policyFormSchema,
  subcontractorPatchSchema,
  triageRequestSchema,
} from '@/lib/schemas';
import { sendChaseEmail } from '@/lib/chase/send';

export interface ActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Record<string, string>;
}

const ok: ActionResult = { ok: true };

function fail(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, message: 'Check the highlighted fields.', fieldErrors };
}

function refreshAll(): void {
  for (const path of ['/', '/subs', '/chase', '/certificates', '/triage', '/import', '/export', '/setup']) {
    revalidatePath(path);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function savePolicyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = policyFormSchema.safeParse({
    carrierName: String(formData.get('carrierName') ?? ''),
    policyNumber: String(formData.get('policyNumber') ?? ''),
    termStart: String(formData.get('termStart') ?? ''),
    termEnd: String(formData.get('termEnd') ?? ''),
    governingClassCode: String(formData.get('governingClassCode') ?? ''),
    governingRate: String(formData.get('governingRate') ?? ''),
    experienceMod: String(formData.get('experienceMod') ?? ''),
    estimatedAnnualPremium: String(formData.get('estimatedAnnualPremium') ?? ''),
    noncomplianceSurchargePct: String(formData.get('noncomplianceSurchargePct') ?? '0'),
  });
  if (!parsed.success) return fail(parsed.error);

  const store = await getStore();
  const orgName = String(formData.get('orgName') ?? '').trim();
  if (orgName !== '') await store.renameOrg(orgName);

  const policyId = String(formData.get('policyId') ?? '').trim();
  await store.savePolicy({
    ...(policyId === '' ? {} : { id: policyId }),
    carrierName: parsed.data.carrierName,
    policyNumber: parsed.data.policyNumber,
    termStart: parsed.data.termStart,
    termEnd: parsed.data.termEnd,
    experienceMod: parsed.data.experienceMod,
    estimatedAnnualPremium: parsed.data.estimatedAnnualPremium,
    noncomplianceSurchargePct: parsed.data.noncomplianceSurchargePct,
    governingClassCode: parsed.data.governingClassCode,
    governingRate: parsed.data.governingRate,
  });

  refreshAll();
  return { ok: true, message: 'Policy term saved.' };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * The client previews the import with the same pure functions, but the figures that get
 * written are recomputed here from the raw CSV. Nothing the browser calculated is trusted.
 */
export async function importLedgerAction(input: unknown): Promise<ActionResult> {
  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);

  const store = await getStore();
  const data = await store.loadDataset(parsed.data.policyId);
  if (!data.policy) return { ok: false, message: 'Set up a policy term first.' };

  const table = sniffTable(parsed.data.csv);
  const preview = buildImportPreview({
    table,
    mapping: parsed.data.mapping,
    termStart: data.policy.termStart,
    termEnd: data.policy.termEnd,
  });

  if (preview.payments.length === 0) {
    return { ok: false, message: 'No rows in this file fall inside the policy term.' };
  }

  const subs = await store.upsertSubcontractorsByName(
    preview.vendors.map((vendor) => vendor.vendorName),
  );
  const idByName = new Map(subs.map((sub) => [sub.name, sub.id]));

  await store.createImportBatch(
    {
      policyId: data.policy.id,
      sourceFilename: parsed.data.filename,
      storagePath: null,
      preset: parsed.data.preset,
      columnMapping: parsed.data.mapping,
      rowCount: preview.totalRows,
      importedCount: preview.payments.length,
      excluded: preview.excludedCounts,
    },
    preview.payments.flatMap((payment) => {
      const subcontractorId = idByName.get(payment.vendorName);
      return subcontractorId
        ? [
            {
              subcontractorId,
              paidOn: payment.paidOn,
              amount: payment.amount,
              sourceRef: payment.sourceRef,
              memo: payment.memo,
            },
          ]
        : [];
    }),
    parsed.data.csv,
  );

  refreshAll();
  return {
    ok: true,
    message: `Imported ${preview.payments.length} payments across ${preview.vendors.length} vendors.`,
  };
}

export async function rollbackImportAction(batchId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(batchId);
  if (!parsed.success) return fail(parsed.error);
  const store = await getStore();
  await store.rollbackImportBatch(parsed.data);
  refreshAll();
  return { ok: true, message: 'Import rolled back.' };
}

// ---------------------------------------------------------------------------
// Triage and subcontractor detail
// ---------------------------------------------------------------------------

export async function setTriageAction(input: unknown): Promise<ActionResult> {
  const parsed = triageRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const store = await getStore();
  await store.setTriage(parsed.data.subcontractorId, parsed.data.triage);
  refreshAll();
  return ok;
}

export async function patchSubcontractorAction(input: unknown): Promise<ActionResult> {
  const parsed = subcontractorPatchSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const { subcontractorId, classCodeRateId, ...patch } = parsed.data;
  const store = await getStore();
  await store.patchSubcontractor(subcontractorId, {
    ...patch,
    ...(classCodeRateId === undefined ? {} : { classCodeRateId }),
  });
  refreshAll();
  return ok;
}

export async function setMaterialSplitAction(input: unknown): Promise<ActionResult> {
  const parsed = materialSplitSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const store = await getStore();
  await store.setPaymentMaterialSplit(
    parsed.data.paymentId,
    parsed.data.materialAmount,
    parsed.data.materialEvidence,
  );
  refreshAll();
  return ok;
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/**
 * Manual coverage entry. This is the path that works at build-order step 2, before PDF
 * extraction exists — and the path the review queue writes through when a human corrects
 * a low-confidence reading.
 */
export async function saveManualCertificateAction(input: unknown): Promise<ActionResult> {
  const parsed = manualCertificateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);

  const store = await getStore();
  const data = await store.loadDataset();
  const sub = data.subcontractors.find((entry) => entry.id === parsed.data.subcontractorId);
  if (!sub) return { ok: false, message: 'That subcontractor no longer exists.' };

  await store.createCertificate({
    subcontractorId: parsed.data.subcontractorId,
    status: 'matched',
    filePath: '',
    originalFilename: null,
    namedInsured: parsed.data.namedInsured,
    normalizedNamedInsured: normalizeName(parsed.data.namedInsured),
    producerName: null,
    producerEmail: null,
    producerPhone: null,
    wcPresent: parsed.data.wcPresent,
    wcCarrier: parsed.data.wcCarrier ?? null,
    wcPolicyNumber: parsed.data.wcPolicyNumber ?? null,
    wcEffective: parsed.data.wcEffective,
    wcExpiration: parsed.data.wcExpiration,
    wcOfficerExclusionNoted: parsed.data.wcOfficerExclusionNoted,
    glPresent: parsed.data.glPresent,
    certificateHolder: null,
    descriptionOfOperations: null,
    extractionConfidenceThousandths: null,
    extractionError: null,
    rawExtraction: null,
    reviewedByUserAt: new Date().toISOString(),
  });

  refreshAll();
  return { ok: true, message: 'Coverage dates recorded.' };
}

export async function reviewCertificateAction(input: unknown): Promise<ActionResult> {
  const schema = manualCertificateSchema.safeParse(input);
  const idParsed = z
    .object({ certificateId: z.string().uuid() })
    .safeParse(input);
  if (!schema.success) return fail(schema.error);
  if (!idParsed.success) return fail(idParsed.error);

  const store = await getStore();
  await store.updateCertificate(idParsed.data.certificateId, {
    subcontractorId: schema.data.subcontractorId,
    namedInsured: schema.data.namedInsured,
    wcPresent: schema.data.wcPresent,
    wcCarrier: schema.data.wcCarrier ?? null,
    wcPolicyNumber: schema.data.wcPolicyNumber ?? null,
    wcEffective: schema.data.wcEffective,
    wcExpiration: schema.data.wcExpiration,
    wcOfficerExclusionNoted: schema.data.wcOfficerExclusionNoted,
    glPresent: schema.data.glPresent,
    status: 'matched',
    reviewedByUserAt: new Date().toISOString(),
  });

  refreshAll();
  return { ok: true, message: 'Certificate reviewed.' };
}

export async function matchCertificateAction(input: unknown): Promise<ActionResult> {
  const parsed = matchConfirmSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);
  const store = await getStore();
  await store.matchCertificate(parsed.data.certificateId, parsed.data.subcontractorId, {
    saveAlias: parsed.data.saveAlias,
  });
  refreshAll();
  return ok;
}

export async function rejectCertificateAction(certificateId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(certificateId);
  if (!parsed.success) return fail(parsed.error);
  const store = await getStore();
  await store.updateCertificate(parsed.data, { status: 'rejected' });
  refreshAll();
  return ok;
}

// ---------------------------------------------------------------------------
// Chase loop
// ---------------------------------------------------------------------------

/** Refresh the chase list against the current figures, keeping anything already worked. */
export async function refreshChaseListAction(): Promise<ActionResult> {
  const store = await getStore();
  const data = await store.loadDataset();
  if (!data.policy) return { ok: false, message: 'Set up a policy term first.' };

  const portfolio = computePortfolioExposure(
    data.subcontractors,
    data.payments,
    data.certificates,
    data.policy,
  );

  const producerEmailBySub: Record<string, string | null> = {};
  for (const certificate of data.certificates) {
    if (certificate.subcontractorId && certificate.producerEmail) {
      producerEmailBySub[certificate.subcontractorId] ??= certificate.producerEmail;
    }
  }

  const proposals = proposeChaseItems(portfolio.subs, { producerEmailBySub });
  await store.replaceChaseItems(
    data.policy.id,
    proposals.map((proposal) => ({
      policyId: data.policy!.id,
      subcontractorId: proposal.subcontractorId,
      subcontractorName: proposal.subcontractorName,
      ask: proposal.ask,
      exposureAtOpen: proposal.exposureAtOpen,
      status: 'open' as const,
      sentTo: null,
      subject: null,
      body: null,
      sentAt: null,
      respondedAt: null,
      resolvedAt: null,
      resolutionNote: null,
      exposureRemoved: null,
      rulesetVersion: RULESET.version,
    })),
  );

  refreshAll();
  return { ok: true, message: `${proposals.length} asks worth making.` };
}

/** Nothing sends without the user reviewing the draft (brief §7). */
export async function sendChaseEmailAction(input: unknown): Promise<ActionResult> {
  const parsed = chaseDraftSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);

  const store = await getStore();
  const result = await sendChaseEmail({
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });

  await store.updateChaseItem(parsed.data.chaseItemId, {
    status: 'sent',
    sentTo: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
    sentAt: new Date().toISOString(),
  });

  refreshAll();
  return { ok: true, message: result.message };
}

/**
 * Resolving an item recomputes the exposure rather than trusting the snapshot, so
 * "dollars removed" is the difference the documents actually made.
 */
export async function resolveChaseItemAction(input: unknown): Promise<ActionResult> {
  const parsed = chaseResolveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error);

  const store = await getStore();
  const data = await store.loadDataset();
  const item = data.chaseItems.find((entry) => entry.id === parsed.data.chaseItemId);
  if (!item) return { ok: false, message: 'That chase item no longer exists.' };

  let exposureRemoved: number | null = null;
  if (parsed.data.status === 'resolved' && data.policy) {
    const portfolio = computePortfolioExposure(
      data.subcontractors,
      data.payments,
      data.certificates,
      data.policy,
    );
    const now = portfolio.subs.find((sub) => sub.subcontractorId === item.subcontractorId);
    exposureRemoved = Math.max(0, item.exposureAtOpen - (now?.addedPremium ?? 0));
  }

  await store.updateChaseItem(parsed.data.chaseItemId, {
    status: parsed.data.status,
    resolutionNote: parsed.data.resolutionNote ?? null,
    ...(parsed.data.status === 'responded' ? { respondedAt: new Date().toISOString() } : {}),
    ...(parsed.data.status === 'resolved'
      ? { resolvedAt: new Date().toISOString(), exposureRemoved }
      : {}),
  });

  refreshAll();
  return ok;
}
