'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewCertificateAction } from '@/app/actions';

/**
 * The review queue (brief §4c, §8.4).
 *
 * A low-confidence extraction is never silently accepted. The source page sits beside an
 * editable form, and the human decides. A wrong date here produces a wrong dollar figure
 * in a document the contractor may hand to an auditor.
 */
export interface ReviewItem {
  id: string;
  filename: string | null;
  sourceUrl: string | null;
  subcontractorId: string | null;
  namedInsured: string | null;
  wcPresent: boolean;
  wcCarrier: string | null;
  wcPolicyNumber: string | null;
  wcEffective: string | null;
  wcExpiration: string | null;
  wcOfficerExclusionNoted: boolean;
  glPresent: boolean;
  confidence: number | null;
  error: string | null;
  descriptionOfOperations: string | null;
  subs: { id: string; name: string }[];
}

export function ReviewQueue({ items }: { items: readonly ReviewItem[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">
          {items.length} certificate{items.length === 1 ? '' : 's'} need a human
        </h2>
        <p className="text-2xs text-ink-faint">
          Below 85% confidence, or a workers’ comp section with a missing date.
        </p>
      </div>
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} />
      ))}
    </section>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [wcPresent, setWcPresent] = useState(item.wcPresent);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3 className="text-sm font-semibold">{item.filename ?? 'Certificate'}</h3>
        <p className="text-2xs text-note">
          {item.error
            ? item.error
            : item.confidence === null
              ? 'No confidence recorded'
              : `${(item.confidence / 10).toFixed(0)}% confidence`}
        </p>
      </div>

      <div className="grid gap-px bg-rule lg:grid-cols-2">
        <div className="bg-paper">
          {item.sourceUrl ? (
            <iframe
              src={item.sourceUrl}
              title={`Source document for ${item.filename ?? 'certificate'}`}
              className="h-[520px] w-full border-0 bg-white"
            />
          ) : (
            <p className="px-4 py-6 text-sm text-ink-muted">
              No source file stored for this record.
            </p>
          )}
        </div>

        <form
          className="space-y-3 bg-card px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await reviewCertificateAction({
                certificateId: item.id,
                subcontractorId: String(form.get('subcontractorId') ?? ''),
                namedInsured: String(form.get('namedInsured') ?? ''),
                wcPresent,
                wcCarrier: String(form.get('wcCarrier') ?? ''),
                wcPolicyNumber: String(form.get('wcPolicyNumber') ?? ''),
                wcEffective: wcPresent ? String(form.get('wcEffective') ?? '') : null,
                wcExpiration: wcPresent ? String(form.get('wcExpiration') ?? '') : null,
                wcOfficerExclusionNoted: form.get('officerExclusion') === 'on',
                glPresent: form.get('glPresent') === 'on',
              });
              setMessage(result.message ?? (result.ok ? 'Saved.' : 'Check the fields.'));
              if (result.ok) router.refresh();
            });
          }}
        >
          <label className="block">
            <span className="label">Subcontractor</span>
            <select className="field mt-1" name="subcontractorId" defaultValue={item.subcontractorId ?? ''}>
              <option value="">Choose…</option>
              {item.subs.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Name in the INSURED box</span>
            <input className="field mt-1" name="namedInsured" defaultValue={item.namedInsured ?? ''} />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wcPresent}
              onChange={(event) => setWcPresent(event.target.checked)}
            />
            The workers’ comp section has a policy number or limits
          </label>

          {wcPresent ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Effective</span>
                  <input
                    className="field mt-1"
                    type="date"
                    name="wcEffective"
                    defaultValue={item.wcEffective ?? ''}
                  />
                </label>
                <label className="block">
                  <span className="label">Expires</span>
                  <input
                    className="field mt-1"
                    type="date"
                    name="wcExpiration"
                    defaultValue={item.wcExpiration ?? ''}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Carrier</span>
                  <input className="field mt-1" name="wcCarrier" defaultValue={item.wcCarrier ?? ''} />
                </label>
                <label className="block">
                  <span className="label">Policy number</span>
                  <input
                    className="field mt-1"
                    name="wcPolicyNumber"
                    defaultValue={item.wcPolicyNumber ?? ''}
                  />
                </label>
              </div>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="officerExclusion"
              defaultChecked={item.wcOfficerExclusionNoted}
            />
            An owner, officer, member, or partner exclusion is noted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="glPresent" defaultChecked={item.glPresent} />
            General liability is also shown
          </label>

          {item.descriptionOfOperations ? (
            <div>
              <span className="label">Description of operations, as read</span>
              <p className="mt-1 border-l-2 border-rule pl-3 text-2xs text-ink-muted">
                {item.descriptionOfOperations}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn" disabled={pending}>
              {pending ? 'Saving…' : 'Confirm these dates'}
            </button>
            {message ? <span className="text-2xs text-ink-muted">{message}</span> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
