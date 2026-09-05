import Link from 'next/link';
import { Money } from '@/components/Money';
import type { PortfolioExposure } from '@/lib/exposure/types';

/**
 * The fail-closed state.
 *
 * When no rules profile can be resolved for a policy, this product shows the ledger and
 * says plainly that it cannot price it. It does not fall back to another jurisdiction's
 * treatment and put a dollar sign on the result — a wrong number here ends up in front of
 * an auditor.
 */
export function EstimateUnavailable({ portfolio }: { portfolio: PortfolioExposure }) {
  const ledgerTotal = portfolio.subs.reduce((total, sub) => total + sub.paidTotal, 0);

  return (
    <div className="space-y-6">
      <section className="panel">
        <div className="border-l-4 border-note px-5 py-6">
          <p className="label">Estimate unavailable</p>
          <h1 className="mt-2 max-w-2xl text-2xl font-semibold leading-snug tracking-tight">
            {portfolio.unavailable?.message ??
              'No rules profile is in effect for this policy term.'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ink-muted">
            Audit treatment of uninsured subcontract cost is set by the state and rating
            bureau that govern your policy, and it differs materially between them. Rather
            than borrow another jurisdiction’s treatment and show you a number, this
            product withholds the estimate until the rules are configured.
          </p>
          <Link href="/setup" className="btn mt-4">
            Set the jurisdiction on this policy
          </Link>
        </div>

        <div className="border-t border-rule px-5 py-4">
          <p className="label">What is on file for this term</p>
          <p className="mt-1 text-sm text-ink-muted">
            <Money cents={ledgerTotal} /> paid across {portfolio.subs.length}{' '}
            {portfolio.subs.length === 1 ? 'vendor' : 'vendors'}. The ledger, the
            certificates, and the triage decisions are all kept — only the pricing is
            withheld.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="text-sm font-semibold">Vendors on file</h2>
          <p className="text-2xs text-ink-faint">No premium figure is produced for any of them</p>
        </div>
        <table className="workpaper-table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th className="text-right">Paid in term</th>
              <th>Estimate</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.subs
              .filter((sub) => sub.paidTotal > 0)
              .map((sub) => (
                <tr key={sub.subcontractorId}>
                  <td>
                    <Link href={`/subs/${sub.subcontractorId}`} className="hover:underline">
                      {sub.subcontractorName}
                    </Link>
                  </td>
                  <td className="num">
                    <Money cents={sub.paidTotal} />
                  </td>
                  <td className="text-note">Unavailable</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
