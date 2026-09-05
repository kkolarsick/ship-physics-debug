import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateBadge } from '@/components/marketing/StateStatus';
import { jurisdictionForSlug, stateSlug } from '@/lib/marketing/jurisdictions';
import { recognisedStates, stateProfile } from '@/lib/marketing/states';
import { formatUsDate } from '@/lib/dates';

/**
 * The state page. This is where the credibility of the number lives.
 *
 * Everything on it — what SubLedger will calculate here, what it will not, which
 * assumptions lower confidence, which ruleset applies — is derived from that state's rules
 * profile. There is no hand-written claim about coverage on this page, so it cannot say
 * more than the engine implements.
 */
export function generateStaticParams(): { stateSlug: string }[] {
  return recognisedStates().map((state) => ({ stateSlug: state.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stateSlug: string }>;
}): Promise<Metadata> {
  const { stateSlug: slug } = await params;
  const jurisdiction = jurisdictionForSlug(slug);
  if (!jurisdiction) return {};
  const state = stateProfile(jurisdiction);

  return {
    title: `${state.name} workers’ comp audit: subcontractor premium exposure — SubLedger`,
    description: state.producesEstimates
      ? `See what ${state.name} subcontractors may add to your workers’ compensation premium at audit, under ${state.ratingBureau} treatment, ranked by the records that would change the number.`
      : `How ${state.name} treats uninsured subcontractor cost at a workers’ compensation audit, and what SubLedger does and does not estimate for the state today.`,
  };
}

export default async function StateAuditPage({
  params,
}: {
  params: Promise<{ stateSlug: string }>;
}) {
  const { stateSlug: slug } = await params;
  const jurisdiction = jurisdictionForSlug(slug);
  if (!jurisdiction || stateSlug(jurisdiction) !== slug) notFound();

  const state = stateProfile(jurisdiction);
  if (state.support === 'unsupported') notFound();

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-14">
        <div className="flex flex-wrap items-center gap-3">
          <p className="label">{state.name} · {state.ratingBureau}</p>
          <StateBadge state={state} />
        </div>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight">
          What your subcontractors may add to a {state.name} workers’ comp audit.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          When you pay a subcontractor who cannot evidence workers’ compensation for the
          period they worked, that cost is generally treated as your payroll at audit, and
          rated. How much of it, at what rate, and what evidence reduces it are decided by{' '}
          {state.ratingBureau} rules for {state.name} — not by a national rule of thumb.
        </p>

        {state.producesEstimates ? (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href={`/scan?state=${state.jurisdiction}`} className="btn px-5 py-2.5 text-base">
              Run a free {state.name} exposure scan
            </Link>
            <span className="text-2xs text-ink-faint">
              Ruleset {state.rulesetId} {state.rulesetVersion}
              {state.effectiveFrom ? ` · effective from ${formatUsDate(state.effectiveFrom)}` : ''}
            </span>
          </div>
        ) : (
          <div className="mt-6 border-l-4 border-note bg-note/5 px-5 py-4">
            <p className="text-sm font-semibold text-note">
              SubLedger does not yet produce a reliable premium estimate for {state.name}.
            </p>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
              {state.ratingBureau} governs this state, and its rules have not been
              transcribed into the product. Rather than apply another jurisdiction’s
              treatment and show you a number, SubLedger withholds the estimate. You can
              still upload a ledger and keep your triage and certificates; only the pricing
              is withheld until the ruleset is in place.
            </p>
            <Link href={`/waitlist?state=${state.jurisdiction}`} className="btn-quiet mt-4">
              Tell me when {state.name} is ready
            </Link>
          </div>
        )}
      </section>

      <section className="grid items-start gap-8 border-b border-rule py-12 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Which inputs decide the number</h2>
          <dl className="mt-4 space-y-4 text-sm">
            {[
              {
                term: 'Your subcontractor ledger',
                detail:
                  'Vendor payments inside the policy term. This alone produces a preliminary figure — certificates are not required to start.',
              },
              {
                term: 'When the work was performed',
                detail:
                  'Coverage is tested against the period worked, not the date the check cleared. Where your export carries service dates, map them; where it does not, SubLedger uses the payment date and labels it a proxy.',
              },
              {
                term: 'Certificates of insurance',
                detail:
                  'Each certificate establishes a covered period. Work outside every covered period is what drives the figure; partial coverage is the common case.',
              },
              {
                term: 'Class code and rate',
                detail:
                  'The class applicable to each subcontractor’s trade, or the rate an auditor applied on a prior audit. Where neither is known, SubLedger discloses what it used instead.',
              },
              {
                term: 'Your policy inputs',
                detail:
                  'Term dates, governing class and rate, and experience modification factor, all from your declarations page.',
              },
            ].map((item) => (
              <div key={item.term}>
                <dt className="font-medium">{item.term}</dt>
                <dd className="mt-0.5 text-ink-muted">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-6">
          {state.canCalculate.length > 0 ? (
            <div className="panel">
              <div className="panel-head">
                <h2 className="text-sm font-semibold">What SubLedger calculates in {state.name}</h2>
                <p className="font-mono text-2xs text-ink-faint">
                  {state.rulesetId} {state.rulesetVersion}
                </p>
              </div>
              <ul className="space-y-2.5 px-4 py-4 text-sm text-ink-muted">
                {state.canCalculate.map((line) => (
                  <li key={line} className="border-l-2 border-cleared/40 pl-3">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-semibold">What it will not calculate</h2>
            </div>
            <ul className="space-y-2.5 px-4 py-4 text-sm text-ink-muted">
              {state.willNotCalculate.map((line) => (
                <li key={line} className="border-l-2 border-note/50 pl-3">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {state.confidenceCaveats.length > 0 ? (
            <div className="panel">
              <div className="panel-head">
                <h2 className="text-sm font-semibold">What lowers confidence in the figure</h2>
              </div>
              <ul className="space-y-2.5 px-4 py-4 text-sm text-ink-muted">
                {state.confidenceCaveats.map((line) => (
                  <li key={line} className="border-l-2 border-rule-strong pl-3">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">
          The authorities this profile is built against
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Every rule SubLedger applies in {state.name} is traceable to one of these. The
          ruleset and version that produced a figure travel with it into the workpaper.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Authority</th>
                <th>Document</th>
                <th>Section</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {state.citations.map((citation) => (
                <tr key={`${citation.label}-${citation.reference}`}>
                  <td className="text-ink-muted">{citation.authority.replace(/_/g, ' ')}</td>
                  <td>
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                      >
                        {citation.label}
                      </a>
                    ) : (
                      citation.label
                    )}
                  </td>
                  <td className="text-ink-muted">{citation.reference}</td>
                  <td className="text-ink-muted">
                    {citation.retrievedAt ? formatUsDate(citation.retrievedAt.slice(0, 10)) : 'Not yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="py-12">
        <div className="flex flex-wrap items-center justify-between gap-5 border border-rule bg-card px-6 py-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {state.producesEstimates
                ? `See your ${state.name} exposure`
                : `Other states are already estimating`}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              {state.producesEstimates
                ? 'Upload a vendor payment report for your policy term. No certificates needed to see the first number.'
                : 'SubLedger recognises every state below, and prices the ones whose rulesets are in place.'}
            </p>
          </div>
          <Link
            href={state.producesEstimates ? `/scan?state=${state.jurisdiction}` : '/supported-states'}
            className="btn"
          >
            {state.producesEstimates ? 'Run a free exposure scan' : 'See supported states'}
          </Link>
        </div>
      </section>
    </div>
  );
}
