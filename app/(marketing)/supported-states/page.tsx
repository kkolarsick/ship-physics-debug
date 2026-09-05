import type { Metadata } from 'next';
import Link from 'next/link';
import { StateTable } from '@/components/marketing/StateStatus';
import { launchStates, recognisedStates } from '@/lib/marketing/states';

export const metadata: Metadata = {
  title: 'Supported states — SubLedger',
  description:
    'Which states SubLedger produces a workers’ compensation audit exposure estimate for, which it recognises but does not yet price, and why it withholds rather than approximates.',
};

/**
 * The supported-states page is generated from the rules registry, so it is always exactly
 * what the engine will do — not a list somebody remembered to update.
 */
export default function SupportedStatesPage() {
  const launch = launchStates();
  const all = recognisedStates();
  const estimating = all.filter((state) => state.producesEstimates);
  const declared = all.filter((state) => !state.producesEstimates);

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Coverage</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          Where SubLedger produces a number, and where it refuses to.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          Audit treatment of uninsured subcontract cost is set by the state and rating
          bureau that govern your policy. Where SubLedger holds a versioned ruleset for a
          state, it estimates. Where it does not, it says so and shows you nothing —
          borrowing another state’s treatment would produce a figure that looks like an
          answer and is not one.
        </p>
        <p className="mt-4 max-w-2xl text-2xs text-ink-faint">
          This table is generated from the rules the product actually applies. It cannot
          claim a state the engine would decline to price.
        </p>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">Launch states</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          The initial commercial footprint: the largest construction populations and
          workers’ compensation premium pools, chosen so that getting six rulesets right
          covers most of the money.
        </p>
        <div className="mt-5 border border-rule">
          <StateTable states={launch} />
        </div>
      </section>

      {estimating.length > 0 ? (
        <section className="border-b border-rule py-12">
          <h2 className="text-xl font-semibold tracking-tight">
            Currently estimating ({estimating.length})
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            A ruleset is in place for these. Every figure names the ruleset and version that
            produced it, and whether that profile has been reviewed against the governing
            manual.
          </p>
          <div className="mt-5 border border-rule">
            <StateTable states={estimating} />
          </div>
        </section>
      ) : null}

      {declared.length > 0 ? (
        <section className="border-b border-rule py-12">
          <h2 className="text-xl font-semibold tracking-tight">
            Recognised, not yet estimating ({declared.length})
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            SubLedger knows which authority governs these states and what has to be
            transcribed. Until that work is done it produces no premium figure for them. You
            can still import a ledger, triage vendors, and collect certificates — only the
            pricing is withheld.
          </p>
          <div className="mt-5 border border-rule">
            <StateTable states={declared} />
          </div>
        </section>
      ) : null}

      <section className="py-12">
        <div className="flex flex-wrap items-center justify-between gap-5 border border-rule bg-card px-6 py-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Not seeing your state?</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              Tell us which one and we will say where it sits in the queue. We would rather
              add a state properly than approximate it.
            </p>
          </div>
          <Link href="/waitlist" className="btn">
            Join the waitlist
          </Link>
        </div>
      </section>
    </div>
  );
}
