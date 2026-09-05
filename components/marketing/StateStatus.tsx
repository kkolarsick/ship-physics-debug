import Link from 'next/link';
import { SUPPORT_LABELS, type StateProfileSummary } from '@/lib/marketing/states';

/**
 * A state's status, read off its rules profile.
 *
 * There is no way to render a state as supported here without the engine agreeing, which
 * is the point: the public pages and the calculation cannot disagree about what SubLedger
 * covers, because they read the same registry.
 */
const TONE: Readonly<Record<StateProfileSummary['support'], string>> = {
  supported: 'border-cleared/40 bg-cleared-soft text-cleared',
  supported_draft: 'border-cleared/30 bg-cleared-soft text-cleared',
  declared: 'border-note/40 bg-note/5 text-note',
  unsupported: 'border-rule-strong bg-paper text-ink-faint',
};

export function StateBadge({ state }: { state: StateProfileSummary }) {
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-0.5 text-2xs font-medium ${TONE[state.support]}`}
    >
      {SUPPORT_LABELS[state.support]}
    </span>
  );
}

export function StateTable({ states }: { states: readonly StateProfileSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="workpaper-table">
        <thead>
          <tr>
            <th>State</th>
            <th>Rating authority</th>
            <th>Ruleset</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {states.map((state) => (
            <tr key={state.jurisdiction}>
              <td>
                <Link
                  href={state.path}
                  className="font-medium underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                >
                  {state.name}
                </Link>
              </td>
              <td className="text-ink-muted">{state.ratingBureau ?? '—'}</td>
              <td className="text-ink-muted">
                {state.rulesetId ? (
                  <span className="font-mono text-2xs">
                    {state.rulesetId} {state.rulesetVersion}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                <StateBadge state={state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
