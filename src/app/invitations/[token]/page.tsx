import { createClient } from '@/lib/supabase/server';
import { AcceptInvitationForm, SignupInvitationForm } from './accept-form';

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

/**
 * /invitations/[token] — public-ish page (no current-tenant requirement).
 *
 * Three rendered states:
 *   1. Invitation invalid (not found / expired / already resolved) — error panel.
 *   2. Not signed in — show SignupInvitationForm so the invitee can pick a
 *      password. We use Supabase admin createUser w/ email_confirm=true
 *      under the hood (the invitation email IS the email verification).
 *      After signup we immediately signInWithPassword + land them on
 *      /conversations.
 *   3. Signed in — show AcceptInvitationForm (existing flow). If their
 *      session email doesn't match the invite email, render a warning
 *      since the backend will reject the accept with email_mismatch.
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
              You were invited as <strong>{inv.role}</strong>
              {' — '}
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {inv.email}
              </span>
              .
            </p>

            {!user ? (
              <SignupInvitationForm token={token} email={inv.email!} />
            ) : user.email &&
              inv.email &&
              user.email.toLowerCase() !== inv.email.toLowerCase() ? (
              <>
                <p
                  className="mb-6 p-3 text-xs"
                  style={{
                    background: 'color-mix(in srgb, var(--warn, #b6852b) 12%, var(--paper-sink))',
                    border: '1px solid color-mix(in srgb, var(--warn, #b6852b) 40%, var(--rule))',
                    borderRadius: '3px',
                    color: 'var(--ink-soft)',
                  }}
                >
                  This invitation was sent to <strong>{inv.email}</strong> but
                  you're signed in as <strong>{user.email}</strong>. Sign out
                  and back in with the invited email, or open this link in an
                  incognito window.
                </p>
                <AcceptInvitationForm token={token} />
              </>
            ) : (
              <AcceptInvitationForm token={token} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
