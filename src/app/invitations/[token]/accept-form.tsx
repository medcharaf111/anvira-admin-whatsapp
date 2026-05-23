'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Path for invitees who already have an Anvira account and are signed in.
 * Backend's accept endpoint verifies that the session email matches the
 * invitation email (email-must-match guard).
 */
export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/accept`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(
          json.error === 'email_mismatch'
            ? 'The invitation was sent to a different email than the one you are signed in with.'
            : json.error === 'expired'
              ? 'This invitation has expired. Ask the inviter to send a new one.'
              : json.error === 'not_found'
                ? 'Invitation not found.'
                : `Could not accept invitation (${json.error ?? 'unknown'})`
        );
        return;
      }
      router.push('/conversations');
      router.refresh();
    } catch {
      setError('Connection failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={submitting}
        className="btn-primary group w-full h-12"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Accepting...</span>
          </>
        ) : (
          <span>Accept invitation</span>
        )}
      </button>
      {error && (
        <p
          className="mt-3 text-xs"
          style={{ color: 'var(--signal, #a8262c)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Path for invitees who DON'T have an Anvira account yet. Shows the
 * email pre-filled (read-only — must match invitation) and a password
 * field. Submit:
 *   1. POST /api/invitations/[token]/signup with the chosen password.
 *      Backend creates the auth user via service-role admin API with
 *      email_confirm=true (the invitation email proved ownership) and
 *      inserts the tenant_members row in the same call.
 *   2. Client signs in via supabase.auth.signInWithPassword to start
 *      the session without bouncing through /login.
 *   3. Land on /conversations.
 *
 * If the email already has an account, backend returns 409
 * already_exists — we render a sign-in nudge so the user can go to
 * /login and come back as the existing user (the accept step still
 * works via the AcceptInvitationForm path).
 */
export function SignupInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/signup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        email?: string;
      };
      if (!res.ok) {
        if (json.error === 'already_exists') {
          setNeedsSignIn(true);
          setError(
            `An Anvira account already exists for ${email}. Sign in below to accept the invitation.`
          );
        } else if (json.error === 'weak_password') {
          setError(json.detail ?? 'Password too weak.');
        } else if (json.error === 'expired') {
          setError(
            'This invitation has expired. Ask the inviter to send a new one.'
          );
        } else {
          setError(
            `Could not create account (${json.error ?? 'unknown'}${
              json.detail ? `: ${json.detail}` : ''
            })`
          );
        }
        return;
      }

      // Backend created the user + accepted the invitation. Now sign
      // in client-side so the session cookie lands on this origin and
      // the next page render sees the authed user.
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: json.email ?? email,
        password,
      });
      if (signInErr) {
        // Account exists but sign-in failed (rare — wrong password
        // race or rate-limit). The membership is real, so route to
        // /login and let them try.
        setError(
          'Account created but sign-in failed. Try signing in with the email + password you just set.'
        );
        setNeedsSignIn(true);
        return;
      }
      router.push('/conversations');
      router.refresh();
    } catch {
      setError('Connection failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="field-label">Email</label>
        <input
          type="email"
          value={email}
          readOnly
          dir="ltr"
          className="input-boxed"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'var(--paper-sink)',
            color: 'var(--ink-soft)',
          }}
        />
        <p
          className="text-[10px] mt-1.5"
          style={{ color: 'var(--ink-faint)' }}
        >
          This is the email the invitation was sent to and cannot be changed.
        </p>
      </div>
      <div>
        <label className="field-label">Choose a password</label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          className="input-boxed"
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label className="field-label">Confirm password</label>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          dir="ltr"
          className="input-boxed"
        />
      </div>
      <button
        type="submit"
        disabled={
          submitting || password.length < 8 || password !== confirm
        }
        className="btn-primary group w-full h-12"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Creating account...</span>
          </>
        ) : (
          <span>Create account & accept invitation</span>
        )}
      </button>
      {error && (
        <div>
          <p
            className="text-xs"
            style={{ color: 'var(--signal, #a8262c)' }}
          >
            {error}
          </p>
          {needsSignIn && (
            <a
              href={`/login?next=${encodeURIComponent(
                `/invitations/${token}`
              )}`}
              className="inline-block mt-2 text-xs underline"
              style={{ color: 'var(--primary-glow)' }}
            >
              Go to sign in
            </a>
          )}
        </div>
      )}
    </form>
  );
}
