import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { FlagList } from '@/components/Flags';
import { Money } from '@/components/Money';
import { loadWorkspace } from '@/lib/app/workspace';
import { ZERO_REASON_LABELS } from '@/lib/exposure/labels';
import { COVERAGE_LANGUAGE } from '@/lib/copy';

export const dynamic = 'force-dynamic';

const TRIAGE_LABELS: Record<string, string> = {
  undecided: 'Not triaged',
  subcontractor: 'Subcontractor',
  supplier: 'Supplier',
  not_applicable: 'Not applicable',
};

export default async function SubsPage() {
  const { data, portfolio } = await loadWorkspace();

  if (!portfolio || data.subcontractors.length === 0) {
    return (
      <EmptyState
        title="No vendors yet"
        body="Import a payment ledger and every vendor in it appears here with its payments, its certificates, and what it adds at audit."
        action={{ href: '/import', label: 'Import a ledger' }}
      />
    );
  }

  const byId = new Map(data.subcontractors.map((sub) => [sub.id, sub]));

  return (
    <section className="panel">
      <div className="panel-head">
        <h1 className="text-sm font-semibold">Every vendor in the term</h1>
        <p className="text-2xs text-ink-faint">{COVERAGE_LANGUAGE.basis}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="workpaper-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Triage</th>
              <th className="text-right">Paid in term</th>
              <th className="text-right">Outside coverage</th>
              <th className="text-right">Added premium</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.subs.map((sub) => {
              const record = byId.get(sub.subcontractorId);
              return (
                <tr key={sub.subcontractorId}>
                  <td>
                    <Link
                      href={`/subs/${sub.subcontractorId}`}
                      className="font-medium underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                    >
                      {sub.subcontractorName}
                    </Link>
                  </td>
                  <td className="text-ink-muted">
                    {TRIAGE_LABELS[record?.triage ?? 'undecided']}
                  </td>
                  <td className="num">
                    <Money cents={sub.paidTotal} />
                  </td>
                  <td className="num">
                    <Money cents={sub.uncoveredTotal} />
                  </td>
                  <td className="num font-semibold text-risk">
                    {sub.addedPremium === null ? (
                      <span className="text-note">unrated</span>
                    ) : (
                      <Money cents={sub.addedPremium} />
                    )}
                  </td>
                  <td className="text-ink-muted">
                    {(sub.addedPremium ?? 0) > 0
                      ? COVERAGE_LANGUAGE.uncovered
                      : sub.zeroReason
                        ? ZERO_REASON_LABELS[sub.zeroReason]
                        : COVERAGE_LANGUAGE.covered}
                  </td>
                  <td className="w-56">
                    <FlagList flags={sub.flags} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
