import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';

/** Extraction progress, polled by the upload panel while the work runs after the response. */
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids');
  const wanted = new Set((ids ?? '').split(',').filter(Boolean));

  const store = await getStore();
  const data = await store.loadDataset();

  return NextResponse.json({
    certificates: data.certificates
      .filter((certificate) => wanted.size === 0 || wanted.has(certificate.id))
      .map((certificate) => ({
        id: certificate.id,
        filename: certificate.originalFilename,
        status: certificate.status,
        namedInsured: certificate.namedInsured,
        matched: certificate.subcontractorId !== null,
        confidence: certificate.extractionConfidenceThousandths,
        error: certificate.extractionError,
      })),
  });
}
