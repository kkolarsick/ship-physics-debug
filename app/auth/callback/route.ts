import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/db/supabase';

/**
 * Completes the emailed sign-in, then makes sure the account belongs to an org.
 *
 * Row-level security keys on org membership, so an account with no membership can read
 * nothing at all. Creating the org here is what turns a fresh sign-in into a usable
 * workspace; an existing member falls straight through.
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
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .insert({ name: data.user.email ?? 'Your company' })
      .select('id')
      .single();
    if (orgError) {
      return NextResponse.redirect(
        new URL(`/sign-in?error=${encodeURIComponent(orgError.message)}`, url.origin),
      );
    }
    await supabase.from('org_members').insert({ org_id: org.id, user_id: data.user.id });
    return NextResponse.redirect(new URL('/setup', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
