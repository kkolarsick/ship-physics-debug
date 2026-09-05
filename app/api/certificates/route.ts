import { after, NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { storeDocument } from '@/lib/storage';
import { extractCertificate } from '@/lib/extraction/extract';
import { mediaTypeForFilename } from '@/lib/extraction/documents';
import { normalizeName } from '@/lib/matching/normalize';
import { rankCandidates, AUTO_MATCH_THRESHOLD } from '@/lib/matching/similarity';

export const maxDuration = 300;

/**
 * Certificate upload and extraction (brief §4b).
 *
 * The file is stored and a row is created immediately, so nothing is lost if extraction
 * fails or times out. Extraction then runs after the response, and the client polls
 * `/api/certificates/status` — no queue, no Redis, one moving part.
 */
export async function POST(request: Request) {
  const store = await getStore();
  const data = await store.loadDataset();
  const form = await request.formData();
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'no files uploaded' }, { status: 400 });
  }

  const created: { id: string; filename: string }[] = [];

  for (const file of files) {
    const mediaType = mediaTypeForFilename(file.name);
    if (mediaType === null) {
      return NextResponse.json(
        { error: `${file.name} is not a PDF or an image` },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = await storeDocument('certificates', data.org.id, file.name, bytes, mediaType);

    const record = await store.createCertificate({
      subcontractorId: null,
      status: 'pending',
      filePath: path,
      originalFilename: file.name,
      namedInsured: null,
      normalizedNamedInsured: null,
      producerName: null,
      producerEmail: null,
      producerPhone: null,
      wcPresent: false,
      wcCarrier: null,
      wcPolicyNumber: null,
      wcEffective: null,
      wcExpiration: null,
      wcOfficerExclusionNoted: false,
      glPresent: false,
      certificateHolder: null,
      descriptionOfOperations: null,
      extractionConfidenceThousandths: null,
      extractionError: null,
      rawExtraction: null,
      reviewedByUserAt: null,
      evidence: 'model_extracted',
      matchMethod: 'unmatched',
    });

    created.push({ id: record.id, filename: file.name });

    after(async () => {
      await runExtraction(record.id, bytes, file.name);
    });
  }

  return NextResponse.json({ certificates: created });
}

async function runExtraction(
  certificateId: string,
  bytes: Uint8Array,
  filename: string,
): Promise<void> {
  const store = await getStore();
  const result = await extractCertificate(bytes, filename);

  if (!result.ok) {
    await store.updateCertificate(certificateId, {
      status: 'needs_review',
      extractionError: result.error,
      rawExtraction: result.raw,
    });
    return;
  }

  const { extraction } = result;
  await store.updateCertificate(certificateId, {
    status: result.reviewReasons.length > 0 ? 'needs_review' : 'extracted',
    namedInsured: extraction.named_insured,
    producerName: extraction.producer_name,
    producerEmail: extraction.producer_email,
    producerPhone: extraction.producer_phone,
    certificateHolder: extraction.certificate_holder,
    wcPresent: extraction.wc_present,
    wcCarrier: extraction.wc_carrier,
    wcPolicyNumber: extraction.wc_policy_number,
    wcEffective: extraction.wc_effective,
    wcExpiration: extraction.wc_expiration,
    wcOfficerExclusionNoted: extraction.wc_officer_exclusion_noted,
    glPresent: extraction.gl_present,
    descriptionOfOperations: extraction.description_of_operations,
    extractionConfidenceThousandths: result.confidenceThousandths,
    extractionError: null,
    rawExtraction: result.raw,
  });

  // Auto-match only on a strong trigram score or a confirmed alias, and only when the
  // extraction itself did not need review. Everything else goes to the review queue.
  if (result.reviewReasons.length > 0 || extraction.named_insured === null) return;

  const data = await store.loadDataset();
  const aliases = await store.listAliases();
  const ranked = rankCandidates(
    normalizeName(extraction.named_insured),
    data.subcontractors.map((sub) => ({
      id: sub.id,
      name: sub.name,
      normalizedName: sub.normalizedName,
    })),
    aliases.map((alias) => ({
      subcontractorId: alias.subcontractorId,
      normalizedAlias: alias.normalizedAlias,
    })),
  );

  const best = ranked[0];
  if (best && best.score >= AUTO_MATCH_THRESHOLD) {
    // Record how the match was made. A trigram auto-match is a machine judgement, and
    // every figure that depends on it says so until a person confirms it.
    await store.matchCertificate(certificateId, best.subcontractorId, {
      saveAlias: true,
      method: best.score === 1 ? 'alias' : 'auto_trigram',
    });
  }
}
