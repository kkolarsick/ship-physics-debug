import Link from 'next/link';
import { ConfidenceBadge, ConfidencePanel } from '@/components/Confidence';
import { Disclaimer } from '@/components/Disclaimer';
import { EmptyState } from '@/components/EmptyState';
import { EstimateUnavailable } from '@/components/EstimateUnavailable';
import { FlagList } from '@/components/Flags';
import { Money } from '@/components/Money';
import { loadWorkspace } from '@/lib/app/workspace';
import { COVERAGE_LANGUAGE } from '@/lib/copy';
import { RATE_PROVENANCE_SHORT, ZERO_REASON_LABELS } from '@/lib/exposure/labels';
import { formatDollars, formatMod, formatRate } from '@/lib/money';
import { formatUsDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { data, portfolio, totals } = await loadWorkspace();

  if (!data.policy) {
    return (
      <EmptyState
        title="Start with your policy term"
        body="Enter the jurisdiction, term dates, governing class code, rate, and experience mod from your declarations page. The jurisdiction decides which rules apply; without it no estimate is produced."
        action={{ href: '/setup', label: 'Set up the policy term' }}
      />
    );
  }

  if (!portfolio || data.payments.length === 0) {
    return (
      <EmptyState
        title="Import your payment ledger"
        body="Export vendor payments for the policy term from QuickBooks, Sage, or Foundation and drop the CSV in. Map the work-period columns too if your export has them — coverage is tested against when the work happened."
        action={{ href: '/import', label: 'Import a ledger' }}
      />
    );
  }

  if (portfolio.status === 'unavailable') {
    return <EstimateUnavailable portfolio={portfolio} />;
  }

  const priced = portfolio.subs.filter((sub) => (sub.addedPremium ?? 0) > 0);
  const unrated = portfolio.subs.filter(
    (sub) => sub.addedPremium === null && sub.addedPayroll > 0,
  );
  const clear = portfolio.subs.filter(
    (sub) => (sub.addedPremium ?? 0) === 0 && sub.paidTotal > 0 && sub.addedPayroll === 0,
  );
  const untriaged = data.subcontractors.filter((sub) => sub.triage === 'undecided').length;
  const proxied = portfolio.subs.filter((sub) => sub.usedPaymentDateProxy).length;
  const eliminated = totals?.eliminated ?? 0;
  const profile = portfolio.rulesProfile;

  return (
    <div className="space-y-7">
      <section className="panel">
        <div className="grid gap-px bg-rule md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="bg-card px-5 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <p className="label">Estimated additional premium at audit</p>
              <ConfidenceBadge confidence={portfolio.confidence} />
            </div>
            <p className="mt-2 text-6xl font-semibold leading-none tracking-tight text-risk">
              {formatDollars(portfolio.totalExposure)}
            </p>
            <p className="mt-3 max-w-lg text-sm text-ink-muted">
              {formatDollars(portfolio.addedPayroll)} of payments to {priced.length}{' '}
              {priced.length === 1 ? 'subcontractor' : 'subcontractors'} sit outside every covered
              period on file, under {profile?.label ?? 'the resolved rules profile'} and an
              experience mod of {formatMod(data.policy.experienceMod)}.
            </p>
            {portfolio.confidence.assumptions.length > 0 ? (
              <p className="mt-2 max-w-lg text-2xs text-note">
                Rests on {portfolio.confidence.assumptions.length} assumption
                {portfolio.confidence.assumptions.length === 1 ? '' : 's'} — see “What this
                figure rests on” below.
              </p>
            ) : null}
          </div>

          <div className="grid grid-rows-2 gap-px bg-rule">
            <div className="bg-card px-5 py-4">
              <p className="label">Removed to date</p>
              <p className="mt-1 text-3xl font-semibold leading-none text-cleared">
                {formatDollars(eliminated)}
              </p>
              <p className="mt-1.5 text-2xs text-ink-faint">
                {totals?.resolvedCount ?? 0} chase{' '}
                {(totals?.resolvedCount ?? 0) === 1 ? 'item' : 'items'} resolved ·{' '}
                {totals?.openCount ?? 0} still open
              </p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="label">What clears it</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-muted">A split invoice can also reach</dt>
                  <dd className="num">
                    <Money cents={portfolio.clearedBySplitInvoice} />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-muted">Only a certificate clears</dt>
                  <dd className="num font-semibold text-risk">
                    <Money cents={portfolio.clearedByCertificateOnly} />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-1.5">
                  <dt className="text-ink-muted">Audit noncompliance charge</dt>
                  <dd className="num">
                    <Money cents={portfolio.auditNoncompliance.charge} />
                  </dd>
                </div>
              </dl>
              <p className="mt-1.5 text-2xs text-ink-faint">
                {portfolio.auditNoncompliance.statement}
              </p>
            </div>
          </div>
        </div>

        <details className="border-t border-rule px-5 py-3">
          <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            How this figure was produced
          </summary>
          <ol className="mt-3 max-w-3xl list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
            <li>
              {profile?.label} ({portfolio.provenance.rulesetId}{' '}
              {portfolio.provenance.rulesetVersion}) was resolved from the jurisdiction on this
              policy, {data.policy.jurisdiction}. Treatment comes from that profile and nowhere
              else.
            </li>
            <li>
              Payments dated {formatUsDate(data.policy.termStart)} through{' '}
              {formatUsDate(data.policy.termEnd)} were grouped by vendor:{' '}
              {formatDollars(portfolio.subs.reduce((total, sub) => total + sub.paidTotal, 0))} across{' '}
              {data.payments.length} lines.
            </li>
            <li>
              Each payment was tested against the certificates on file for the period the work
              was performed. {proxied === 0
                ? 'Every payment carried work dates.'
                : `${proxied} ${proxied === 1 ? 'subcontractor has' : 'subcontractors have'} payments with no work dates, where the payment date stood in as a labelled proxy.`}
            </li>
            <li>
              Material was deducted according to the profile’s labor/material rule, and the
              remainder rated at the class applicable to each subcontractor.
            </li>
            <li>
              The audit noncompliance charge was assessed from the audit conditions recorded on
              the policy — never from the presence of uninsured subcontract cost.
            </li>
          </ol>
        </details>
      </section>

      {portfolio.provenance.rulesProfileStatus !== 'verified' ? (
        <p className="border-l-2 border-note/50 pl-3 text-sm text-ink-muted">
          The rules profile behind every figure here — {profile?.label} (
          {portfolio.provenance.rulesetId} {portfolio.provenance.rulesetVersion}) — has not been
          checked against the governing bureau manual by a person. Treat the treatment it applies
          as this product’s model of {data.policy.jurisdiction}, not as the bureau’s rule.
        </p>
      ) : null}

      {untriaged > 0 ? (
        <p className="border-l-2 border-note/50 pl-3 text-sm text-ink-muted">
          {untriaged} {untriaged === 1 ? 'vendor has' : 'vendors have'} no triage decision yet and
          are priced as subcontracted labor.{' '}
          <Link href="/triage" className="font-medium text-ink underline underline-offset-2">
            Triage them
          </Link>
          .
        </p>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2 className="text-sm font-semibold">Subcontractors carrying exposure</h2>
          <p className="text-2xs text-ink-faint">Ranked by premium removed per call</p>
        </div>
        <div className="overflow-x-auto">
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Rate basis</th>
                <th className="text-right">Paid in term</th>
                <th className="text-right">Outside coverage</th>
                <th className="text-right">Material allowed</th>
                <th className="text-right">Added payroll</th>
                <th className="text-right">Added premium</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {priced.map((sub) => (
                <tr key={sub.subcontractorId}>
                  <td>
                    <Link
                      href={`/subs/${sub.subcontractorId}`}
                      className="font-medium underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
                    >
                      {sub.subcontractorName}
                    </Link>
                    <p className="mt-0.5 text-2xs text-ink-faint">
                      Class {sub.rate.classCode ?? 'unknown'}
                      {sub.rate.rate === null ? '' : ` @ ${formatRate(sub.rate.rate)}`}
                    </p>
                  </td>
                  <td>
                    <span
                      className={
                        sub.rate.provenance === 'governing_rate_proxy'
                          ? 'text-note'
                          : 'text-ink-muted'
                      }
                      title={sub.rate.statement}
                    >
                      {RATE_PROVENANCE_SHORT[sub.rate.provenance]}
                    </span>
                    {sub.usedPaymentDateProxy ? (
                      <p className="mt-0.5 text-2xs text-note">Payment date used as proxy</p>
                    ) : null}
                  </td>
                  <td className="num">
                    <Money cents={sub.paidTotal} />
                  </td>
                  <td className="num">
                    <Money cents={sub.uncoveredTotal} />
                  </td>
                  <td className="num">
                    <Money cents={sub.materialAllowed} />
                  </td>
                  <td className="num">
                    <Money cents={sub.addedPayroll} />
                  </td>
                  <td className="num font-semibold text-risk">
                    <Money cents={sub.addedPremium ?? 0} />
                  </td>
                  <td className="w-52">
                    <FlagList flags={sub.flags} compact />
                  </td>
                </tr>
              ))}
              {priced.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-ink-muted">
                    No payments in this term sit outside a covered period.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {priced.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider">
                    Total
                  </td>
                  <td />
                  <td className="num px-3 py-2">
                    <Money cents={priced.reduce((total, sub) => total + sub.paidTotal, 0)} />
                  </td>
                  <td className="num px-3 py-2">
                    <Money cents={priced.reduce((total, sub) => total + sub.uncoveredTotal, 0)} />
                  </td>
                  <td className="num px-3 py-2">
                    <Money cents={priced.reduce((total, sub) => total + sub.materialAllowed, 0)} />
                  </td>
                  <td className="num px-3 py-2">
                    <Money cents={portfolio.addedPayroll} />
                  </td>
                  <td className="num px-3 py-2 font-semibold text-risk">
                    <Money cents={portfolio.addedPremiumBeforeSurcharge} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {portfolio.proxyRatedPremium > 0 ? (
          <p className="border-t border-rule px-4 py-2.5 text-2xs text-note">
            <Money cents={portfolio.proxyRatedPremium} /> of the premium above rests on the
            governing rate standing in for a class nobody has established. Entering the class an
            auditor actually applied replaces the proxy.
          </p>
        ) : null}
      </section>

      {unrated.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Payroll with no defensible rate</h2>
            <p className="text-2xs text-ink-faint">Reported, deliberately not rated</p>
          </div>
          <table className="workpaper-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th className="text-right">Added payroll</th>
                <th>Why there is no premium figure</th>
              </tr>
            </thead>
            <tbody>
              {unrated.map((sub) => (
                <tr key={sub.subcontractorId}>
                  <td>
                    <Link href={`/subs/${sub.subcontractorId}`} className="hover:underline">
                      {sub.subcontractorName}
                    </Link>
                  </td>
                  <td className="num">
                    <Money cents={sub.addedPayroll} />
                  </td>
                  <td className="text-ink-muted">{sub.rate.statement}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <td className="px-3 py-2 text-2xs font-semibold uppercase tracking-wider">Total</td>
                <td className="num px-3 py-2 font-semibold">
                  <Money cents={portfolio.unratedPayroll} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
      ) : null}

      <ConfidencePanel confidence={portfolio.confidence} />

      <section className="grid items-start gap-5 lg:grid-cols-2">
        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">{COVERAGE_LANGUAGE.covered}</h2>
            <p className="text-2xs text-ink-faint">{COVERAGE_LANGUAGE.basis}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="workpaper-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="text-right">Paid in term</th>
                  <th>Why it is not priced</th>
                </tr>
              </thead>
              <tbody>
                {clear.map((sub) => (
                  <tr key={sub.subcontractorId}>
                    <td>
                      <Link href={`/subs/${sub.subcontractorId}`} className="hover:underline">
                        {sub.subcontractorName}
                      </Link>
                    </td>
                    <td className="num">
                      <Money cents={sub.paidTotal} />
                    </td>
                    <td className="text-ink-muted">
                      {sub.zeroReason ? ZERO_REASON_LABELS[sub.zeroReason] : '—'}
                    </td>
                  </tr>
                ))}
                {clear.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-5 text-center text-sm text-ink-muted">
                      Nothing here yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Questions for your auditor</h2>
            <p className="text-2xs text-ink-faint">Annotations, not adjustments</p>
          </div>
          <div className="px-4 py-4">
            {portfolio.subs.some((sub) => sub.flags.length > 0) ? (
              <div className="space-y-5">
                {portfolio.subs
                  .filter((sub) => sub.flags.length > 0)
                  .map((sub) => (
                    <div key={sub.subcontractorId}>
                      <p className="text-sm font-medium">{sub.subcontractorName}</p>
                      <div className="mt-1.5">
                        <FlagList flags={sub.flags} />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Nothing flagged in this term.</p>
            )}
          </div>
        </div>
      </section>

      <Disclaimer rulesetVersion={`${portfolio.provenance.rulesetId} ${portfolio.provenance.rulesetVersion}`} />
    </div>
  );
}
