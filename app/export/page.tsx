import { EmptyState } from '@/components/EmptyState';
import { Disclaimer } from '@/components/Disclaimer';
import { Money } from '@/components/Money';
import { loadWorkspace } from '@/lib/app/workspace';
import { RULESET_STATEMENTS } from '@/lib/exposure/ruleset';
import { formatUsDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const { data, portfolio, store } = await loadWorkspace();

  if (!data.policy || !portfolio) {
    return (
      <EmptyState
        title="Nothing to export yet"
        body="Set up the policy term and import a ledger, and both exports become available."
        action={{ href: '/setup', label: 'Set up the policy term' }}
      />
    );
  }

  const history = await store.listExposureSnapshots(data.policy.id);

  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="panel-head">
          <h1 className="text-sm font-semibold">Export</h1>
          <p className="text-2xs text-ink-faint">
            Both files carry the ruleset version, the generation timestamp, and the disclaimer.
          </p>
        </div>

        <div className="grid gap-px bg-rule md:grid-cols-2">
          <div className="bg-card px-5 py-5">
            <h2 className="text-sm font-semibold">Audit workpaper (PDF)</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              A schedule of every vendor in the term with totals that foot, the annotations worth
              raising, and a methodology page stating the modeled rules as modeled rules. This is
              the file to hand an auditor.
            </p>
            <a href="/api/export/workpaper" className="btn mt-4">
              Download the workpaper
            </a>
          </div>

          <div className="bg-card px-5 py-5">
            <h2 className="text-sm font-semibold">Sub-level detail (XLSX)</h2>
            <p className="mt-1.5 text-sm text-ink-muted">
              Five sheets: summary, subcontractors, every payment with how it tested against
              coverage, every certificate, and the methodology. Money is written as numbers so the
              columns can be footed.
            </p>
            <a href="/api/export/detail" className="btn-quiet mt-4">
              Download the workbook
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">What the export will say</h2>
            <p className="text-2xs text-ink-faint">Ruleset {portfolio.rulesetVersion}</p>
          </div>
          <ol className="space-y-2.5 px-5 py-4 text-sm text-ink-muted">
            {RULESET_STATEMENTS.map((statement, index) => (
              <li key={statement} className="flex gap-2">
                <span className="text-ink-faint">{index + 1}.</span>
                <span>{statement}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Figures produced so far</h2>
            <p className="text-2xs text-ink-faint">
              So a figure produced in March can be explained in November
            </p>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Why</th>
                <th className="text-right">Total</th>
                <th>Ruleset</th>
              </tr>
            </thead>
            <tbody>
              {history.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{formatUsDate(snapshot.createdAt.slice(0, 10))}</td>
                  <td className="text-ink-muted">{snapshot.reason ?? '—'}</td>
                  <td className="num">
                    <Money cents={snapshot.totalExposure} />
                  </td>
                  <td className="text-ink-muted">{snapshot.rulesetVersion}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-sm text-ink-muted">
                    Nothing exported yet. Every export is recorded here with the ruleset that
                    produced it.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Disclaimer rulesetVersion={portfolio.rulesetVersion} />
    </div>
  );
}
