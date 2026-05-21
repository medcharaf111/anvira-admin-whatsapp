import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { ProjectsTable, type ProjectRow } from '@/components/real-estate/projects-table';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const client = await requireCurrentClient();
  if (client.client_type !== 'real_estate') notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as ProjectRow[];

  return (
    <div>
      <RealtimeRefresh
        subs={[{ table: 'projects', filter: `client_id=eq.${client.id}` }]}
      />
      <PageHeader
        eyebrow="11 / المشاريع"
        title="مشاريع المطورين"
        subtitle={`${rows.length} مشروع · ${rows.filter((p) => p.status === 'active').length} نشط · ${rows.filter((p) => p.status === 'pre_launch').length} قبل الإطلاق`}
      />
      <ProjectsTable projects={rows} />
    </div>
  );
}
