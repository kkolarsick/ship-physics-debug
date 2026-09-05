import type { Metadata } from 'next';
import Link from 'next/link';
import { DISCLAIMER } from '@/lib/copy';
import { CONFIDENCE_FACTOR_LABELS } from '@/lib/exposure/confidence';
import { recognisedStates } from '@/lib/marketing/states';

export const metadata: Metadata = {
  title: 'How the estimate works — SubLedger',
  description:
    'How SubLedger builds a workers’ compensation audit exposure estimate: state rulesets, work periods, class and rate provenance, and the confidence record attached to every figure.',
};

const STEPS = [
  {
    title: 'Your state selects the ruleset',
    body: 'A policy names a state and a rating bureau. SubLedger resolves a versioned rules profile from that, and applies nothing else. If no profile covers your state, or the profile exists but its rules have not been transcribed, the estimate is withheld — there is no national fallback to fall through to.',
  },
  {
    title: 'Payments are grouped and triaged',
    body: 'Vendor payments inside the policy term are grouped by the name in your ledger. Nothing guesses which vendors are subcontracted labor and which are material suppliers; you decide, one keystroke per row, and the decision persists across re-imports.',
  },
  {
    title: 'Coverage is tested against the period worked',
    body: 'Each certificate establishes a covered period. Payments are tested against the dates the work was performed, where your ledger carries them. Where it does not, the payment date stands in — labelled a proxy on the figure, in the UI, and in the export — and only where the state’s ruleset permits that substitution at all.',
  },
  {
    title: 'Payroll is derived under the state’s rules',
    body: 'What counts as added payroll differs by jurisdiction: the full uncovered cost, a deemed labor share, or the subcontractor’s own payroll records where you hold them. Whether a labor/material split is allowed, what evidence supports one, and what it is capped at all come from the ruleset.',
  },
  {
    title: 'The result is rated, with the rate’s provenance recorded',
    body: 'Added payroll is rated at the class applicable to that subcontractor’s trade, or at the rate an auditor applied on a prior audit, or at the governing class where the ruleset says that is correct. Where a class is simply unknown, SubLedger either marks the governing rate as a proxy or produces no premium figure at all, depending on what the state permits.',
  },
  {
    title: 'An audit noncompliance charge is assessed separately',
    body: 'This is about the audit, not about your subcontractors: an endorsement on the policy, plus records not furnished or an audit not permitted. A contractor who cooperates fully owes none of it, however much uninsured subcontract cost they have.',
  },
];

export default function MethodologyPage() {
  const estimating = recognisedStates().filter((state) => state.producesEstimates).length;

  return (
    <div className="mx-auto max-w-workpaper px-5">
      <section className="border-b border-rule py-14">
        <p className="label">Estimate methodology</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">
          How the number is produced, and how far to trust it.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          The arithmetic is exact. The inputs it runs on are not all equally certain, and
          SubLedger keeps those two things apart on every figure it shows you.
        </p>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">The calculation, in order</h2>
        <ol className="mt-6 space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span className="w-6 shrink-0 pt-0.5 text-right text-sm tabular-nums text-ink-faint">
                {index + 1}
              </span>
              <div className="max-w-3xl border-l-2 border-rule pl-5">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">
          Every estimate carries a confidence record
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          One entry per class of input, each stating what is known and, separately, what was
          assumed. The overall level is the weakest entry, because one weak input is enough
          to make a figure uncertain. All of it prints in the workpaper.
        </p>
        <div className="mt-5 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CONFIDENCE_FACTOR_LABELS).map(([id, label]) => (
            <div key={id} className="bg-card px-4 py-3">
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-0.5 font-mono text-2xs text-ink-faint">{id}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-xl font-semibold tracking-tight">Reproducibility</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          Every saved figure records the ruleset id and version that produced it, alongside
          the jurisdiction, rating bureau, and the timestamp. When a state’s ruleset is
          updated, figures produced under the old one keep computing to the same number —
          they are pinned to the version that made them, and saved figures are never
          rewritten. A number you exported in March can be explained in November.
        </p>
      </section>

      <section className="py-12">
        <div className="border border-rule bg-card px-6 py-6">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{DISCLAIMER}</p>
          <p className="mt-4 text-sm">
            <Link href="/supported-states" className="underline underline-offset-2">
              See which states have a ruleset in place
            </Link>{' '}
            <span className="text-ink-faint">
              — {estimating} currently estimating.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
