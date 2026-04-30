import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { formatDistanceToNow } from '@/lib/format';
import { AlertResolveButton } from '@/components/alert-resolve-button';
import { PageHeader } from '@/components/page-header';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import Link from 'next/link';
import { MessageSquare, CheckCircle2, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const REASON_META: Record<
  string,
  { label: string; severity: 'signal' | 'warn' | 'idle' }
> = {
  complaint: { label: 'شكوى', severity: 'signal' },
  explicit_request: { label: 'طلب تحويل يدوي', severity: 'signal' },
  unknown_answer: { label: 'إجابة غير متوفرة', severity: 'warn' },
  complex: { label: 'طلب معقّد', severity: 'warn' },
  after_hours: { label: 'خارج أوقات العمل', severity: 'idle' },
};

interface Handoff {
  id: string;
  conversation_id: string;
  reason: string;
  trigger_message: string | null;
  resolved: boolean;
  created_at: string;
  conversations: {
    customer_phone: string;
    customer_name: string | null;
  } | null;
}

export default async function AlertsPage() {
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const { data: unresolved } = await supabase
    .from('handoffs')
    .select('id, conversation_id, reason, trigger_message, resolved, created_at, conversations(customer_phone, customer_name)')
    .eq('client_id', client.id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: resolved } = await supabase
    .from('handoffs')
    .select('id, conversation_id, reason, trigger_message, resolved, created_at, conversations(customer_phone, customer_name)')
    .eq('client_id', client.id)
    .eq('resolved', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const unresolvedCount = unresolved?.length ?? 0;

  return (
    <div>
      <RealtimeRefresh
        subs={[
          { table: 'handoffs', filter: `client_id=eq.${client.id}` },
        ]}
      />
      <PageHeader
        eyebrow="02 / التنبيهات"
        title="تنبيهات تحتاج تدخلك"
        subtitle={
          unresolvedCount > 0
            ? `${unresolvedCount} محادثة توقف فيها البوت بانتظار ردك`
            : 'كل المحادثات تسير بسلاسة — البوت يتولى كل شيء'
        }
      />

      {/* Unresolved */}
      {unresolvedCount === 0 ? (
        <div
          className="py-16 px-8 text-center panel"
          style={{ borderStyle: 'dashed', borderColor: 'var(--rule)' }}
        >
          <CheckCircle2
            className="w-12 h-12 mx-auto mb-5"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1}
          />
          <p
            className="display-ar text-xl mb-2"
            style={{ color: 'var(--ink)' }}
          >
            نظيف.
          </p>
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
            لا توجد تنبيهات جديدة. البوت يدير كل المحادثات.
          </p>
        </div>
      ) : (
        <div className="mb-14">
          <div className="flex items-center gap-3 mb-6">
            <span
              className="w-2 h-2 rounded-full pulse-dot"
              style={{ background: 'var(--signal)' }}
            />
            <span className="eyebrow" style={{ color: 'var(--signal)' }}>
              URGENT · {unresolvedCount}
            </span>
          </div>
          <div>
            {(unresolved as unknown as Handoff[]).map((h) => (
              <AlertRow key={h.id} handoff={h} showResolve />
            ))}
          </div>
        </div>
      )}

      {/* Resolved history */}
      {resolved && resolved.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6 mt-12">
            <span className="eyebrow">محلولة · RESOLVED</span>
            <span className="h-px flex-1 max-w-[200px]" style={{ background: 'var(--rule)' }} />
          </div>
          <div style={{ opacity: 0.6 }}>
            {(resolved as unknown as Handoff[]).map((h) => (
              <AlertRow key={h.id} handoff={h} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({ handoff, showResolve }: { handoff: Handoff; showResolve?: boolean }) {
  const meta = REASON_META[handoff.reason] ?? { label: handoff.reason, severity: 'idle' as const };
  const cust = handoff.conversations;
  const severityClass = `pill pill-${meta.severity === 'signal' ? 'signal' : meta.severity === 'warn' ? 'warn' : 'idle'}`;

  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-5 items-start py-5 px-4 row-hover"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      {/* Left: severity indicator */}
      <div className="pt-1 w-32">
        <span className={severityClass}>
          <span className="pill-dot" />
          <span>{meta.label}</span>
        </span>
        <div
          className="mt-2 text-[10px] tabular"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          {formatDistanceToNow(handoff.created_at)}
        </div>
      </div>

      {/* Middle: customer + trigger */}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
          {cust?.customer_name || cust?.customer_phone || 'عميل غير معروف'}
        </div>
        {cust?.customer_phone && cust.customer_name && (
          <div
            className="text-[11px] mt-0.5 tabular"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
            dir="ltr"
          >
            {cust.customer_phone}
          </div>
        )}
        {handoff.trigger_message && (
          <p
            className="text-sm mt-2 leading-relaxed line-clamp-2 pr-3"
            style={{
              color: 'var(--ink-soft)',
              borderInlineStart: '2px solid var(--rule-strong)',
              paddingInlineStart: '0.875rem',
              fontStyle: 'italic',
            }}
          >
            "{handoff.trigger_message}"
          </p>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 shrink-0 pt-1">
        <Link
          href={`/conversations/${handoff.conversation_id}`}
          className="btn-ghost h-9 text-xs gap-1.5 px-3"
        >
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>فتح</span>
          <ArrowLeft className="w-3 h-3" />
        </Link>
        {showResolve && <AlertResolveButton handoffId={handoff.id} />}
      </div>
    </div>
  );
}
