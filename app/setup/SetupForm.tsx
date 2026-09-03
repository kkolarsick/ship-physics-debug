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
export function SetupForm({
  org,
  policy,
  policies,
}: {
  org: OrgRecord;
  policy: PolicyRecord | null;
  policies: readonly PolicyRecord[];
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
          <Field
            label="Non-compliance surcharge %"
            name="noncomplianceSurchargePct"
            defaultValue={policy ? formatPct(policy.noncomplianceSurchargePct).replace('%', '') : '0'}
            placeholder="0"
            hint="Some policies carry one where records are inadequate. Check your policy; leave 0 if there is none."
            error={state?.fieldErrors?.noncomplianceSurchargePct}
          />
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
