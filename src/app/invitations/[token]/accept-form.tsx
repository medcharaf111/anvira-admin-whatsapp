'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

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
        client_id?: string;
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
      // Land in the dashboard. The getCurrentClient resolver now sees
      // the new tenant_members row and routes the operator into the
      // brokerage they just joined.
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
