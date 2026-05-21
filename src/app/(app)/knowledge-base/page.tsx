import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { KbForm } from '@/components/kb-form';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function KBPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const { data: kb } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('client_id', client.id)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        eyebrow="04 / قاعدة المعرفة"
        title="ما يعرفه المساعد"
        subtitle="اكتب لمساعدك كل ما يحتاج معرفته عن عملك — بلغة طبيعية، كأنك تشرح لموظف جديد."
      />
      <KbForm initial={kb ?? {}} clientType={client.client_type} />
    </div>
  );
}
