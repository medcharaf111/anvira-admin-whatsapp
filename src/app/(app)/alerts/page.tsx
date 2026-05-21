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

interface ConsentRevoked {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  consent_revoked_at: string | null;
}

export default async function AlertsPage() {
  const client = await requireCurrentClient();
  const isRE = client.client_type === 'real_estate';
  const supabase = await createClient();

  const { data: unresolvedRaw } = await supabase
    .from('handoffs')
    .select('id, conversation_id, reason, trigger_message, resolved, created_at, conversations(customer_phone, customer_name)')
    .eq('client_id', client.id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);

  // Severity-first ordering: complaints + explicit handoff requests go to
  // the top, then warn-level (unknown_answer, complex), then idle. Within
  // the same severity we preserve the chronological order returned by the
  // query (most recent first). Matches the brief's "sort by severity
  // first, then recency".
  const SEVERITY_WEIGHT: Record<string, number> = {
    complaint: 3,
    explicit_request: 3,
    unknown_answer: 2,
    complex: 2,
    after_hours: 1,
  };
  const unresolved = [...(unresolvedRaw ?? [])].sort((a, b) => {
    const wa = SEVERITY_WEIGHT[a.reason] ?? 0;
    const wb = SEVERITY_WEIGHT[b.reason] ?? 0;
    if (wa !== wb) return wb - wa; // higher severity first
    return 0;
  });

  const { data: resolved } = await supabase
    .from('handoffs')
    .select('id, conversation_id, reason, trigger_message, resolved, created_at, conversations(customer_phone, customer_name)')
    .eq('client_id', client.id)
    .eq('resolved', true)
    .order('created_at', { ascending: false })
    .limit(20);

  // Real-estate clients only: surface customers who revoked WhatsApp
  // consent (STOP keyword / explicit opt-out). This is a low-severity
  // visibility item — no action required from the operator, but a
  // compliance audit might ask for it.
  let revoked: ConsentRevoked[] = [];
  if (isRE) {
    const { data: rev } = await supabase
      .from('conversations')
      .select('id, customer_phone, customer_name, consent_revoked_at')
      .eq('client_id', client.id)
      .eq('consent_status', 'revoked')
      .order('consent_revoked_at', { ascending: false })
      .limit(20);
    revoked = (rev ?? []) as ConsentRevoked[];
  }

  const unresolvedCount = unresolved.length;

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
            {(unresolved as unknown as Handoff[]).map((h, idx) => {
              const meta = REASON_META[h.reason] ?? { label: h.reason, severity: 'idle' as const };
              const prev = idx > 0 ? (unresolved as unknown as Handoff[])[idx - 1] : null;
              const prevMeta = prev ? (REASON_META[prev.reason] ?? { severity: 'idle' as const }) : null;
              // Visual divider between severity tiers
              const showDivider = prevMeta && prevMeta.severity !== meta.severity;
              return (
                <div key={h.id}>
                  {showDivider && (
                    <div
                      className="my-1 mx-4 h-px"
                      style={{ background: 'var(--rule-soft)' }}
                      aria-hidden
                    />
                  )}
                  <AlertRow handoff={h} showResolve />
                </div>
              );
            })}
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

      {/* Consent revocations — real-estate only, low-severity visibility */}
      {isRE && revoked.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="eyebrow">CONSENT REVOKED · حالات سحب الموافقة</span>
            <span className="h-px flex-1 max-w-[200px]" style={{ background: 'var(--rule)' }} />
          </div>
          <div style={{ opacity: 0.85 }}>
            {revoked.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[auto_1fr_auto] gap-4 items-center py-3 px-4 row-hover"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <span className="pill pill-idle">
                  <span className="pill-dot" />
                  <span>إيقاف / STOP</span>
                </span>
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {r.customer_name || 'عميل غير معروف'}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 tabular"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                    dir="ltr"
                  >
                    {redactConsentPhone(r.customer_phone)}
                  </div>
                </div>
                <div
                  className="text-[10px] tabular text-left"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                >
                  {r.consent_revoked_at
                    ? new Date(r.consent_revoked_at).toLocaleString('ar-AE')
                    : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mask middle digits — matches the redactPhone style used elsewhere so
// the operator's screen doesn't leak full PII over their shoulder.
function redactConsentPhone(p: string): string {
  const trimmed = p.replace(/\s+/g, '');
  if (trimmed.length < 6) return '••••';
  return `${trimmed.slice(0, 4)}${'·'.repeat(Math.max(2, trimmed.length - 6))}${trimmed.slice(-2)}`;
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
