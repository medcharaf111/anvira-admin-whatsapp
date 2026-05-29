import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: CookieToSet[]) =>
          toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  // /signup is reachable without auth so brokerage owners can create tst
  // an initial account before going through /onboarding.
  // /invitations/* is reachable without auth — the invitee may not have
  // an Anvira account yet; the page renders SignupInvitationForm to
  // collect a password and provision the account inline. Auth users
  // hitting the same URL still see the regular AcceptInvitationForm.
  const isPublic =
    path === '/login' ||
    path === '/signup' ||
    path === '/reset-password' ||
    path.startsWith('/invitations/');

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  // Authed users have no reason to be on the auth screens — bounce them
  // into the app. /onboarding handles the no-tenant case separately.
  if (user && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/conversations', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
