/**
 * Supabase clients.
 *
 * Every query runs as the signed-in user so row-level security — keyed on org_id on every
 * table — is the thing actually enforcing tenancy. Nothing here uses the service role key;
 * a cross-tenant leak of certificates would be fatal to this product, and the safest way
 * to avoid one is to never hold a key that can cross tenants in request-handling code.
 */
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function supabaseConfigured(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== '' &&
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== ''
  );
}

function requireConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to use the Supabase store',
    );
  }
  return { url, anonKey };
}

export function createBrowserSupabase(): SupabaseClient {
  const { url, anonKey } = requireConfig();
  return createBrowserClient(url, anonKey);
}

/** Server-side client. Pass Next's cookie store so the session refreshes correctly. */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const { url, anonKey } = requireConfig();
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Middleware
          // refreshes the session instead.
        }
      },
    },
  });
}
