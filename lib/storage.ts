import 'server-only';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServerSupabase, supabaseConfigured } from '@/lib/db/supabase';

/**
 * Document storage. The source file behind every figure is kept — an auditor's question
 * about a date is answered by opening the certificate, not by trusting the row.
 *
 * Objects are keyed `<org_id>/<uuid>.<ext>`; the storage policies in 0002_storage.sql
 * refuse any other shape, so a signed URL can only ever reach the caller's own org.
 */
const DEMO_ROOT = process.env.SUBLEDGER_DEMO_FILES ?? join(process.cwd(), '.data', 'files');

export async function storeDocument(
  bucket: 'certificates' | 'ledger-imports',
  orgId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() || 'bin';
  const path = `${orgId}/${randomUUID()}.${extension}`;

  if (!supabaseConfigured()) {
    const target = join(DEMO_ROOT, bucket, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return path;
  }

  const client = await createServerSupabase();
  const { error } = await client.storage
    .from(bucket)
    .upload(path, new Blob([bytes as BlobPart], { type: contentType }), { upsert: false });
  if (error) throw new Error(`${bucket}: ${error.message}`);
  return path;
}

/** A short-lived URL for viewing a stored document beside its extracted fields. */
export async function documentUrl(
  bucket: 'certificates' | 'ledger-imports',
  path: string,
  expiresInSeconds = 600,
): Promise<string | null> {
  if (path === '') return null;
  if (!supabaseConfigured()) {
    return `/api/files/${bucket}/${encodeURIComponent(path)}`;
  }
  const client = await createServerSupabase();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  return error ? null : (data?.signedUrl ?? null);
}

/** Demo-mode read-back, behind the local file route. Never used with Supabase configured. */
export function readDemoDocument(bucket: string, path: string): Uint8Array | null {
  if (supabaseConfigured()) return null;
  if (path.includes('..')) return null;
  const target = join(DEMO_ROOT, bucket, path);
  if (!existsSync(target)) return null;
  return new Uint8Array(readFileSync(target));
}
