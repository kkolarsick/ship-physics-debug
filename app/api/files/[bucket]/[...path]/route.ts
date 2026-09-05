import { NextResponse } from 'next/server';
import { readDemoDocument } from '@/lib/storage';
import { supabaseConfigured } from '@/lib/db/supabase';

/**
 * Local file serving for the demo store only. With Supabase configured this route refuses
 * everything — real deployments serve documents through short-lived signed URLs, which is
 * the only path that respects the storage policies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  if (supabaseConfigured()) {
    return new NextResponse('not found', { status: 404 });
  }

  const { bucket, path } = await params;
  if (bucket !== 'certificates' && bucket !== 'ledger-imports') {
    return new NextResponse('not found', { status: 404 });
  }

  const bytes = readDemoDocument(bucket, decodeURIComponent(path.join('/')));
  if (!bytes) return new NextResponse('not found', { status: 404 });

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'content-type': guessType(path.at(-1) ?? ''),
      'cache-control': 'private, max-age=60',
    },
  });
}

function guessType(name: string): string {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'csv') return 'text/csv';
  return 'application/octet-stream';
}
