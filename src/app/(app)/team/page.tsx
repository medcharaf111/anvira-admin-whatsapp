import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { TeamView } from '@/components/team-view';
import { callInternal, getInternalContext } from '@/lib/internal-api';

export const dynamic = 'force-dynamic';

interface EnrichedMember {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  invited_at: string;
  accepted_at: string | null;
}

/**
 * /team — Tenant member management.
 *
 * Owner/admin can invite + revoke + change roles. Other roles see a
 * read-only roster (useful so agents know who else is in the brokerage).
 * Pending invitations sit in their own section so they're not confused
 * with active members.
 *
 * Member roster comes from the backend (`GET /internal/team/members`)
 * because the anon client can't read auth.users — joining for email +
 * display name requires service role.
 */
export default async function TeamPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Enriched member list (email + name joined from auth.users).
  let memberRows: EnrichedMember[] = [];
  const ctx = getInternalContext(client.id);
  const memRes = await callInternal(ctx, '/internal/team/members', {
    method: 'GET',
  });
  if (memRes.provisioned && memRes.ok) {
    const body = memRes.json as { members?: EnrichedMember[] };
    memberRows = body?.members ?? [];
  }

  // Pending invitations come straight from the table — emails are
  // stored on tenant_invitations itself, no enrichment needed.
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
