import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { TeamView } from '@/components/team-view';

export const dynamic = 'force-dynamic';

/**
 * /team — Tenant member management.
 *
 * Owner/admin can invite + revoke + change roles. Other roles see a
 * read-only roster (useful so agents know who else is in the brokerage).
 * Pending invitations sit in their own section so they're not confused
 * with active members.
 */
export default async function TeamPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Member roster — pulls auth.users email via the foreign join. RLS on
  // tenant_members already gates this to the current tenant via
  // user_can_access_client(client_id). The auth.users join is allowed
  // because the Supabase JS client embeds via the FK.
  const { data: members } = await supabase
    .from('tenant_members')
    .select('id, user_id, role, invited_at, accepted_at, status')
    .eq('client_id', client.id)
    .eq('status', 'accepted')
    .order('role', { ascending: true })
    .order('invited_at', { ascending: true });

  // Resolve member emails via the auth admin API isn't available in the
  // browser-side anon role — service role is on the backend. As a v1
  // compromise we render user_id (uuid) and let the operator look up
  // emails out-of-band. A follow-up could expose a /api/team/members
  // endpoint that joins auth.users on the backend with service role.
  const memberRows = (members ?? []).map((m) => ({
    id: m.id as string,
    user_id: m.user_id as string,
    role: m.role as 'owner' | 'admin' | 'agent' | 'viewer',
    invited_at: m.invited_at as string,
    accepted_at: (m.accepted_at as string | null) ?? null,
  }));

  const { data: invites } = await supabase
    .from('tenant_invitations')
    .select('id, email, role, invited_at, expires_at, status')
    .eq('client_id', client.id)
    .eq('status', 'pending')
    .order('invited_at', { ascending: false });

  const inviteRows = (invites ?? []).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    role: i.role as 'owner' | 'admin' | 'agent' | 'viewer',
    invited_at: i.invited_at as string,
    expires_at: i.expires_at as string,
  }));

  return (
    <div>
      <RealtimeRefresh
        subs={[
          {
            table: 'tenant_members',
            filter: `client_id=eq.${client.id}`,
            events: ['INSERT', 'UPDATE', 'DELETE'],
          },
          {
            table: 'tenant_invitations',
            filter: `client_id=eq.${client.id}`,
            events: ['INSERT', 'UPDATE'],
          },
        ]}
      />
      <PageHeader
        eyebrow="00 / الفريق"
        title="Team"
        subtitle="Invite agents and admins to your Anvira workspace. Owners can change roles and revoke access; admins can invite and revoke."
      />
      <TeamView
        currentUserId={user?.id ?? client.owner_id}
        currentUserRole={client.current_user_role}
        members={memberRows}
        invitations={inviteRows}
      />
    </div>
  );
}
