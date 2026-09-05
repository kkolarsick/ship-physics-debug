import type { Metadata } from 'next';
import { stateName } from '@/lib/marketing/jurisdictions';
import { recognisedStates } from '@/lib/marketing/states';
import { WaitlistForm } from './WaitlistForm';

export const metadata: Metadata = {
  title: 'State waitlist — SubLedger',
  description:
    'Tell SubLedger which state you work in and be told when its workers’ compensation audit ruleset is in place.',
};

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const requested = state ? stateName(state) : null;
  const pending = recognisedStates().filter((entry) => !entry.producesEstimates);

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="grid items-start gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="label">Waitlist</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
            {requested ? `Be told when ${requested} is ready.` : 'Be told when your state is ready.'}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
            Adding a state means sourcing its rules from the governing manual, implementing
            them as a versioned profile, and putting them through a scenario suite before
            anything is priced. That is slower than switching on an approximation, and it is
            the reason a SubLedger figure is worth handing to an auditor.
          </p>
          <div className="mt-8">
            <WaitlistForm defaultState={state ?? ''} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Recognised, not yet estimating</h2>
            <p className="text-2xs text-ink-faint">{pending.length} states</p>
          </div>
          <table className="workpaper-table">
            <tbody>
              {pending.map((entry) => (
                <tr key={entry.jurisdiction}>
                  <td className="font-medium">{entry.name}</td>
                  <td className="text-ink-muted">{entry.ratingBureau}</td>
                  <td className="text-right text-2xs text-ink-faint">
                    {entry.isLaunchState ? 'Launch state' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-rule px-4 py-3 text-2xs text-ink-faint">
            SubLedger names the authority whose rules govern each of these, and what has to
            be transcribed before it will price them. Nothing is estimated in the meantime.
          </p>
        </div>
      </section>
    </div>
  );
}
