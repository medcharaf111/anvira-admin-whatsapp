import { Sidebar } from '@/components/sidebar';
import { PageTransition } from '@/components/page-transition';
import { ThemeToggle } from '@/components/theme-toggle';
import { createClient } from '@/lib/supabase/server';
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

  const { count: alertCount } = await supabase
    .from('handoffs')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false);

  return (
    <div dir="rtl" className="flex min-h-dvh" style={{ background: 'var(--paper)' }}>
      <Sidebar alertCount={alertCount ?? 0} />
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
          <ThemeToggle />
        </div>

        <div className="mx-auto max-w-7xl px-5 sm:px-8 md:px-12 py-8 sm:py-10 md:py-14">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
