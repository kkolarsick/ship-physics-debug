'use client';

import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/db/supabase';

/**
 * Sign-in by emailed link.
 *
 * A one-person contractor's office does not need password recovery flows, and a magic
 * link means there is no password for this app to get wrong. The org row and the
 * membership that row-level security keys on are created on first sign-in.
 */
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setState('sending');
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
      return;
    }
    setState('sent');
    setMessage('Check your email for the sign-in link.');
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={submit} className="panel">
        <div className="panel-head">
          <h1 className="text-sm font-semibold">Sign in</h1>
        </div>
        <div className="space-y-3 px-5 py-5">
          <label className="block">
            <span className="label">Work email</span>
            <input
              className="field mt-1"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@yourcompany.com"
            />
          </label>
          <button type="submit" className="btn w-full" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {message ? (
            <p className={`text-sm ${state === 'error' ? 'text-risk' : 'text-cleared'}`}>
              {message}
            </p>
          ) : null}
          <p className="text-2xs text-ink-faint">
            Certificates hold other businesses’ information. Access is scoped to your
            organization at the database level, not just in the interface.
          </p>
        </div>
      </form>
    </div>
  );
}
