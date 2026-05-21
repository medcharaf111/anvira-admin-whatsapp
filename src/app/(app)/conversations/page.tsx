import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentClient } from '@/lib/client';
import { formatDistanceToNow } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { DensityToggle } from '@/components/density-toggle';
import { EmptyState } from '@/components/empty-state';
import { MessageSquare, Mic } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const client = await requireCurrentClient();
  const supabase = await createClient();

  const isRE = client.client_type === 'real_estate';

  // For real-estate tenants we also fetch lead_stage + lead_score + the
  // qualification snapshot's budget + lead_source so the list row can
  // surface every important signal without a second round-trip.
  const selectCols = isRE
    ? 'id, customer_phone, customer_name, last_message_at, bot_paused, language, lead_stage, lead_score, lead_source, leads_qualification(budget_min, budget_max, budget_currency)'
    : 'id, customer_phone, customer_name, last_message_at, bot_paused, language';

  let query = supabase
    .from('conversations')
    .select(selectCols)
    .eq('client_id', client.id)
    .order('last_message_at', { ascending: false })
    .limit(50);

  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(
      `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`
    );
  }

  const { data: convosRaw } = await query;
  type RawConv = {
    id: string;
    customer_phone: string;
    customer_name: string | null;
    last_message_at: string;
    bot_paused: boolean;
    language: string | null;
    lead_stage?: string | null;
    lead_score?: number | null;
    lead_source?: string | null;
    leads_qualification?:
      | { budget_min: number | null; budget_max: number | null; budget_currency: string | null }
      | { budget_min: number | null; budget_max: number | null; budget_currency: string | null }[]
      | null;
  };
  const convos = convosRaw as RawConv[] | null;

  // For each RE conversation, check whether the most-recent inbound
  // message metadata flags it as a voice transcription. Single batch
  // query keyed by conversation_id to keep the page snappy.
  let voiceMap: Record<string, boolean> = {};
  if (isRE && convos && convos.length > 0) {
    const ids = convos.map((c) => c.id);
    // Pull the metadata for the latest inbound message per conversation.
    // Postgres-style DISTINCT-ON would be ideal; with Supabase JS we just
    // fetch the recent inbound rows for these convos and dedupe locally.
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, metadata, created_at, direction')
      .in('conversation_id', ids)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(500);
    const seen = new Set<string>();
    for (const m of (msgs ?? []) as Array<{
      conversation_id: string;
      metadata: Record<string, unknown> | null;
    }>) {
      if (seen.has(m.conversation_id)) continue;
      seen.add(m.conversation_id);
      const md = m.metadata as Record<string, unknown> | null;
      if (md && (md.voice === true || md.reason === 'voice_transcribed')) {
        voiceMap[m.conversation_id] = true;
      }
    }
  }

  function compactBudget(min: number | null, max: number | null, currency: string | null): string | null {
    if (min === null && max === null) return null;
    const fmt = (n: number) => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
      if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
      return String(n);
    };
    const c = currency ?? 'AED';
    const lo = min !== null ? fmt(min) : '?';
    const hi = max !== null ? fmt(max) : '?';
    return `${c} ${lo}–${hi}`;
  }

  function prettySource(src: string | null | undefined): string | null {
    if (!src) return null;
    if (src.startsWith('portal_')) {
      return src.slice('portal_'.length).replace(/_/g, ' ').toUpperCase();
    }
    return src.replace(/_/g, ' ').toUpperCase();
  }

  // Stage labels (Arabic) — must mirror leads-view.tsx
  const STAGE_LABEL: Record<string, { label: string; variant: 'idle' | 'warn' | 'signal' | 'success' }> = {
    cold: { label: 'بارد', variant: 'idle' },
    warm: { label: 'دافئ', variant: 'warn' },
    hot: { label: 'ساخن', variant: 'signal' },
    viewing_booked: { label: 'معاينة', variant: 'signal' },
    deposited: { label: 'دفع مقدّم', variant: 'success' },
    closed: { label: 'مغلق', variant: 'success' },
    lost: { label: 'مفقود', variant: 'idle' },
  };

  const total = convos?.length ?? 0;
  const paused = convos?.filter((c) => c.bot_paused).length ?? 0;

  return (
    <div>
      <RealtimeRefresh
        subs={[
          // New conversation rows OR last_message_at / bot_paused changes
          { table: 'conversations', filter: `client_id=eq.${client.id}` },
          // New messages — covers the "I just got a reply" case where the
          // conversations row UPDATE event sometimes arrives slightly later
          { table: 'messages', filter: `client_id=eq.${client.id}`, events: ['INSERT'] },
        ]}
      />
      <PageHeader
        eyebrow="01 / المحادثات"
        title="محادثات العملاء"
        subtitle={
          q
            ? `نتائج البحث عن "${q}" — ${total} محادثة`
            : `${total} محادثة مُسجّلة · ${paused} تحت سيطرتك اليدوية`
        }
      />

      {/* Stats strip — hide when searching */}
      {!q && (
        <div
          className="grid grid-cols-3 gap-px mb-8"
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
      )}

      {/* Sticky search bar — operators scroll through 100+ conversations,
          keeping the search visible saves a scroll-to-top per query. */}
      <div
        className="sticky z-30 mb-6 -mx-5 sm:-mx-8 md:-mx-12 px-5 sm:px-8 md:px-12 py-3"
        style={{
          top: '3.5rem', // sits under the 56px top bar (h-14)
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--rule-soft)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <SearchInput placeholder="ابحث باسم العميل أو رقمه..." />
          </div>
          <DensityToggle />
        </div>
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
        {(convos ?? []).map((c) => {
          const qRaw = c.leads_qualification;
          const q = Array.isArray(qRaw) ? qRaw[0] : qRaw;
          const budget = isRE && q
            ? compactBudget(q.budget_min, q.budget_max, q.budget_currency)
            : null;
          const sourceLabel = isRE ? prettySource(c.lead_source) : null;
          const isVoice = !!voiceMap[c.id];
          return (
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
                {isRE && (sourceLabel || budget || isVoice) && (
                  <div
                    className="text-[10px] mt-1 flex items-center gap-2 truncate"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {sourceLabel && (
                      <span
                        className="px-1.5 py-0.5 shrink-0"
                        style={{
                          background: 'var(--paper-sink)',
                          border: '1px solid var(--rule)',
                          borderRadius: '2px',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        {sourceLabel}
                      </span>
                    )}
                    {budget && (
                      <span className="tabular truncate" dir="ltr">
                        {budget}
                      </span>
                    )}
                    {isVoice && (
                      <span
                        className="flex items-center gap-0.5 shrink-0"
                        style={{ color: 'var(--primary-glow)' }}
                        title="آخر رسالة واردة كانت بصمة صوتية"
                      >
                        <Mic className="w-2.5 h-2.5" strokeWidth={1.75} />
                        <span>VOICE</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isRE && c.lead_stage && STAGE_LABEL[c.lead_stage] && (
                <span className={`pill pill-${STAGE_LABEL[c.lead_stage].variant}`}>
                  <span className="pill-dot" />
                  <span>{STAGE_LABEL[c.lead_stage].label}</span>
                </span>
              )}
              {isRE && typeof c.lead_score === 'number' && c.lead_score > 0 && (
                <span
                  className="text-[10px] tabular px-1.5 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--paper-sink)',
                    border: '1px solid var(--rule)',
                    borderRadius: '2px',
                    color:
                      c.lead_score >= 70
                        ? 'var(--signal)'
                        : c.lead_score >= 40
                        ? 'var(--warn)'
                        : 'var(--ink-soft)',
                  }}
                  title="Lead score"
                >
                  {c.lead_score}
                </span>
              )}
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
          );
        })}
      </div>

      {(!convos || convos.length === 0) && (
        <div className="mt-4">
          {q ? (
            <EmptyState
              icon={MessageSquare}
              title={`لا نتائج لـ "${q}"`}
              description="جرّب البحث برقم الهاتف بدل الاسم، أو تأكّد من التهجئة."
            />
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="لا توجد محادثات بعد"
              description="أرسل رسالة من هاتف التجربة لرؤية المحادثة الأولى تظهر هنا."
              primaryAction={{ label: 'فتح هاتف التجربة', href: '/mock-phone' }}
              secondaryAction={{ label: 'إعدادات WhatsApp', href: '/settings' }}
            />
          )}
        </div>
      )}
    </div>
  );
}
