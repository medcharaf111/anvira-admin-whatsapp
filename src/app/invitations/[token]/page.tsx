import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AcceptInvitationForm } from './accept-form';

export const dynamic = 'force-dynamic';

interface LookupResponse {
  ok?: boolean;
  business_name?: string;
  email?: string;
  role?: string;
  expires_at?: string;
  error?: string;
}

async function fetchInvitation(
  token: string,
  origin: string
): Promise<LookupResponse | null> {
  try {
    const res = await fetch(`${origin}/api/invitations/${token}`, {
      cache: 'no-store',
    });
    return (await res.json()) as LookupResponse;
  } catch {
    return null;
  }
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // The recipient must be signed in to accept — the auth context is the
  // only way the backend can attach the invitation to a user_id. If
  // they're not signed in, route to /login with a return URL so they
  // come back here after auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/invitations/${encodeURIComponent(token)}`);
  }

  // Server-side fetch via the admin API. This page is rendered on the
  // server, so use the same origin the request came in on.
  const origin =
    process.env.NEXT_PUBLIC_ADMIN_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3002';
  const inv = await fetchInvitation(token, origin);

  const notValid =
    !inv || !inv.ok || !inv.business_name || !inv.email || !inv.role;

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-6 py-10"
      style={{ background: 'var(--paper)' }}
    >
      <div
        className="w-full max-w-lg p-8 sm:p-10"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '4px',
        }}
      >
        {notValid ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--signal, #a8262c)' }}
              />
              <span className="eyebrow">INVALID INVITATION</span>
            </div>
            <h1
              className="text-2xl sm:text-3xl mb-3"
              style={{ color: 'var(--ink)', fontWeight: 500 }}
            >
              This invitation is no longer valid.
            </h1>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--ink-soft)' }}
            >
              {inv?.error === 'expired'
                ? 'The invitation has expired. Ask the inviter to send a new one.'
                : inv?.error === 'already_resolved'
                  ? 'The invitation has already been accepted or revoked.'
                  : 'We couldn\'t find an active invitation with this link.'}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--primary-glow)' }}
              />
              <span className="eyebrow">TEAM INVITATION</span>
            </div>
            <h1
              className="text-2xl sm:text-3xl mb-3"
              style={{ color: 'var(--ink)', fontWeight: 500 }}
            >
              Join {inv.business_name} on Anvira.
            </h1>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: 'var(--ink-soft)' }}
            >
              You were invited as <strong>{inv.role}</strong>. Accept to start
              handling buyer conversations, KYC, and bookings for{' '}
              <strong>{inv.business_name}</strong>.
            </p>
            {user.email &&
              inv.email &&
              user.email.toLowerCase() !== inv.email.toLowerCase() && (
                <p
                  className="mb-6 p-3 text-xs"
                  style={{
                    background: 'color-mix(in srgb, var(--warn, #b6852b) 12%, var(--paper-sink))',
                    border: '1px solid color-mix(in srgb, var(--warn, #b6852b) 40%, var(--rule))',
                    borderRadius: '3px',
                    color: 'var(--ink-soft)',
                  }}
                >
                  Heads up: this invitation was sent to{' '}
                  <strong>{inv.email}</strong> but you're signed in as{' '}
                  <strong>{user.email}</strong>. Accept will fail unless these
                  match — sign out and back in with the invited email.
                </p>
              )}
            <AcceptInvitationForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
