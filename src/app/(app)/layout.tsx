import { Sidebar } from '@/components/sidebar';
import { PageTransition } from '@/components/page-transition';
import { ThemeToggle } from '@/components/theme-toggle';
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
      <Sidebar alertCount={alertCount ?? 0} isOperator={operatorView} />
      <main className="flex-1 overflow-auto pt-12 md:pt-0">
        {/* Top bar — theme toggle (desktop only; on mobile it's in the sidebar top bar) */}
        <div
          className="hidden md:flex sticky top-0 z-40 items-center justify-end gap-3 px-12 h-14"
          style={{
            background: 'color-mix(in srgb, var(--paper) 88%, transparent)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <span
            className="text-[11px] mr-auto"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.08em',
            }}
          >
            {client.name}
            {client.is_sandbox ? ' · SANDBOX' : ''}
          </span>
          <ThemeToggle />
        </div>

        <div className="mx-auto max-w-7xl px-5 sm:px-8 md:px-12 py-8 sm:py-10 md:py-14">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
