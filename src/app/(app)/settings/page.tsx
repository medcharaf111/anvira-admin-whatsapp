import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { SettingsForm } from '@/components/settings-form';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('client_id', client.id)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        eyebrow="05 / الإعدادات"
        title="إعدادات المساعد"
        subtitle="ساعات العمل، ربط التقويم، قواعد التحويل، والتنبيهات."
      />
      <SettingsForm initial={settings ?? {}} clientId={client.id} />
    </div>
  );
}
