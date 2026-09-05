import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — SubLedger',
  description:
    'A free workers’ compensation audit exposure scan, and a one-time pre-audit analysis with the full subcontractor table, ranked remediation, and an audit workpaper.',
};

/**
 * Priced on the financial output, not on feature counts.
 *
 * Nothing here is metered by certificates, vendors, or seats: what a contractor is buying
 * is a defensible number and a ranked list of what changes it, and the tiers say that.
 */
const TIERS = [
  {
    name: 'Audit Exposure Scan',
    price: 'Free',
    cadence: '',
    summary:
      'The headline number and enough of the breakdown to know whether it is worth acting on.',
    cta: { label: 'Run a free exposure scan', href: '/scan' },
    emphasis: false,
    includes: [
      'Estimated additional premium at audit',
      'The state ruleset and version applied',
      'Subcontractor count and total subcontract spend in the term',
      'How much of the figure is potentially addressable',
      'Confidence level and the assumptions the figure rests on',
      'The subcontractors driving most of the number',
    ],
    excludes: ['Full subcontractor table', 'Ranked remediation plan', 'Workpaper and detail exports'],
  },
  {
    name: 'Pre-Audit Analysis',
    price: '$299',
    cadence: 'one time, per policy term',
    summary:
      'Everything behind the number, and the ordered list of what to do about it before the auditor arrives.',
    cta: { label: 'Start with a free scan', href: '/scan' },
    emphasis: true,
    includes: [
      'Full subcontractor exposure table, with the arithmetic for each row',
      'Ranked remediation plan, sorted by the dollars each action is estimated to remove',
      'Certificate and work-period gaps, named per subcontractor',
      'State-specific assumptions and the confidence record for every figure',
      'Audit workpaper (PDF) with a schedule that foots and a methodology page',
      'Sub-level detail (XLSX): payments, coverage tests, certificates, assumptions',
      'Ruleset id and version stamped on every page, so the figure stays reproducible',
      'The documents behind each figure, linked from the row they support',
    ],
    excludes: [],
  },
  {
    name: 'Exposure Monitoring',
    price: '$129',
    cadence: 'per month, later',
    summary:
      'For contractors who want the number kept current between audits rather than computed once.',
    cta: { label: 'Not yet available', href: '/waitlist' },
    emphasis: false,
    includes: [
      'Continuous ledger imports as new payments post',
      'Exposure changes as certificates arrive and lapse',
      'Coverage expiring inside the current term, before it becomes exposure',
      'Pre-audit readiness across the whole term',
      'Historical terms, each pinned to the ruleset that priced it',
    ],
    excludes: [],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Pricing</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          Pay for the answer, not for storage.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          Nothing here is metered by certificates, vendors, or seats. The free scan tells
          you whether there is a number worth caring about. The paid analysis tells you what
          it is made of and what to do first.
        </p>
      </section>

      <section className="grid items-start gap-px border border-rule bg-rule py-0 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`flex h-full flex-col bg-card px-5 py-6 ${tier.emphasis ? 'border-t-2 border-risk' : ''}`}
          >
            <h2 className="text-sm font-semibold">{tier.name}</h2>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{tier.price}</p>
            {tier.cadence ? (
              <p className="mt-0.5 text-2xs text-ink-faint">{tier.cadence}</p>
            ) : null}
            <p className="mt-3 text-sm text-ink-muted">{tier.summary}</p>

            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {tier.includes.map((item) => (
                <li key={item} className="border-l-2 border-cleared/40 pl-3 text-ink-muted">
                  {item}
                </li>
              ))}
              {tier.excludes.map((item) => (
                <li key={item} className="border-l-2 border-rule pl-3 text-ink-faint line-through">
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href={tier.cta.href}
              className={`mt-6 ${tier.emphasis ? 'btn' : 'btn-quiet'} w-full`}
            >
              {tier.cta.label}
            </Link>
          </div>
        ))}
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">Questions worth answering first</h2>
        <dl className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {[
            {
              q: 'Do I need certificates to get a number?',
              a: 'No. The scan runs on a vendor payment report alone. Certificates narrow the estimate by establishing when a subcontractor actually carried coverage; without them, everything paid in the term is treated as outside coverage, which is the conservative reading.',
            },
            {
              q: 'What if my state is not supported?',
              a: 'You will be told before you upload anything, and no figure will be produced. SubLedger does not approximate a state whose rules it does not hold.',
            },
            {
              q: 'Is this a quote for insurance?',
              a: 'No. It is an estimate of what an auditor is likely to include in your auditable payroll, computed from documents and figures you provide. It is not a determination of premium and not insurance advice.',
            },
            {
              q: 'Can I hand the output to my auditor?',
              a: 'That is what the workpaper is for. Its schedule foots, every figure traces to the payments and certificates behind it, and the ruleset and version that produced it are stamped on every page.',
            },
          ].map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold">{item.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="py-12">
        <div className="flex flex-wrap items-center justify-between gap-5 border border-rule bg-card px-6 py-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">See the number first.</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-muted">
              The scan is free and needs nothing but a ledger. Decide about the analysis
              after you have seen what it would be analysing.
            </p>
          </div>
          <Link href="/scan" className="btn">
            Run a free exposure scan
          </Link>
        </div>
      </section>
    </div>
  );
}
