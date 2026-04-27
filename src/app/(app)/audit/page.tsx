import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { PageHeader } from '@/components/page-header';
import { ScrollText } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  'conversation.takeover_on': 'تولّى الرد',
  'conversation.takeover_off': 'أعاد البوت',
  'conversation.note_edit': 'حدّث ملاحظات',
  'customer.block': 'حظر رقم',
  'customer.unblock': 'ألغى الحظر',
  'kb.update': 'حدّث قاعدة المعرفة',
  'settings.update': 'حدّث الإعدادات',
  'booking.create': 'أنشأ موعد',
  'booking.cancel': 'ألغى موعد',
  'handoff.resolve': 'حلّ تنبيه',
};

export default async function AuditPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('audit_log')
    .select('id, actor_email, action, target_type, target_id, details, created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const items = (rows ?? []) as AuditRow[];

  return (
    <div>
      <PageHeader
        eyebrow="08 / سجل النشاط"
        title="سجل عمليات المشغّل"
        subtitle={`آخر ${items.length} إجراء على هذا الحساب`}
      />

      {items.length === 0 ? (
        <div
          className="py-20 text-center panel"
          style={{ borderStyle: 'dashed' }}
        >
          <ScrollText
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا يوجد نشاط بعد. كل ما يقوم به المشغّل من تعديل أو إلغاء سيظهر هنا.
          </p>
        </div>
      ) : (
        <div>
          <div
            className="grid grid-cols-[1fr_180px_120px] gap-4 py-3 px-4 text-[10px]"
            style={{
              borderBottom: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            <span>الإجراء</span>
            <span>المشغّل</span>
            <span className="text-left">الوقت</span>
          </div>

          {items.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_180px_120px] gap-4 items-center py-3.5 px-4"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="min-w-0">
                <div
                  className="text-sm"
                  style={{ color: 'var(--ink)' }}
                >
                  {ACTION_LABELS[row.action] ?? row.action}
                </div>
                <div
                  className="text-[10px] mt-0.5 truncate"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                >
                  {row.target_type ? `${row.target_type}` : ''}
                  {row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ''}
                </div>
              </div>

              <div
                className="text-xs truncate"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
                dir="ltr"
              >
                {row.actor_email ?? '—'}
              </div>

              <div
                className="text-[11px] tabular text-left"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                title={new Date(row.created_at).toLocaleString()}
              >
                {formatDistanceToNow(row.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
