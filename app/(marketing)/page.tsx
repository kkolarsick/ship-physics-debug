import Link from 'next/link';
import { StateBadge } from '@/components/marketing/StateStatus';
import { launchStates } from '@/lib/marketing/states';

/**
 * The homepage sells one thing: the number.
 *
 * Every claim on it about which states SubLedger covers is read from the rules registry
 * rather than written here, so the pitch cannot promise a jurisdiction the engine will
 * refuse to price.
 */
export default function HomePage() {
  const states = launchStates();
  const estimating = states.filter((state) => state.producesEstimates);

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-16">
        <p className="label">Workers’ compensation premium audit</p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight">
          Know what your workers’ comp audit may cost before the auditor does.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
          Upload your subcontractor ledger. SubLedger applies the audit treatment for your
          state, estimates the premium exposure, and ranks which missing records may change
          the number.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link href="/scan" className="btn px-5 py-2.5 text-base">
            Run a free exposure scan
          </Link>
          <span className="text-2xs text-ink-faint">
            No meeting. No account needed to see your first number.
          </span>
        </div>

        <dl className="mt-12 grid gap-px border border-rule bg-rule sm:grid-cols-3">
          {[
            {
              term: 'Upload the ledger you already have',
              detail:
                'A vendor payment report from QuickBooks, Sage, Foundation, or any CSV. Certificates come later, if at all.',
            },
            {
              term: 'See the exposure, by subcontractor',
              detail:
                'Which subcontractors are driving the number, how much each one may cost, and what is still assumed.',
            },
            {
              term: 'Work the list by dollars',
              detail:
                'Every missing record is ranked by what obtaining it is estimated to remove, not by how overdue it is.',
            },
          ].map((item) => (
            <div key={item.term} className="bg-card px-5 py-5">
              <dt className="text-sm font-semibold">{item.term}</dt>
              <dd className="mt-1.5 text-sm text-ink-muted">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-b border-rule py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              There is no national shortcut, so SubLedger does not use one.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
              How an auditor treats what you paid an uninsured subcontractor is set by the
              state and the rating bureau that govern your policy, and the answers differ on
              the things that move money: whether a labor/material split is allowed at all,
              what it is capped at, whether your subcontractor’s own payroll records displace
              the contract price, and what class the added payroll is rated at. SubLedger
              applies a versioned ruleset for your state and records which rules and
              assumptions produced each figure.
            </p>
          </div>
        </div>

        <div className="mt-8 border border-rule">
          <div className="panel-head">
            <h3 className="text-sm font-semibold">Launch states</h3>
            <p className="text-2xs text-ink-faint">
              {estimating.length === 0
                ? 'Rules profiles in progress — status below is read from the engine'
                : `${estimating.length} of ${states.length} currently estimating`}
            </p>
          </div>
          <ul className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {states.map((state) => (
              <li key={state.jurisdiction} className="bg-card px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={state.path}
                    className="text-sm font-medium underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                  >
                    {state.name}
                  </Link>
                  <StateBadge state={state} />
                </div>
                <p className="mt-1 text-2xs text-ink-faint">
                  {state.ratingBureau} · {state.rulesetId ? `${state.rulesetId} ${state.rulesetVersion}` : 'no ruleset'}
                </p>
              </li>
            ))}
          </ul>
          <p className="border-t border-rule px-4 py-3 text-2xs text-ink-muted">
            Working in a state that is not listed?{' '}
            <Link href="/supported-states" className="underline underline-offset-2">
              See every state SubLedger recognises
            </Link>
            . Where a ruleset is not in place, SubLedger says so and produces no figure
            rather than approximating one.
          </p>
        </div>
      </section>

      <section className="border-b border-rule py-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          A number you can hand to an auditor and defend.
        </h2>
        <div className="mt-7 grid gap-px border border-rule bg-rule md:grid-cols-2">
          {[
            {
              title: 'Every dollar traces to a rule and a document',
              body: 'Click any figure and see the payments behind it, the certificates that covered part of the work, the ruleset and version applied, and the arithmetic in between.',
            },
            {
              title: 'Coverage matched to when the work happened',
              body: 'A certificate that lapsed in June does not cover August work paid in May. SubLedger tests coverage against the period the work was performed, and says so when it had to use the payment date instead.',
            },
            {
              title: 'What is known, separately from what is assumed',
              body: 'Each estimate carries a confidence record naming every input: the rules profile, work dates, class and rate, how each certificate was read and matched, and anything entered by hand.',
            },
            {
              title: 'Missing records ranked by financial impact',
              body: 'Not a compliance checklist. A list sorted by the dollars each document is estimated to remove, so the first call you make is the one worth the most.',
            },
          ].map((item) => (
            <div key={item.title} className="bg-card px-5 py-5">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-rule py-14">
        <h2 className="text-2xl font-semibold tracking-tight">What SubLedger is not</h2>
        <ul className="mt-5 max-w-3xl space-y-3 text-sm leading-relaxed text-ink-muted">
          <li className="border-l-2 border-rule-strong pl-4">
            It is not a certificate filing cabinet. Certificates are evidence that changes a
            dollar figure, not the thing being managed.
          </li>
          <li className="border-l-2 border-rule-strong pl-4">
            It is not vendor management, and it has no broker or carrier view. The figures
            are computed for the insured, and where an interest would differ, they resolve
            for the contractor.
          </li>
          <li className="border-l-2 border-rule-strong pl-4">
            It is not a determination of premium. It is an estimate of what an auditor is
            likely to include, with the assumptions printed next to it.
          </li>
        </ul>
      </section>

      <section className="py-14">
        <div className="border border-rule bg-card px-6 py-8">
          <h2 className="max-w-2xl text-2xl font-semibold leading-snug tracking-tight">
            Start with the ledger you already have.
          </h2>
          <p className="mt-2.5 max-w-2xl text-sm text-ink-muted">
            Export vendor payments for your policy term and drop the CSV in. You will see a
            preliminary exposure figure before uploading a single certificate.
          </p>
          <Link href="/scan" className="btn mt-5 px-5 py-2.5 text-base">
            Run a free exposure scan
          </Link>
        </div>
      </section>
    </div>
  );
}
