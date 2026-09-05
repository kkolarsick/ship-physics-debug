import { EmptyState } from '@/components/EmptyState';
import { loadWorkspace } from '@/lib/app/workspace';
import { ImportWizard } from './ImportWizard';
import { formatUsDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const { data } = await loadWorkspace();

  if (!data.policy) {
    return (
      <EmptyState
        title="Set up the policy term first"
        body="The import filters payments to the audit period, so it needs the term dates before it can tell you what is in scope."
        action={{ href: '/setup', label: 'Set up the policy term' }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ImportWizard
        policyId={data.policy.id}
        termStart={data.policy.termStart}
        termEnd={data.policy.termEnd}
      />

      {data.batches.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Imports on file</h2>
            <p className="text-2xs text-ink-faint">
              The raw file is kept. A batch can be rolled back whole.
            </p>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Preset</th>
                <th className="text-right">Rows</th>
                <th className="text-right">Imported</th>
                <th>Imported at</th>
              </tr>
            </thead>
            <tbody>
              {data.batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="font-medium">{batch.sourceFilename}</td>
                  <td className="text-ink-muted">{batch.preset ?? 'generic'}</td>
                  <td className="num">{batch.rowCount}</td>
                  <td className="num">{batch.importedCount}</td>
                  <td className="text-ink-muted">{formatUsDate(batch.createdAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
