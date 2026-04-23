import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/components/settings-form';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from('settings').select('*').single();

  return (
    <div>
      <PageHeader
        eyebrow="05 / الإعدادات"
        title="إعدادات المساعد"
        subtitle="ساعات العمل، ربط التقويم، قواعد التحويل، والتنبيهات."
      />
      <SettingsForm initial={settings ?? {}} />
    </div>
  );
}
