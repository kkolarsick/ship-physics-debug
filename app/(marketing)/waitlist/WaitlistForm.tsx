'use client';

import { useState } from 'react';
import { ALL_JURISDICTIONS, stateName } from '@/lib/marketing/jurisdictions';

/**
 * Waitlist capture for a state SubLedger cannot price yet.
 *
 * Deliberately the only thing on this site that asks for an email before showing value.
 * It exists because the alternative for an unsupported state is a dead end, not because
 * an address is worth collecting on its own.
 */
export function WaitlistForm({ defaultState }: { defaultState: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [jurisdiction, setJurisdiction] = useState(defaultState);

  if (submitted) {
    return (
      <div className="border border-cleared/40 bg-cleared-soft px-5 py-5">
        <p className="text-sm font-semibold text-cleared">Noted.</p>
        <p className="mt-1.5 text-sm text-ink-muted">
          We will write to {email || 'you'} when{' '}
          {jurisdiction ? stateName(jurisdiction) : 'your state'} has a ruleset in place. No
          other mail.
        </p>
      </div>
    );
  }

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      <label className="block">
        <span className="label">State</span>
        <select
          className="field mt-1.5"
          value={jurisdiction}
          onChange={(event) => setJurisdiction(event.target.value)}
          required
        >
          <option value="">Choose a state…</option>
          {ALL_JURISDICTIONS.map((code) => (
            <option key={code} value={code}>
              {stateName(code)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label">Work email</span>
        <input
          className="field mt-1.5"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@yourcompany.com"
        />
      </label>

      <button type="submit" className="btn w-full">
        Tell me when it is ready
      </button>

      <p className="text-2xs text-ink-faint">
        Used for one message about this state and nothing else.
      </p>
    </form>
  );
}
