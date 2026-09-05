'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ALL_JURISDICTIONS, stateName } from '@/lib/marketing/jurisdictions';
import type { StateProfileSummary } from '@/lib/marketing/states';

/**
 * State selection, at the front of the scan.
 *
 * The user finds out whether SubLedger can price their state before they are asked for
 * anything at all — no policy inputs, no ledger, no account. Finding that out three screens
 * in, after uploading a ledger, would be a worse experience and a worse signal.
 */
export function StatePicker({
  states,
  initial,
}: {
  states: readonly StateProfileSummary[];
  initial: string | null;
}) {
  const byJurisdiction = useMemo(
    () => new Map(states.map((state) => [state.jurisdiction, state])),
    [states],
  );
  const [selected, setSelected] = useState(initial ?? '');
  const state = selected === '' ? null : byJurisdiction.get(selected);
  const unrecognised = selected !== '' && state === undefined;

  return (
    <div className="space-y-6">
      <label className="block max-w-md">
        <span className="label">Which state is the policy written in?</span>
        <select
          className="field mt-1.5 text-base"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Choose a state…</option>
          {ALL_JURISDICTIONS.map((jurisdiction) => (
            <option key={jurisdiction} value={jurisdiction}>
              {stateName(jurisdiction)}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block text-2xs text-ink-faint">
          The state whose rules govern the policy, which is not always where your office is.
        </span>
      </label>

      {state?.producesEstimates ? (
        <div className="border border-cleared/40 bg-cleared-soft px-5 py-5">
          <p className="text-sm font-semibold text-cleared">
            {state.name} is supported.
          </p>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
            SubLedger will apply the audit treatment for {state.name} under{' '}
            {state.ratingBureau}, using ruleset{' '}
            <span className="font-mono text-2xs">
              {state.rulesetId} {state.rulesetVersion}
            </span>
            . Next you will enter your policy term and rate, then upload a vendor payment
            report. Certificates come later.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/setup?jurisdiction=${state.jurisdiction}`} className="btn">
              Continue
            </Link>
            <Link href={state.path} className="btn-quiet">
              How {state.name} treats subcontractors
            </Link>
          </div>
        </div>
      ) : null}

      {state && !state.producesEstimates ? (
        <div className="border-l-4 border-note bg-note/5 px-5 py-5">
          <p className="text-sm font-semibold text-note">
            SubLedger does not yet produce a reliable premium estimate for {state.name}.
          </p>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
            {state.ratingBureau} governs {state.name}, and its rules have not been
            transcribed into the product yet. Rather than apply another state’s treatment
            and hand you a number, SubLedger stops here. There is no national approximation
            behind this button.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={`/waitlist?state=${state.jurisdiction}`} className="btn">
              Tell me when {state.name} is ready
            </Link>
            <Link href={state.path} className="btn-quiet">
              What is missing for {state.name}
            </Link>
          </div>
        </div>
      ) : null}

      {unrecognised ? (
        <div className="border-l-4 border-note bg-note/5 px-5 py-5">
          <p className="text-sm font-semibold text-note">
            SubLedger does not yet cover {stateName(selected)}.
          </p>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
            No ruleset in this build applies to it, so no estimate is produced.
          </p>
          <Link href={`/waitlist?state=${selected}`} className="btn mt-4">
            Join the waitlist
          </Link>
        </div>
      ) : null}
    </div>
  );
}
