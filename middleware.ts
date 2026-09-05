import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Session refresh (Supabase mode only).
 *
 * Server Components cannot write cookies, so the refreshed session has to be written
 * here or a signed-in user gets logged out whenever their token rotates. With no Supabase
 * configured the app runs against the local demo store and this is a pass-through.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user && isPublic(request.nextUrl.pathname)) {
    return response;
  }

  if (!data.user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/sign-in';
    redirect.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  return response;
}

/**
 * Everything a stranger has to be able to reach before they have an account: the pitch,
 * the state pages that carry its credibility, the trust pages, and the front of the scan.
 * The funnel is the sales process, so none of it may sit behind a sign-in wall.
 */
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/auth',
  '/supported-states',
  '/methodology',
  '/pricing',
  '/privacy',
  '/security',
  '/data-handling',
  '/scan',
  '/waitlist',
];

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname.endsWith('/workers-comp-audit')) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/files).*)'],
};
