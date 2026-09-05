'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Bulk upload with extraction progress (brief §8.4).
 *
 * The upload returns as soon as the files are stored; extraction runs after the response
 * and this panel polls until every file lands. A file that fails extraction is still on
 * file — it just needs a human.
 */
interface Progress {
  id: string;
  filename: string | null;
  status: string;
  namedInsured: string | null;
  matched: boolean;
  confidence: number | null;
  error: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Reading…',
  extracted: 'Read',
  needs_review: 'Needs review',
  matched: 'Matched',
  rejected: 'Rejected',
};

export function CertificateUpload() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Progress[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const pending = tracked.filter((entry) => entry.status === 'pending').length;

  useEffect(() => {
    if (pending === 0) return;
    const ids = tracked.map((entry) => entry.id).join(',');
    const timer = setInterval(async () => {
      const response = await fetch(`/api/certificates/status?ids=${ids}`);
      if (!response.ok) return;
      const body = (await response.json()) as { certificates: Progress[] };
      setTracked(body.certificates);
      if (body.certificates.every((entry) => entry.status !== 'pending')) router.refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [pending, tracked, router]);

  async function upload(files: FileList): Promise<void> {
    setUploading(true);
    setError(null);
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file);

    try {
      const response = await fetch('/api/certificates', { method: 'POST', body: form });
      const body = (await response.json()) as
        | { certificates: { id: string; filename: string }[] }
        | { error: string };
      if (!response.ok || 'error' in body) {
        setError('error' in body ? body.error : 'Upload failed.');
        return;
      }
      setTracked(
        body.certificates.map((entry) => ({
          id: entry.id,
          filename: entry.filename,
          status: 'pending',
          namedInsured: null,
          matched: false,
          confidence: null,
          error: null,
        })),
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h1 className="text-sm font-semibold">Certificates</h1>
        <p className="text-2xs text-ink-faint">
          PDFs or photographs of printouts. Nothing is confirmed with an insurer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="field max-w-md file:mr-3 file:border-0 file:bg-transparent file:text-sm file:text-ink-muted"
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) void upload(files);
          }}
        />
        {uploading ? <span className="text-sm text-ink-muted">Uploading…</span> : null}
        {error ? <span className="text-sm text-risk">{error}</span> : null}
      </div>

      {tracked.length > 0 ? (
        <table className="workpaper-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Named insured</th>
              <th className="text-right">Confidence</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {tracked.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.filename ?? '—'}</td>
                <td className="text-ink-muted">{entry.namedInsured ?? '—'}</td>
                <td className="num">
                  {entry.confidence === null ? '—' : `${(entry.confidence / 10).toFixed(0)}%`}
                </td>
                <td className={entry.status === 'needs_review' ? 'text-note' : 'text-ink-muted'}>
                  {STATUS_LABELS[entry.status] ?? entry.status}
                  {entry.error ? ` — ${entry.error}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
