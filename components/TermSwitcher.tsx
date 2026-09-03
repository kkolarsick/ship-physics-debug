'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { selectPolicyTermAction } from '@/app/actions';
import { formatUsDate } from '@/lib/dates';

/** Term history (brief §9, step 8). Every screen follows the term selected here. */
export function TermSwitcher({
  policies,
  selectedId,
}: {
  policies: readonly { id: string; termStart: string; termEnd: string; carrierName: string | null }[];
  selectedId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (policies.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-2xs text-ink-muted">
      <span className="label">Term</span>
      <select
        className="border border-rule-strong bg-white px-1.5 py-0.5 text-2xs"
        value={selectedId}
        disabled={pending}
        onChange={(event) =>
          startTransition(async () => {
            await selectPolicyTermAction(event.target.value);
            router.refresh();
          })
        }
      >
        {policies.map((policy) => (
          <option key={policy.id} value={policy.id}>
            {formatUsDate(policy.termStart)} – {formatUsDate(policy.termEnd)}
            {policy.carrierName ? ` · ${policy.carrierName}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
