import { createClient } from '@/lib/supabase/server';
import { KbForm } from '@/components/kb-form';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function KBPage() {
  const supabase = await createClient();
  const { data: kb } = await supabase.from('knowledge_base').select('*').single();

  return (
    <div>
      <PageHeader
        eyebrow="04 / قاعدة المعرفة"
        title="ما يعرفه المساعد"
        subtitle="اكتب لمساعدك كل ما يحتاج معرفته عن عملك — بلغة طبيعية، كأنك تشرح لموظف جديد."
      />
      <KbForm initial={kb ?? {}} />
    </div>
  );
}
