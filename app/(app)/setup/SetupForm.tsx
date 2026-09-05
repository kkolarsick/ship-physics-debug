'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { savePolicyAction, type ActionResult } from '@/app/actions';
import { formatMod, formatPct, formatRate, formatScaled } from '@/lib/money';
import { formatUsDate } from '@/lib/dates';
import type { OrgRecord, PolicyRecord } from '@/lib/db/types';

/**
 * Setup (brief §8.1). Every field carries a "where do I find this?" hint pointing at the
 * declarations page or the most recent audit statement, because a contractor filling this
 * in has the paperwork in front of them and no idea which line matters.
 */
export interface JurisdictionOption {
  jurisdiction: string;
  ratingBureau: string;
  label: string;
  status: string;
  producesEstimates: boolean;
}

export function SetupForm({
  org,
  policy,
  policies,
  jurisdictions,
  preselectedJurisdiction,
}: {
  org: OrgRecord;
  policy: PolicyRecord | null;
  policies: readonly PolicyRecord[];
  jurisdictions: readonly JurisdictionOption[];
  /** Carried through from the state the visitor picked at the front of the scan. */
  preselectedJurisdiction: string | null;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    savePolicyAction,
    null,
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form action={action} className="panel">
        <div className="panel-head">
          <h1 className="text-sm font-semibold">Policy term</h1>
          <div className="flex items-baseline gap-4 text-2xs text-ink-faint">
            <span>
              {policy
                ? `Editing ${formatUsDate(policy.termStart)} – ${formatUsDate(policy.termEnd)}`
                : 'New term'}
            </span>
            {policy ? (
              <Link href="/setup?new=1" className="text-ink-muted underline underline-offset-2 hover:text-ink">
                Start a new term
              </Link>
            ) : null}
          </div>
        </div>

        <input type="hidden" name="policyId" value={policy?.id ?? ''} />

        <div className="grid gap-x-5 gap-y-4 px-5 py-5 sm:grid-cols-2">
          <Field
            label="Your company"
            name="orgName"
            defaultValue={org.name}
            hint="As it appears as certificate holder on the certificates you collect."
            error={state?.fieldErrors?.orgName}
          />
          <Field
            label="Carrier"
            name="carrierName"
            defaultValue={policy?.carrierName ?? ''}
            hint="Top of the declarations page."
            error={state?.fieldErrors?.carrierName}
          />
          <Field
            label="Policy number"
            name="policyNumber"
            defaultValue={policy?.policyNumber ?? ''}
            hint="Declarations page, usually under the carrier name."
            error={state?.fieldErrors?.policyNumber}
          />
          <div className="hidden sm:block" />
          <Field
            label="Term start"
            name="termStart"
            type="date"
            defaultValue={policy?.termStart ?? ''}
            hint="The audit period begins here. Payments outside it are excluded."
            error={state?.fieldErrors?.termStart}
          />
          <Field
            label="Term end"
            name="termEnd"
            type="date"
            defaultValue={policy?.termEnd ?? ''}
            hint="Declarations page. Usually twelve months after the start."
            error={state?.fieldErrors?.termEnd}
          />
          <Field
            label="Governing class code"
            name="governingClassCode"
            defaultValue={policy?.governingClassCode ?? ''}
            placeholder="5645"
            hint="The class code carrying most of your payroll, from the declarations page schedule."
            error={state?.fieldErrors?.governingClassCode}
          />
          <Field
            label="Rate per $100 of payroll"
            name="governingRate"
            defaultValue={policy ? formatRate(policy.governingRate) : ''}
            placeholder="12.40"
            hint="Same schedule, the rate column next to that class code."
            error={state?.fieldErrors?.governingRate}
          />
          <Field
            label="Experience modification factor"
            name="experienceMod"
            defaultValue={policy ? formatMod(policy.experienceMod) : '1.000'}
            placeholder="1.050"
            hint="Declarations page or your mod worksheet. Enter 1.000 if you do not have one."
            error={state?.fieldErrors?.experienceMod}
          />
          <Field
            label="Estimated annual premium"
            name="estimatedAnnualPremium"
            defaultValue={policy ? formatScaled(policy.estimatedAnnualPremium, 100, 2) : ''}
            placeholder="180,000"
            hint="The estimated premium on the declarations page. Used only as the base for a surcharge."
            error={state?.fieldErrors?.estimatedAnnualPremium}
          />
        </div>

        <div className="border-t border-rule px-5 py-5">
          <h2 className="text-sm font-semibold">Which rules govern this policy</h2>
          <p className="mt-1 max-w-2xl text-2xs text-ink-faint">
            Audit treatment of uninsured subcontract cost is set by the state and rating bureau
            that govern your policy, and it differs materially between them. Without a
            jurisdiction this product produces no estimate rather than borrowing another
            jurisdiction’s treatment.
          </p>

          <div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">
                Jurisdiction<span className="text-risk"> *</span>
              </span>
              <select
                className="field mt-1"
                name="jurisdiction"
                defaultValue={policy?.jurisdiction ?? preselectedJurisdiction ?? ''}
              >
                <option value="">Choose the state on your policy…</option>
                {jurisdictions.map((entry) => (
                  <option key={entry.jurisdiction} value={entry.jurisdiction}>
                    {entry.jurisdiction} — {entry.ratingBureau}
                    {entry.producesEstimates ? '' : ' (rules not yet populated)'}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-2xs text-ink-faint">
                The state whose rules govern this policy. Only jurisdictions this build carries
                a rules profile for are listed.
              </span>
              {state?.fieldErrors?.jurisdiction ? (
                <span className="mt-1 block text-2xs text-risk">
                  {state.fieldErrors.jurisdiction}
                </span>
              ) : null}
            </label>

            <Field
              label="Rating bureau"
              name="ratingBureau"
              defaultValue={policy?.ratingBureau ?? ''}
              placeholder="NCCI"
              hint="Optional. Leave blank to accept the bureau this build associates with the jurisdiction; fill it in to have a mismatch rejected rather than assumed."
              error={state?.fieldErrors?.ratingBureau}
            />
          </div>
        </div>

        <div className="border-t border-rule px-5 py-5">
          <h2 className="text-sm font-semibold">Audit compliance</h2>
          <p className="mt-1 max-w-2xl text-2xs text-ink-faint">
            An audit noncompliance charge is about the audit itself. A subcontractor lacking a
            certificate does not trigger one, and nothing below is inferred from your exposure
            figure — if none of these is true, the charge is zero.
          </p>

          <div className="mt-4 space-y-2.5 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="auditEndorsementOnPolicy"
                defaultChecked={policy?.auditCompliance.endorsementOnPolicy ?? false}
                className="mt-1"
              />
              <span>
                The policy carries an audit noncompliance endorsement
                <span className="block text-2xs text-ink-faint">
                  Check your declarations page for an endorsement schedule.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="auditRecordsFurnished"
                defaultChecked={policy?.auditCompliance.recordsFurnished ?? true}
                className="mt-1"
              />
              <span>
                Records the auditor requested were furnished
                <span className="block text-2xs text-ink-faint">
                  Leave checked unless an auditor asked for records you did not provide.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="auditPermitted"
                defaultChecked={policy?.auditCompliance.auditPermitted ?? true}
                className="mt-1"
              />
              <span>
                The audit was permitted to take place
                <span className="block text-2xs text-ink-faint">
                  Leave checked unless an audit was refused or could not be scheduled.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="auditEstimatedIssued"
                defaultChecked={policy?.auditCompliance.estimatedAuditIssued ?? false}
                className="mt-1"
              />
              <span>
                The carrier has already issued an estimated audit for this term
              </span>
            </label>
          </div>

          <div className="mt-4 max-w-sm">
            <Field
              label="Noncompliance percentage on your policy"
              name="carrierConfiguredNoncompliancePct"
              defaultValue={
                policy ? formatPct(policy.auditCompliance.carrierConfiguredPct).replace('%', '') : '0'
              }
              placeholder="0"
              hint="From the endorsement itself. Used only where the rules profile reads the percentage off your own policy, and only when an audit condition above is recorded."
              error={state?.fieldErrors?.carrierConfiguredNoncompliancePct}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-rule px-5 py-3">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Saving…' : policy ? 'Save changes' : 'Save policy term'}
          </button>
          {state?.message ? (
            <p className={`text-sm ${state.ok ? 'text-cleared' : 'text-risk'}`}>{state.message}</p>
          ) : null}
        </div>
      </form>

      <div className="space-y-5">
        <section className="panel">
          <div className="panel-head">
            <h2 className="text-sm font-semibold">Where these figures come from</h2>
          </div>
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="label">Declarations page</dt>
              <dd className="mt-0.5 text-ink-muted">
                Carrier, policy number, term dates, class code schedule with rates, experience mod,
                and estimated annual premium.
              </dd>
            </div>
            <div>
              <dt className="label">Most recent audit statement</dt>
              <dd className="mt-0.5 text-ink-muted">
                If last year’s audit added payroll for uninsured subcontractors, it will name the
                class code and rate the auditor applied. That is the rate to enter here.
              </dd>
            </div>
            <div>
              <dt className="label">If a figure is not on either</dt>
              <dd className="mt-0.5 text-ink-muted">
                Your agent can read it off the policy in a minute. Nothing here is a coverage
                question — it is all arithmetic inputs.
              </dd>
            </div>
            <div>
              <dt className="label">Why the jurisdiction is required</dt>
              <dd className="mt-0.5 text-ink-muted">
                It decides which rules profile applies, and the profiles differ on the things
                that move dollars: whether a labor/material split is permitted at all, what it is
                capped at, and what class the added payroll is rated at.
              </dd>
            </div>
          </dl>
        </section>

        {policies.length > 1 ? (
          <section className="panel">
            <div className="panel-head">
              <h2 className="text-sm font-semibold">Earlier terms</h2>
            </div>
            <table className="workpaper-table">
              <tbody>
                {policies.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.carrierName ?? '—'}</td>
                    <td className="text-ink-muted">
                      {formatUsDate(entry.termStart)} – {formatUsDate(entry.termEnd)}
                    </td>
                    <td className="text-ink-muted">{entry.jurisdiction ?? '—'}</td>
                    <td className="num">{formatRate(entry.governingRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  error,
  type = 'text',
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  hint: string;
  error?: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field mt-1"
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
      />
      <span className="mt-1 block text-2xs text-ink-faint">{hint}</span>
      {error ? <span className="mt-1 block text-2xs text-risk">{error}</span> : null}
    </label>
  );
}
