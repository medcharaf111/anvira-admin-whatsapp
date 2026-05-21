import { Sidebar } from '@/components/sidebar';
import { PageTransition } from '@/components/page-transition';
import { TopBar } from '@/components/top-bar';
import { CommandPalette } from '@/components/command-palette';
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { isOperatorEmail } from '@/lib/operator';
import { redirect } from 'next/navigation';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const client = await getCurrentClient();
  // No client linked → first-time setup
  if (!client) redirect('/onboarding');

  // Alert count scoped to this client (RLS enforces, but we filter explicitly for clarity)
  const { count: alertCount } = await supabase
    .from('handoffs')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .eq('resolved', false);

  // Hot-lead count (real-estate only) — drives sidebar badge for /leads.
  // 'hot' and 'viewing_booked' are the high-priority stages an operator
  // probably wants to touch first.
  let hotLeadCount = 0;
  if (client.client_type === 'real_estate') {
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .in('lead_stage', ['hot', 'viewing_booked']);
    hotLeadCount = count ?? 0;
  }

  const operatorView = isOperatorEmail(user.email);

  return (
    <div dir="rtl" className="flex min-h-dvh" style={{ background: 'var(--paper)' }}>
      {/* Layout-level realtime: refreshes the unresolved-handoff badge in the
          sidebar whenever a new alert is created or one is resolved, no matter
          which page the operator is on. INSERT/UPDATE only — DELETE shouldn't
          happen for handoffs. */}
      <RealtimeRefresh
        subs={[
          {
            table: 'handoffs',
            filter: `client_id=eq.${client.id}`,
            events: ['INSERT', 'UPDATE'],
          },
        ]}
      />

      {/* Cross-cutting global widgets — mounted once, listen for hotkeys
          and custom events from anywhere in the (app) tree. */}
      <CommandPalette clientType={client.client_type} isOperator={operatorView} />
      <KeyboardShortcuts clientType={client.client_type} />

      <Sidebar
        alertCount={alertCount ?? 0}
        hotLeadCount={hotLeadCount}
        isOperator={operatorView}
        clientType={client.client_type}
        kycEnabled={client.kyc_enabled}
      />
      <main className="flex-1 overflow-auto pt-12 md:pt-0">
        <TopBar
          clientName={client.name}
          isSandbox={client.is_sandbox}
          timezone={client.business_timezone}
          transport={client.transport}
        />

        <div className="mx-auto max-w-7xl px-5 sm:px-8 md:px-12 py-8 sm:py-10 md:py-14">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
