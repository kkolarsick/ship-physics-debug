'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { matchCertificateAction, rejectCertificateAction } from '@/app/actions';
import { formatUsDate } from '@/lib/dates';
import type { MatchCandidate } from '@/lib/matching/similarity';

/**
 * Unassigned certificates (brief §5).
 *
 * A certificate that matches nothing is a signal, not a bug: usually the sub was paid
 * under a different name, or the certificate is for a party who never got paid. Confirming
 * a pairing saves an alias, so the same question is never asked twice.
 */
export interface UnmatchedItem {
  id: string;
  filename: string | null;
  sourceUrl: string | null;
  namedInsured: string | null;
  wcPresent: boolean;
  wcEffective: string | null;
  wcExpiration: string | null;
  status: string;
  candidates: MatchCandidate[];
  subs: { id: string; name: string }[];
}

export function UnmatchedBin({ items }: { items: readonly UnmatchedItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm(certificateId: string, subcontractorId: string): void {
    startTransition(async () => {
      await matchCertificateAction({ certificateId, subcontractorId, saveAlias: true });
      router.refresh();
    });
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="text-sm font-semibold">Unassigned certificates</h2>
        <p className="text-2xs text-ink-faint">
          {items.length === 0
            ? 'Every certificate is assigned.'
            : 'Usually the sub was paid under a different name.'}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-muted">Nothing waiting here.</p>
      ) : (
        <table className="workpaper-table">
          <thead>
            <tr>
              <th>Named insured</th>
              <th>Workers’ comp on the document</th>
              <th className="w-[28rem]">Assign to</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <p className="font-medium">{item.namedInsured ?? 'Unnamed'}</p>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-2xs text-ink-muted underline underline-offset-2"
                    >
                      {item.filename ?? 'view document'}
                    </a>
                  ) : (
                    <span className="text-2xs text-ink-faint">{item.filename ?? '—'}</span>
                  )}
                </td>
                <td className={item.wcPresent ? '' : 'text-note'}>
                  {item.wcPresent
                    ? `${item.wcEffective ? formatUsDate(item.wcEffective) : '—'} – ${item.wcExpiration ? formatUsDate(item.wcExpiration) : '—'}`
                    : 'No workers’ comp section'}
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.candidates.length === 0 ? (
                      <span className="text-2xs text-ink-faint">
                        No vendor name is close enough to suggest.
                      </span>
                    ) : null}
                    {item.candidates.map((candidate) => (
                      <button
                        key={candidate.subcontractorId}
                        type="button"
                        disabled={pending}
                        onClick={() => confirm(item.id, candidate.subcontractorId)}
                        className="border border-rule-strong bg-white px-2 py-1 text-2xs transition hover:border-ink"
                        title={`Trigram similarity ${(candidate.score * 100).toFixed(0)}%`}
                      >
                        {candidate.name}
                        <span className="ml-1.5 text-ink-faint">
                          {(candidate.score * 100).toFixed(0)}%
                        </span>
                      </button>
                    ))}
                    <select
                      className="field w-48 py-1 text-2xs"
                      defaultValue=""
                      disabled={pending}
                      onChange={(event) => {
                        if (event.target.value !== '') confirm(item.id, event.target.value);
                      }}
                    >
                      <option value="">Someone else…</option>
                      {item.subs.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending}
                      className="px-2 py-1 text-2xs text-ink-faint underline underline-offset-2 hover:text-ink"
                      onClick={() =>
                        startTransition(async () => {
                          await rejectCertificateAction(item.id);
                          router.refresh();
                        })
                      }
                    >
                      Not one of ours
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
