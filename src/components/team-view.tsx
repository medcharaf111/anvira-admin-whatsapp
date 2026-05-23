'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, UserPlus, X, Crown, Shield, User, Eye } from 'lucide-react';

type Role = 'owner' | 'admin' | 'agent' | 'viewer';

interface Member {
  id: string;
  user_id: string;
  role: Role;
  invited_at: string;
  accepted_at: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_at: string;
  expires_at: string;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer',
};

const ROLE_HINT: Record<Role, string> = {
  owner: 'Full access including team management + role changes',
  admin: 'Full access + can invite/revoke non-owner members',
  agent: 'Replies, KYC, bookings, properties — no team management',
  viewer: 'Read-only access',
};

function RoleIcon({ role }: { role: Role }) {
  switch (role) {
    case 'owner':
      return <Crown className="w-3.5 h-3.5" />;
    case 'admin':
      return <Shield className="w-3.5 h-3.5" />;
    case 'agent':
      return <User className="w-3.5 h-3.5" />;
    case 'viewer':
      return <Eye className="w-3.5 h-3.5" />;
  }
}

export function TeamView({
  currentUserId,
  currentUserRole,
  members,
  invitations,
}: {
  currentUserId: string;
  currentUserRole: Role;
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const canManage =
    currentUserRole === 'owner' || currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner';

  const [busyId, setBusyId] = useState<string | null>(null);

  async function revokeInvite(id: string) {
    if (!window.confirm('Revoke this invitation? The recipient won\'t be able to accept it.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/team/invitations/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast.error('Could not revoke invitation');
        return;
      }
      toast.success('Invitation revoked');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function revokeMember(id: string, userId: string) {
    if (userId === currentUserId) {
      toast.error('You can\'t remove yourself');
      return;
    }
    if (!window.confirm('Remove this member from the team? They will lose access immediately.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/team/members/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(
          j.error === 'cannot_revoke_owner'
            ? 'Demote this owner to admin/agent before removing them.'
            : 'Could not remove member'
        );
        return;
      }
      toast.success('Member removed');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(id: string, newRole: Role) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/team/members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(
          j.error === 'cannot_demote_last_owner'
            ? 'There must always be at least one owner.'
            : 'Could not change role'
        );
        return;
      }
      toast.success('Role updated');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-10 mt-8">
      {canManage && <InviteForm />}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <section>
          <SectionHeader title={`Pending invitations (${invitations.length})`} sub="PENDING" />
          <div className="overflow-hidden" style={panelStyle}>
            {invitations.map((i, idx) => (
              <div
                key={i.id}
                className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap"
                style={{
                  borderBottom:
                    idx < invitations.length - 1
                      ? '1px solid var(--rule)'
                      : 'none',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px]"
                    style={{ color: 'var(--ink)' }}
                  >
                    {i.email}
                  </div>
                  <div
                    className="text-[11px] mt-1 flex items-center gap-3"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <RoleIcon role={i.role} />
                      {ROLE_LABEL[i.role]}
                    </span>
                    <span>
                      Invited {new Date(i.invited_at).toLocaleDateString()}
                    </span>
                    <span>
                      Expires {new Date(i.expires_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => revokeInvite(i.id)}
                    disabled={busyId === i.id}
                    className="flex items-center gap-1.5 h-9 px-3 text-[12px] disabled:opacity-50"
                    style={pillStyle}
                  >
                    {busyId === i.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                    <span>REVOKE</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active members */}
      <section>
        <SectionHeader title={`Members (${members.length})`} sub="ACTIVE" />
        <div className="overflow-hidden" style={panelStyle}>
          {members.length === 0 ? (
            <div
              className="p-8 text-center text-[12px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              No members yet.
            </div>
          ) : (
            members.map((m, idx) => {
              const isSelf = m.user_id === currentUserId;
              return (
                <div
                  key={m.id}
                  className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap"
                  style={{
                    borderBottom:
                      idx < members.length - 1
                        ? '1px solid var(--rule)'
                        : 'none',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12px] tabular flex items-center gap-2"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink)',
                        wordBreak: 'break-all',
                      }}
                    >
                      <span>{m.user_id}</span>
                      {isSelf && (
                        <span
                          className="text-[10px] uppercase tracking-widest px-1.5"
                          style={{
                            color: 'var(--primary-glow)',
                            border: '1px solid var(--primary-glow)',
                            borderRadius: '2px',
                          }}
                        >
                          you
                        </span>
                      )}
                    </div>
                    <div
                      className="text-[11px] mt-1 flex items-center gap-3"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <RoleIcon role={m.role} />
                        {ROLE_LABEL[m.role]}
                      </span>
                      <span>
                        Joined{' '}
                        {new Date(
                          m.accepted_at ?? m.invited_at
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isOwner && !isSelf && (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          changeRole(m.id, e.target.value as Role)
                        }
                        disabled={busyId === m.id}
                        className="input-boxed text-[12px] h-9 px-2"
                        style={{ minWidth: 110 }}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    )}
                    {canManage && !isSelf && m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => revokeMember(m.id, m.user_id)}
                        disabled={busyId === m.id}
                        className="flex items-center gap-1.5 h-9 px-3 text-[12px] disabled:opacity-50"
                        style={{
                          background: 'var(--signal, #a8262c)',
                          color: 'var(--paper)',
                          borderRadius: '3px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {busyId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                        <span>REMOVE</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Role legend */}
      <section className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        <SectionHeader title="Roles" sub="REFERENCE" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div
              key={r}
              className="p-3 flex items-start gap-2"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
              }}
            >
              <RoleIcon role={r} />
              <div>
                <div style={{ color: 'var(--ink)', fontWeight: 500 }}>
                  {ROLE_LABEL[r]}
                </div>
                <div style={{ color: 'var(--ink-soft)' }}>{ROLE_HINT[r]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        toast.error(
          j.error === 'already_invited'
            ? 'This email already has a pending invitation.'
            : j.error === 'cannot_invite_owner'
              ? 'Only the current owner can transfer ownership.'
              : `Could not invite (${j.error ?? 'unknown'}${j.detail ? `: ${j.detail}` : ''})`
        );
        return;
      }
      toast.success('Invitation sent');
      setEmail('');
      setRole('agent');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <SectionHeader title="Invite a teammate" sub="NEW INVITATION" />
      <form
        onSubmit={submit}
        className="p-5 flex items-end gap-3 flex-wrap"
        style={panelStyle}
      >
        <div className="flex-1 min-w-[200px]">
          <label className="field-label">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@brokerage.ae"
            className="input-boxed"
            dir="ltr"
          />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="input-boxed"
            style={{ minWidth: 140 }}
          >
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="btn-primary group h-12 px-5"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sending</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span>Send invitation</span>
            </>
          )}
        </button>
      </form>
    </section>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h2
        className="text-lg font-medium"
        style={{ color: 'var(--ink)' }}
      >
        {title}
      </h2>
      <span
        className="text-[11px] tracking-widest uppercase"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
      >
        {sub}
      </span>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'var(--paper-lift)',
  border: '1px solid var(--rule)',
  borderRadius: '3px',
};

const pillStyle: React.CSSProperties = {
  background: 'var(--paper-sink)',
  border: '1px solid var(--rule)',
  borderRadius: '3px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--ink-soft)',
};
