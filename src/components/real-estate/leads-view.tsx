'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LayoutList, Columns3, ArrowLeft, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/format';
import { LeadDrawer } from '@/components/real-estate/lead-drawer';

// Filter-chip definitions. Order matches the visual row; "all" is
// special-cased ("no source filter at all") and "other" matches any
// non-portal source (whatsapp_ad, instagram, manual, referral, etc.)
const SOURCE_CHIPS: { key: string; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'portal_bayut', label: 'Bayut' },
  { key: 'portal_property_finder', label: 'Property Finder' },
  { key: 'portal_dubizzle', label: 'Dubizzle' },
  { key: 'portal_aqar', label: 'Aqar' },
  { key: 'portal_wasalt', label: 'Wasalt' },
  { key: 'portal_sakan', label: 'Sakan' },
  { key: 'other', label: 'أخرى' },
];

function matchesSource(rowSource: string | null, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'other') {
    return !rowSource || !rowSource.startsWith('portal_');
  }
  return rowSource === filter;
}

export type LeadStage =
  | 'cold'
  | 'warm'
  | 'hot'
  | 'viewing_booked'
  | 'deposited'
  | 'closed'
  | 'lost';

export interface LeadRow {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  language: string | null;
  lead_score: number | null;
  lead_stage: LeadStage;
  assigned_agent_id: string | null;
  lead_source: string | null;
  consent_status: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  bedrooms_wanted: number | null;
  property_types_wanted: string[] | null;
  preferred_locations: string[] | null;
  timeline: string | null;
  intent: string | null;
  notes: string | null;
}

const STAGES: { key: LeadStage; label: string; variant: 'idle' | 'warn' | 'signal' | 'success' }[] = [
  { key: 'cold', label: 'بارد', variant: 'idle' },
  { key: 'warm', label: 'دافئ', variant: 'warn' },
  { key: 'hot', label: 'ساخن', variant: 'signal' },
  { key: 'viewing_booked', label: 'معاينة محجوزة', variant: 'signal' },
  { key: 'deposited', label: 'دفع مقدّم', variant: 'success' },
  { key: 'closed', label: 'مغلق', variant: 'success' },
  { key: 'lost', label: 'مفقود', variant: 'idle' },
];

const STAGE_LABEL: Record<LeadStage, string> = STAGES.reduce(
  (acc, s) => ({ ...acc, [s.key]: s.label }),
  {} as Record<LeadStage, string>
);

function redactPhone(p: string): string {
  // Keep country prefix + last 2 digits; mask the middle.
  // +971501234567 → +971·····67
  const trimmed = p.replace(/\s+/g, '');
  if (trimmed.length < 6) return '••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-2);
  return `${prefix}${'·'.repeat(Math.max(2, trimmed.length - 6))}${suffix}`;
}

export function LeadsView({
  leads,
  initialSource = 'all',
  kycEnabled = false,
  calendarMode = 'gregorian',
}: {
  leads: LeadRow[];
  initialSource?: string;
  kycEnabled?: boolean;
  calendarMode?: import('@/lib/client').CalendarMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [revealPhones, setRevealPhones] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<LeadStage | ''>('');
  const [bulkAgent, setBulkAgent] = useState('');
  const [source, setSource] = useState<string>(initialSource);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keep URL in sync when the chip changes. Using replace (not push)
  // because the chip filter isn't a "navigation" — back-button shouldn't
  // cycle through filters.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (source === 'all') {
      sp.delete('source');
    } else {
      sp.set('source', source);
    }
    const next = sp.toString();
    const target = next ? `${pathname}?${next}` : pathname;
    router.replace(target, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Per-source counts for the chip badges.
  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length, other: 0 };
    for (const l of leads) {
      const s = l.lead_source;
      if (!s || !s.startsWith('portal_')) m.other = (m.other ?? 0) + 1;
      if (s) m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [leads]);

  // Apply the source filter once, downstream views consume the result.
  const filtered = useMemo(
    () => leads.filter((l) => matchesSource(l.lead_source, source)),
    [leads, source]
  );

  function openDrawer(lead: LeadRow) {
    setDrawerLead(lead);
    setDrawerOpen(true);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (selected.size === 0) return;
    const payload: Record<string, unknown> = {};
    if (bulkStage) payload.lead_stage = bulkStage;
    if (bulkAgent.trim()) payload.assigned_agent_id = bulkAgent.trim();
    if (Object.keys(payload).length === 0) {
      toast.error('اختر مرحلة أو مندوب');
      return;
    }
    let ok = 0;
    await Promise.all(
      Array.from(selected).map(async (id) => {
        const res = await fetch(`/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) ok++;
      })
    );
    toast.success(`تم تحديث ${ok} عميل`);
    setSelected(new Set());
    setBulkStage('');
    setBulkAgent('');
    location.reload();
  }

  return (
    <>
      {/* Source filter chips — RTL row of selectable chips. Persisted to
          URL so the operator can share a "Bayut-only" view. */}
      <div
        className="mb-5 flex items-center gap-1.5 flex-wrap overflow-x-auto"
        role="tablist"
        aria-label="Filter by lead source"
      >
        <span
          className="text-[10px] tracking-widest uppercase me-1"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
          }}
        >
          SOURCE
        </span>
        {SOURCE_CHIPS.map((c) => {
          const active = source === c.key;
          const count = sourceCounts[c.key] ?? 0;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSource(c.key)}
              className="h-7 px-2.5 text-[11px] flex items-center gap-1.5 shrink-0"
              style={{
                fontFamily: 'var(--font-mono)',
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--paper)' : 'var(--ink-soft)',
                border: `1px solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
                borderRadius: '2px',
                letterSpacing: '0.04em',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{c.label}</span>
              {count > 0 && (
                <span
                  className="tabular text-[10px] px-1"
                  style={{
                    background: active
                      ? 'color-mix(in srgb, var(--paper) 18%, transparent)'
                      : 'var(--paper-sink)',
                    color: active ? 'var(--paper)' : 'var(--ink-faint)',
                    borderRadius: '2px',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1" style={{ border: '1px solid var(--rule)', borderRadius: '3px' }}>
          <button
            type="button"
            onClick={() => setView('list')}
            className="h-9 px-3 text-xs flex items-center gap-1.5"
            style={{
              background: view === 'list' ? 'var(--ink)' : 'transparent',
              color: view === 'list' ? 'var(--paper)' : 'var(--ink-soft)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>List</span>
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className="h-9 px-3 text-xs flex items-center gap-1.5"
            style={{
              background: view === 'kanban' ? 'var(--ink)' : 'transparent',
              color: view === 'kanban' ? 'var(--paper)' : 'var(--ink-soft)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setRevealPhones((v) => !v)}
          className="btn-ghost h-9 px-3 text-xs gap-1.5"
        >
          {revealPhones ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{revealPhones ? 'إخفاء الأرقام' : 'إظهار الأرقام'}</span>
        </button>

        {selected.size > 0 && (
          <div
            className="ml-auto flex items-center gap-2 flex-wrap p-2"
            style={{
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {selected.size} مُحدّد
            </span>
            <select
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value as LeadStage | '')}
              className="input-boxed h-9 text-xs"
            >
              <option value="">تغيير المرحلة…</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              value={bulkAgent}
              onChange={(e) => setBulkAgent(e.target.value)}
              placeholder="مندوب (نص)"
              className="input-boxed h-9 text-xs"
              style={{ minWidth: '8rem' }}
            />
            <button onClick={applyBulk} className="btn-primary h-9 px-3 text-xs">
              تطبيق
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="btn-ghost h-9 px-3 text-xs"
            >
              إلغاء
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center panel" style={{ borderStyle: 'dashed' }}>
          <UserPlus
            className="w-10 h-10 mx-auto mb-4"
            style={{ color: 'var(--ink-ghost)' }}
            strokeWidth={1}
          />
          <p style={{ color: 'var(--ink-soft)' }} className="text-sm">
            {leads.length === 0
              ? 'لا توجد عملاء محتملين بعد. حالما يبدأ البوت بتأهيل المحادثات، تظهر هنا.'
              : 'لا عملاء يطابقون هذا الفلتر.'}
          </p>
        </div>
      ) : view === 'list' ? (
        <ListView
          leads={filtered}
          revealPhones={revealPhones}
          selected={selected}
          toggleSelected={toggleSelected}
          onOpenDrawer={openDrawer}
        />
      ) : (
        <KanbanView
          leads={filtered}
          revealPhones={revealPhones}
          onOpenDrawer={openDrawer}
        />
      )}

      <LeadDrawer
        lead={drawerLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kycEnabled={kycEnabled}
        calendarMode={calendarMode}
      />
    </>
  );
}

function ListView({
  leads,
  revealPhones,
  selected,
  toggleSelected,
  onOpenDrawer,
}: {
  leads: LeadRow[];
  revealPhones: boolean;
  selected: Set<string>;
  toggleSelected: (id: string) => void;
  onOpenDrawer: (lead: LeadRow) => void;
}) {
  const router = useRouter();

  async function updateStage(id: string, stage: LeadStage) {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_stage: stage }),
    });
    if (!res.ok) {
      toast.error('لم نتمكن من التحديث');
      return;
    }
    toast.success(`المرحلة: ${STAGE_LABEL[stage]}`);
    router.refresh();
  }

  return (
    <div>
      <div
        className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] gap-3 py-3 px-3 text-[10px]"
        style={{
          borderBottom: '1px solid var(--rule)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-faint)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span></span>
        <span>العميل</span>
        <span>الميزانية</span>
        <span>غرف</span>
        <span>الموعد</span>
        <span>المرحلة</span>
        <span>Score</span>
        <span></span>
      </div>
      {leads.map((l) => (
        <div
          key={l.id}
          className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto] gap-3 items-center py-4 px-3 row-hover cursor-pointer"
          style={{ borderBottom: '1px solid var(--rule)' }}
          onClick={(e) => {
            // Don't hijack clicks on the checkbox / select / link.
            const t = e.target as HTMLElement;
            if (t.closest('input, select, a, button')) return;
            onOpenDrawer(l);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDrawer(l);
            }
          }}
        >
          <input
            type="checkbox"
            checked={selected.has(l.id)}
            onChange={() => toggleSelected(l.id)}
            className="w-4 h-4"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
              {l.customer_name || 'بدون اسم'}
            </div>
            <div
              className="text-[11px] mt-0.5 tabular truncate"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              dir="ltr"
            >
              {revealPhones ? l.customer_phone : redactPhone(l.customer_phone)}
              {l.lead_source ? ` · ${l.lead_source}` : ''}
            </div>
          </div>

          <div
            className="text-[11px] tabular text-right min-w-[8rem]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
          >
            {l.budget_min || l.budget_max
              ? `${l.budget_currency ?? ''} ${l.budget_min?.toLocaleString() ?? '?'}–${l.budget_max?.toLocaleString() ?? '?'}`
              : '—'}
          </div>

          <div className="text-xs tabular text-center min-w-[3rem]" style={{ color: 'var(--ink-soft)' }}>
            {l.bedrooms_wanted ?? '—'}
          </div>

          <div className="text-xs text-center min-w-[5rem]" style={{ color: 'var(--ink-soft)' }}>
            {l.timeline ?? '—'}
          </div>

          <select
            value={l.lead_stage}
            onChange={(e) => updateStage(l.id, e.target.value as LeadStage)}
            className="input-boxed h-8 text-xs"
            style={{ minWidth: '7rem' }}
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          <div
            className="text-sm tabular text-center min-w-[3rem]"
            style={{
              fontFamily: 'var(--font-mono)',
              color:
                (l.lead_score ?? 0) >= 70
                  ? 'var(--signal)'
                  : (l.lead_score ?? 0) >= 40
                  ? 'var(--warn)'
                  : 'var(--ink-soft)',
            }}
          >
            {l.lead_score ?? '—'}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Link
              href={`/conversations/${l.id}`}
              className="btn-ghost h-8 px-2 text-xs gap-1"
            >
              <span>محادثة</span>
              <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanView({
  leads,
  revealPhones,
  onOpenDrawer,
}: {
  leads: LeadRow[];
  revealPhones: boolean;
  onOpenDrawer: (lead: LeadRow) => void;
}) {
  const router = useRouter();
  const byStage = useMemo(() => {
    const map: Record<LeadStage, LeadRow[]> = {
      cold: [],
      warm: [],
      hot: [],
      viewing_booked: [],
      deposited: [],
      closed: [],
      lost: [],
    };
    for (const l of leads) {
      const k: LeadStage = (l.lead_stage ?? 'cold') as LeadStage;
      if (map[k]) map[k].push(l);
    }
    return map;
  }, [leads]);

  async function handleDrop(id: string, stage: LeadStage) {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_stage: stage }),
    });
    if (!res.ok) {
      toast.error('لم نتمكن من التحديث');
      return;
    }
    toast.success(`نُقل إلى ${STAGE_LABEL[stage]}`);
    router.refresh();
  }

  // Lightweight native drag-and-drop. We avoid @dnd-kit to keep the
  // dependency tree lean; this is sufficient for moving lead cards
  // between stage columns.
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {STAGES.map((s) => {
        const items = byStage[s.key];
        return (
          <div
            key={s.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('text/lead-id');
              if (id) handleDrop(id, s.key);
            }}
            className="panel p-3 min-h-[16rem]"
            style={{ background: 'var(--paper-lift)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`pill pill-${s.variant}`}>
                <span className="pill-dot" />
                <span>{s.label}</span>
              </span>
              <span
                className="text-[10px] tabular"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
              >
                {items.length}
              </span>
            </div>

            <div className="space-y-2">
              {items.map((l) => (
                <motion.div
                  key={l.id}
                  layout
                  draggable
                  onDragStart={(e) => {
                    (e as unknown as DragEvent).dataTransfer?.setData('text/lead-id', l.id);
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button')) return;
                    onOpenDrawer(l);
                  }}
                  role="button"
                  tabIndex={0}
                  className="p-2.5 cursor-grab active:cursor-grabbing"
                  style={{
                    background: 'var(--paper)',
                    border: '1px solid var(--rule)',
                    borderRadius: '3px',
                  }}
                >
                  <div
                    className="text-xs font-medium truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {l.customer_name || 'بدون اسم'}
                  </div>
                  <div
                    className="text-[10px] mt-0.5 tabular truncate"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
                    dir="ltr"
                  >
                    {revealPhones ? l.customer_phone : redactPhone(l.customer_phone)}
                  </div>
                  <div
                    className="text-[10px] mt-1 tabular flex items-center justify-between"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
                  >
                    <span>
                      {l.budget_min || l.budget_max
                        ? `${l.budget_currency ?? ''} ${(l.budget_min ?? 0).toLocaleString()}–${(l.budget_max ?? 0).toLocaleString()}`
                        : '—'}
                    </span>
                    <span
                      style={{
                        color:
                          (l.lead_score ?? 0) >= 70
                            ? 'var(--signal)'
                            : (l.lead_score ?? 0) >= 40
                            ? 'var(--warn)'
                            : 'var(--ink-soft)',
                      }}
                    >
                      {l.lead_score ?? '—'}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    {formatDistanceToNow(l.last_message_at)}
                  </div>
                </motion.div>
              ))}
              {items.length === 0 && (
                <div
                  className="text-center py-6 text-[10px]"
                  style={{
                    color: 'var(--ink-faint)',
                    fontFamily: 'var(--font-mono)',
                    border: '1px dashed var(--rule)',
                    borderRadius: '3px',
                  }}
                >
                  EMPTY
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
