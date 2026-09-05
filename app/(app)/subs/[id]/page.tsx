import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfidencePanel } from '@/components/Confidence';
import { CoverageTimeline } from '@/components/CoverageTimeline';
import { Disclaimer } from '@/components/Disclaimer';
import { FlagList } from '@/components/Flags';
import { Money } from '@/components/Money';
import { certificatesFor, loadWorkspace, paymentsFor, subById } from '@/lib/app/workspace';
import { COVERAGE_LANGUAGE } from '@/lib/copy';
import { formatUsDate } from '@/lib/dates';
import { formatDollars, formatMod, formatRate } from '@/lib/money';
import { RATE_PROVENANCE_LABELS, ZERO_REASON_LABELS } from '@/lib/exposure/labels';
import { SubDetailEditors } from './SubDetailEditors';

export const dynamic = 'force-dynamic';

export default async function SubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, portfolio } = await loadWorkspace();
  const sub = subById(data, id);
  if (!sub || !data.policy || !portfolio) notFound();

  const exposure = portfolio.subs.find((entry) => entry.subcontractorId === id);
  if (!exposure) notFound();

  const payments = paymentsFor(data, id);
  const certificates = certificatesFor(data, id);
  const assessmentByPayment = new Map(
    exposure.assessments.map((assessment) => [assessment.paymentId, assessment]),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">
            <Link href="/subs" className="hover:text-ink">
              Subcontractors
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{sub.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {sub.trade ?? 'Trade not recorded'} · Class {exposure.rate.classCode ?? 'unknown'}
            {exposure.rate.rate === null ? '' : ` @ ${formatRate(exposure.rate.rate)} per $100`} ·
            mod {formatMod(exposure.experienceMod)}
          </p>
          <p className="mt-1 max-w-xl text-2xs text-ink-faint">
            Rate basis: {RATE_PROVENANCE_LABELS[exposure.rate.provenance]}. {exposure.rate.statement}
          </p>
        </div>
        <div className="text-right">
          <p className="label">Added premium</p>
          <p className="text-4xl font-semibold leading-none tracking-tight text-risk">
            {exposure.addedPremium === null ? 'Unrated' : formatDollars(exposure.addedPremium)}
          </p>
          <p className="mt-1 text-2xs text-ink-faint">
            {(exposure.addedPremium ?? 0) > 0
              ? COVERAGE_LANGUAGE.uncovered
              : exposure.zeroReason
                ? ZERO_REASON_LABELS[exposure.zeroReason]
                : COVERAGE_LANGUAGE.covered}
          </p>
        </div>
      </header>

      <CoverageTimeline
        termStart={data.policy.termStart}
        termEnd={data.policy.termEnd}
        windows={exposure.coverageWindows}
        payments={payments.map((payment) => {
          const assessment = assessmentByPayment.get(payment.id);
          return {
            id: payment.id,
            paidOn: payment.paidOn,
            workFrom: payment.workFrom,
            workTo: payment.workTo,
            amount: payment.amount,
            covered: assessment !== undefined && assessment.uncoveredAmount === 0,
            partial: assessment?.partialOverlap ?? false,
            proxied: assessment?.basis === 'payment_date_proxy',
            sourceRef: payment.sourceRef,
          };
        })}
      />

      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">How this figure was produced</h2>
            <p className="text-2xs text-ink-faint">
              {exposure.provenance.rulesetId} {exposure.provenance.rulesetVersion}
            </p>
          </div>
          <table className="workpaper-table">
            <tbody>
              <Line label="Paid inside the policy term" value={exposure.paidTotal} />
              <Line
                label="Inside a covered window on file"
                value={exposure.coveredTotal}
                muted
              />
              <Line label="Outside every covered window" value={exposure.uncoveredTotal} />
              <Line
                label="Material claimed with an original invoice"
                value={exposure.materialClaimed}
                muted
              />
              <Line
                label="Material deduction allowed (capped at half)"
                value={-exposure.materialAllowed}
              />
              <tr className="border-t border-rule-strong">
                <td className="px-3 py-2 font-medium">Added to auditable payroll</td>
                <td className="num px-3 py-2 font-semibold">
                  <Money cents={exposure.addedPayroll} zero="$0" />
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-ink-muted">Rated</td>
                <td className="num px-3 py-2 text-ink-muted">
                  {exposure.addedPayroll > 0 && exposure.rate.rate !== null
                    ? `${formatDollars(exposure.addedPayroll)} ÷ 100 × ${formatRate(exposure.rate.rate)} × ${formatMod(exposure.experienceMod)}`
                    : '—'}
                </td>
              </tr>
              <tr className="border-t-2 border-ink">
                <td className="px-3 py-2 font-semibold">Estimated additional premium</td>
                <td className="num px-3 py-2 font-semibold text-risk">
                  {exposure.addedPremium === null ? (
                    <span className="text-note">No premium figure — no defensible rate</span>
                  ) : (
                    <Money cents={exposure.addedPremium} exact zero="$0.00" />
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-rule px-4 py-3">
            <p className="label">If you get the document</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-muted">A certificate covering the period worked removes</dt>
                <dd className="num">
                  <Money cents={exposure.ifCertificateObtained ?? 0} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-muted">An original split invoice removes</dt>
                <dd className="num">
                  <Money cents={exposure.ifSplitInvoiceObtained ?? 0} />
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-5">
          <div className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-semibold">Certificates on file</h2>
            </div>
            {certificates.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-muted">
                Nothing on file. Every payment in the term is outside a covered window.
              </p>
            ) : (
              <table className="workpaper-table">
                <tbody>
                  {certificates.map((certificate) => (
                    <tr key={certificate.id}>
                      <td>
                        <p className="font-medium">{certificate.namedInsured ?? 'Unnamed'}</p>
                        <p className="mt-0.5 text-2xs text-ink-faint">
                          {certificate.wcPresent
                            ? `Workers’ comp ${certificate.wcEffective ? formatUsDate(certificate.wcEffective) : '—'} – ${certificate.wcExpiration ? formatUsDate(certificate.wcExpiration) : '—'}`
                            : 'No workers’ comp section on this certificate'}
                        </p>
                        {certificate.wcOfficerExclusionNoted ? (
                          <p className="mt-0.5 text-2xs text-note">Officer exclusion noted</p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-semibold">Questions for your auditor</h2>
            </div>
            <div className="px-4 py-4">
              <FlagList flags={exposure.flags} />
            </div>
          </div>
        </div>
      </section>

      <SubDetailEditors
        subcontractorId={sub.id}
        subcontractorName={sub.name}
        entityType={sub.entityType}
        trade={sub.trade}
        notes={sub.notes}
        classCodeRates={data.classCodeRates}
        specialCategory={sub.specialCategory}
        priorAuditRate={sub.priorAuditRate}
        payments={payments.map((payment) => {
          const assessment = assessmentByPayment.get(payment.id);
          return {
            id: payment.id,
            paidOn: payment.paidOn,
            workFrom: payment.workFrom,
            workTo: payment.workTo,
            amount: payment.amount,
            sourceRef: payment.sourceRef,
            materialAmount: payment.materialAmount,
            materialEvidence: payment.materialEvidence,
            covered: assessment !== undefined && assessment.uncoveredAmount === 0,
            proxied: assessment?.basis === 'payment_date_proxy',
          };
        })}
      />

      <ConfidencePanel confidence={exposure.confidence} title="What this subcontractor's figure rests on" />

      <Disclaimer
        rulesetVersion={`${exposure.provenance.rulesetId} ${exposure.provenance.rulesetVersion}`}
      />
    </div>
  );
}

function Line({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <tr>
      <td className={`px-3 py-2 ${muted ? 'text-ink-muted' : ''}`}>{label}</td>
      <td className={`num px-3 py-2 ${muted ? 'text-ink-muted' : ''}`}>
        {value < 0 ? (
          <span className="tabular-nums">({formatDollars(Math.abs(value))})</span>
        ) : (
          <Money cents={value} />
        )}
      </td>
    </tr>
  );
}
