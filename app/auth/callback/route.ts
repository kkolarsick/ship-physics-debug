import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';

/**
 * Completes the emailed sign-in, then makes sure the account belongs to an org.
 *
 * Row-level security keys on org membership, so an account with no membership can read
 * nothing at all. Fresh workspaces are created through a SECURITY DEFINER RPC that
 * atomically creates the org and its owner membership for auth.uid(); clients cannot
 * self-insert arbitrary org membership rows.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL('/sign-in', url.origin));

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', data.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    const { error: orgError } = await supabase.rpc('create_org_for_current_user', {
      org_name: data.user.email ?? 'Your company',
    });
    if (orgError) {
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent(orgError.message)}`, url.origin),
      );
    }
    return NextResponse.redirect(new URL('/setup', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
