import type { Metadata } from 'next';
import Link from 'next/link';
import { recognisedStates } from '@/lib/marketing/states';
import { StatePicker } from './StatePicker';

export const metadata: Metadata = {
  title: 'Run a free exposure scan — SubLedger',
  description:
    'Pick your state, enter your policy inputs, and upload a subcontractor payment report to see an estimated workers’ compensation audit exposure.',
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const states = recognisedStates();

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-12">
        <p className="label">Free exposure scan</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          Start with your state.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          The state decides which audit rules apply, and they differ on the things that move
          money. SubLedger checks that first, so you know whether it can price your policy
          before you upload anything.
        </p>
      </section>

      <section className="grid items-start gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StatePicker states={states} initial={state ?? null} />

        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">What happens next</h2>
          </div>
          <ol className="space-y-4 px-5 py-5 text-sm">
            {[
              {
                title: 'Policy inputs',
                body: 'Term dates, governing class and rate, and experience mod — all from your declarations page. Each field says where to find it.',
              },
              {
                title: 'Ledger upload',
                body: 'A vendor payment report for the term, from QuickBooks, Sage, Foundation, or any CSV. You map the columns; nothing is assumed about the file.',
              },
              {
                title: 'Vendor triage',
                body: 'Three buttons per vendor, dollars descending. A lumber yard is not a subcontractor, and you say so rather than a classifier guessing.',
              },
              {
                title: 'Your preliminary number',
                body: 'Estimated exposure, what is addressable, and which subcontractors are driving it — before uploading a single certificate.',
              },
              {
                title: 'Certificates, if you have them',
                body: 'Each one narrows the estimate by establishing when a subcontractor actually carried coverage.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="w-4 shrink-0 text-right tabular-nums text-ink-faint">
                  {index + 1}
                </span>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-0.5 text-ink-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="border-t border-rule px-5 py-3 text-2xs text-ink-faint">
            Your ledger and documents stay yours.{' '}
            <Link href="/data-handling" className="underline underline-offset-2">
              What SubLedger stores, and how to delete it
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
