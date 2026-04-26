import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { formatDistanceToNow } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { MessageSquare } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();
  const { data: convos } = await supabase
    .from('conversations')
    .select('id, customer_phone, customer_name, last_message_at, bot_paused, language')
    .eq('client_id', client.id)
    .order('last_message_at', { ascending: false })
    .limit(50);

  const total = convos?.length ?? 0;
  const paused = convos?.filter((c) => c.bot_paused).length ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="01 / المحادثات"
        title="محادثات العملاء"
        subtitle={`${total} محادثة مُسجّلة · ${paused} تحت سيطرتك اليدوية`}
      />

      {/* Stats strip */}
      <div
        className="grid grid-cols-3 gap-px mb-10"
        style={{ background: 'var(--rule)' }}
      >
        {[
          { label: 'المجموع', value: total, accent: false },
          { label: 'البوت يعمل', value: total - paused, accent: true },
          { label: 'تحت سيطرتك', value: paused, accent: false, signal: paused > 0 },
        ].map((stat) => (
          <div key={stat.label} className="p-5" style={{ background: 'var(--paper-lift)' }}>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              {stat.label}
            </div>
            <div
              className="tabular text-3xl"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                color: stat.signal
                  ? 'var(--signal)'
                  : stat.accent
                  ? 'var(--primary-glow)'
                  : 'var(--ink)',
                letterSpacing: '-0.02em',
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* List header */}
      <div
        className="grid grid-cols-[1fr_auto_auto] gap-4 py-3 px-4 text-[10px]"
        style={{
          borderBottom: '1px solid var(--rule)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-faint)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span>العميل</span>
        <span>الحالة</span>
        <span className="text-left w-24">آخر رسالة</span>
      </div>

      {/* List */}
      <div>
        {(convos ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/conversations/${c.id}`}
            className="row-hover block grid grid-cols-[1fr_auto_auto] gap-4 items-center py-4 px-4 group"
            style={{ borderBottom: '1px solid var(--rule)' }}
          >
            <div className="min-w-0 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                style={{
                  background: 'var(--paper-sink)',
                  border: '1px solid var(--rule)',
                  color: 'var(--ink-soft)',
                }}
              >
                {(c.customer_name || c.customer_phone || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--ink)' }}
                >
                  {c.customer_name || 'بدون اسم'}
                </div>
                <div
                  className="text-[11px] mt-0.5 truncate tabular"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                  dir="ltr"
                >
                  {c.customer_phone}
                </div>
              </div>
            </div>

            <div>
              {c.bot_paused ? (
                <span className="pill pill-signal">
                  <span className="pill-dot" />
                  <span>يدوي</span>
                </span>
              ) : (
                <span className="pill pill-success">
                  <span className="pill-dot" />
                  <span>بوت</span>
                </span>
              )}
            </div>

            <div
              className="text-[11px] tabular text-left w-24"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            >
              {formatDistanceToNow(c.last_message_at)}
            </div>
          </Link>
        ))}
      </div>

      {(!convos || convos.length === 0) && (
        <div
          className="py-20 text-center panel mt-4"
          style={{ borderStyle: 'dashed' }}
        >
          <MessageSquare
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            لا توجد محادثات بعد. أرسل رسالة من هاتف التجربة للبدء.
          </p>
        </div>
      )}
    </div>
  );
}
