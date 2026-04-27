import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { TemplatesEditor } from '@/components/templates-editor';

export const dynamic = 'force-dynamic';

export interface ReplyTemplate {
  id: string;
  label: string;
  body: string;
  language: string;
  sort_order: number;
}

export default async function TemplatesPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const { data } = await supabase
    .from('reply_templates')
    .select('id, label, body, language, sort_order')
    .eq('client_id', client.id)
    .order('sort_order')
    .order('created_at');

  const templates = (data ?? []) as ReplyTemplate[];

  return (
    <div>
      <PageHeader
        eyebrow="09 / الردود الجاهزة"
        title="ردود سريعة قابلة للإعادة"
        subtitle="أنشئ نصوص جاهزة يقدر المشغّل يدخلها بضغطة في صندوق الرد."
      />
      <TemplatesEditor initial={templates} />
    </div>
  );
}
