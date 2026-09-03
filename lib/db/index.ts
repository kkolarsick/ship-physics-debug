/**
 * Store selection.
 *
 * Supabase when it is configured; the local JSON store otherwise. The fallback is what
 * makes `npm run seed && npm run dev` produce a working, populated app with no cloud
 * account — it is a development and demo affordance, never a production path.
 */
import { DemoStore } from './demo-store';
import { SupabaseStore } from './supabase-store';
import { createServerSupabase, supabaseConfigured } from './supabase';
import type { Store } from './store';

export type StoreMode = 'supabase' | 'demo';

export function storeMode(): StoreMode {
  return supabaseConfigured() ? 'supabase' : 'demo';
}

export class NotSignedInError extends Error {
  constructor() {
    super('not signed in');
    this.name = 'NotSignedInError';
  }
}

export class NoOrgError extends Error {
  constructor() {
    super('this account is not a member of any organization');
    this.name = 'NoOrgError';
  }
}

/** The store for the current request. */
export async function getStore(): Promise<Store> {
  if (!supabaseConfigured()) return new DemoStore();

  const client = await createServerSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new NotSignedInError();

  const { data: membership, error: membershipError } = await client
    .from('org_members')
    .select('org_id')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`org_members: ${membershipError.message}`);
  if (!membership) throw new NoOrgError();

  return new SupabaseStore(client, String(membership.org_id), data.user.email ?? data.user.id);
}

export { DemoStore } from './demo-store';
export { SupabaseStore } from './supabase-store';
export type { Store, NewPayment } from './store';
export type * from './types';
