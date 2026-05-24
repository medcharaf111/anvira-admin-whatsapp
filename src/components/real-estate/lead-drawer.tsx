'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  Eye,
  EyeOff,
  Flame,
  UserPlus,
  FileText,
  ArrowRight,
  Mic,
  Edit3,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react';
import type { LeadRow, LeadStage } from '@/components/real-estate/leads-view';
import type { CalendarMode } from '@/lib/client';
import { formatViewingDate } from '@/lib/dates';

const STAGE_LABEL: Record<LeadStage, { label: string; variant: string }> = {
  cold: { label: 'بارد', variant: 'pill-idle' },
  warm: { label: 'دافئ', variant: 'pill-warn' },
  hot: { label: 'ساخن', variant: 'pill-signal' },
  viewing_booked: { label: 'معاينة محجوزة', variant: 'pill-signal' },
  deposited: { label: 'دفع مقدّم', variant: 'pill-success' },
  closed: { label: 'مغلق', variant: 'pill-success' },
  lost: { label: 'مفقود', variant: 'pill-idle' },
};

interface TailMessage {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
  sender: string | null;
  created_at: string;
  language: string | null;
  metadata: Record<string, unknown> | null;
}

interface QualifyFull {
  budget_min: number | null;
  budget_max: number | null;
  budget_currency: string | null;
  bedrooms_wanted: number | null;
  property_types_wanted: string[] | null;
  preferred_locations: string[] | null;
  citizenship: string | null;
  residency_status: string | null;
  mortgage_status: string | null;
  timeline: string | null;
  intent: string | null;
  language_preference: string | null;
  notes: string | null;
  raw_extracted: Record<string, unknown> | null;
}

interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

function redactPhone(p: string): string {
  const trimmed = p.replace(/\s+/g, '');
  if (trimmed.length < 6) return '••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-2);
  return `${prefix}${'·'.repeat(Math.max(2, trimmed.length - 6))}${suffix}`;
}

/**
 * Coerce whatever Supabase / API hands us into a `string[]`. Real Postgres
 * `text[]` columns arrive as JS arrays. Older rows or pre-migration data
 * occasionally arrive as JSON-encoded strings (`'["foo","bar"]'`) or a
 * single comma-separated string. Anything else maps to [].
 */
function normaliseStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === 'string');
        }
      } catch {
        /* fall through */
      }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function formatBudget(
  min: number | null,
  max: number | null,
  currency: string | null
): string {
  if (min === null && max === null) return '—';
  const fmt = new Intl.NumberFormat('ar-AE', { maximumFractionDigits: 0 });
  const c = currency ?? 'AED';
  const lo = min !== null ? fmt.format(min) : '?';
  const hi = max !== null ? fmt.format(max) : '?';
  return `${c} ${lo} – ${hi}`;
}

export function LeadDrawer({
  lead,
  open,
  onClose,
  onRevealedTogglerChange,
  kycEnabled = false,
  calendarMode = 'gregorian',
}: {
  lead: LeadRow | null;
  open: boolean;
  onClose: () => void;
  onRevealedTogglerChange?: (revealed: boolean) => void;
  /** Show the "Start KYC case" quick-action. RE + kyc_enabled gates upstream. */
  kycEnabled?: boolean;
  /** Renders `last_message_at` per the brokerage's calendar preference. */
  calendarMode?: CalendarMode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [tail, setTail] = useState<TailMessage[] | null>(null);
  const [tailLoading, setTailLoading] = useState(false);
  const [qualify, setQualify] = useState<QualifyFull | null>(null);
  const [qualifyLoading, setQualifyLoading] = useState(false);
  const [editingField, setEditingField] = useState<keyof QualifyFull | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [savingField, setSavingField] = useState<keyof QualifyFull | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignName, setAssignName] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Ensure portals work after hydration only — SSR has no `document`.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset internal state every time a new lead is opened.
  useEffect(() => {
    if (!lead) return;
    setEditingField(null);
    setRawOpen(false);
    setBrochureOpen(false);
    setAssignOpen(false);
    setAssignName(lead.assigned_agent_id ?? '');
    setRevealed(false);
    onRevealedTogglerChange?.(false);
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Fetch the conversation tail (last 10 messages) + full qualification.
  // Called on initial open AND whenever realtime says the underlying
  // leads_qualification / messages rows changed (so a bot-driven budget
  // update propagates without the operator closing and reopening the
  // drawer).
  const refetchDetail = useCallback(
    (signal?: AbortSignal) => {
      if (!lead) return;
      setTailLoading(true);
      setQualifyLoading(true);
      fetch(`/api/leads/${lead.id}/detail`, { signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) return;
          setTail(j.messages ?? []);
          setQualify(j.qualification ?? null);
        })
        .catch(() => {
          /* aborted or network — keep whatever was rendered */
        })
        .finally(() => {
          setTailLoading(false);
          setQualifyLoading(false);
        });
    },
    [lead?.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!lead || !open) return;
    const ctrl = new AbortController();
    refetchDetail(ctrl.signal);
    return () => ctrl.abort();
  }, [lead?.id, open, refetchDetail]);

  // Realtime: when the bot extracts a new budget / bedrooms / etc.,
  // leads_qualification.UPDATE fires. Same for new messages on the
  // conversation. Coalesce bursts with a 300ms debounce so we don't
  // hammer the detail endpoint when the bot sends a reply + records
  // qualification in the same orchestrator tick.
  useEffect(() => {
    if (!lead || !open) return;
    const supabase = createClient();
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const refetchSoon = () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => refetchDetail(), 300);
    };
    const ch = supabase
      .channel(`lead-drawer:${lead.id}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'leads_qualification',
          filter: `conversation_id=eq.${lead.id}`,
        },
        refetchSoon
      )
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${lead.id}`,
        },
        refetchSoon
      )
      .subscribe();
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      supabase.removeChannel(ch);
    };
  }, [lead?.id, open, refetchDetail]);

  const score = lead?.lead_score ?? 0;

  async function patchQualify(field: keyof QualifyFull, value: unknown) {
    if (!lead) return;
    setSavingField(field);
    try {
      const res = await fetch(`/api/leads/${lead.id}/qualify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('fail');
      setQualify((q) => (q ? { ...q, [field]: value as never } : q));
      toast.success('تم الحفظ');
      setEditingField(null);
    } catch {
      toast.error('لم نتمكن من الحفظ');
    } finally {
      setSavingField(null);
    }
  }

  async function markHot() {
    if (!lead) return;
    setBusyAction('hot');
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_stage: 'hot', lead_score: 80 }),
      });
      if (!res.ok) throw new Error('fail');
      toast.success('تم تعليم العميل كساخن');
      router.refresh();
    } catch {
      toast.error('لم نتمكن من التحديث');
    } finally {
      setBusyAction(null);
    }
  }

  async function startKyc() {
    if (!lead) return;
    setBusyAction('kyc');
    try {
      const res = await fetch('/api/kyc/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: lead.id,
          customer_name: lead.customer_name,
          customer_phone: lead.customer_phone,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !j.id) {
        toast.error(
          j.error === 'kyc_backend_not_provisioned'
            ? 'خدمة KYC ليست جاهزة بعد'
            : 'تعذّر بدء الحالة'
        );
        return;
      }
      toast.success('تم بدء حالة KYC');
      router.push(`/kyc?case=${j.id}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function assignAgent() {
    if (!lead) return;
    if (!assignName.trim()) {
      toast.error('أدخل اسم المندوب');
      return;
    }
    setBusyAction('assign');
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_agent_id: assignName.trim() }),
      });
      if (!res.ok) throw new Error('fail');
      toast.success(`تم التعيين إلى ${assignName.trim()}`);
      setAssignOpen(false);
      router.refresh();
    } catch {
      toast.error('لم نتمكن من التعيين');
    } finally {
      setBusyAction(null);
    }
  }

  if (!mounted || !lead) return null;

  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80]"
            style={{
              background:
                'color-mix(in srgb, var(--ink) 45%, transparent)',
            }}
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="تفاصيل العميل"
            initial={{ x: '110%' }}
            animate={{ x: 0 }}
            exit={{ x: '110%' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            // Slide from the inline-end (start in RTL, right in LTR). We
            // keep `right: 0` because the app's overall direction is RTL
            // but the drawer should always live at the visual end.
            className="fixed top-0 bottom-0 left-0 z-[81] w-full sm:w-[34rem] flex flex-col"
            style={{
              background: 'var(--paper)',
              borderRight: '1px solid var(--rule)',
              boxShadow: '0 24px 60px -20px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div
              className="px-6 pt-6 pb-4 shrink-0"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <span
                  className="text-[10px] tracking-widest uppercase"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  · Lead · {lead.id.slice(0, 8)}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-ghost h-8 w-8 p-0"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <h2
                className="display-ar text-2xl"
                style={{ color: 'var(--ink)' }}
              >
                {lead.customer_name || 'بدون اسم'}
              </h2>

              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const nv = !revealed;
                    setRevealed(nv);
                    onRevealedTogglerChange?.(nv);
                  }}
                  className="flex items-center gap-1.5 text-[11px] tabular"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                  dir="ltr"
                >
                  {revealed ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  <span>
                    {revealed
                      ? lead.customer_phone
                      : redactPhone(lead.customer_phone)}
                  </span>
                </button>
                {lead.assigned_agent_id && (
                  <span
                    className="text-[10px] tracking-widest uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    Agent · {lead.assigned_agent_id}
                  </span>
                )}
                {lead.lead_source && (
                  <span
                    className="text-[10px] tracking-widest uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    {prettySource(lead.lead_source)}
                  </span>
                )}
              </div>

              {/* Last activity — honors the brokerage's calendar_mode
                  setting (Gregorian / Hijri / dual) so a KSA office sees
                  the same date in the format their team uses. */}
              <div
                className="mt-2 text-[11px]"
                style={{
                  color: 'var(--ink-faint)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span
                  className="text-[10px] tracking-widest uppercase me-2"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  LAST ACTIVITY ·
                </span>
                <span style={{ color: 'var(--ink-soft)' }}>
                  {formatViewingDate(lead.last_message_at, {
                    mode: calendarMode,
                    lang: 'ar',
                    withTime: true,
                    withWeekday: false,
                  })}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <span
                  className={`pill ${
                    STAGE_LABEL[lead.lead_stage]?.variant ?? 'pill-idle'
                  }`}
                >
                  <span className="pill-dot" />
                  <span>
                    {STAGE_LABEL[lead.lead_stage]?.label ??
                      lead.lead_stage}
                  </span>
                </span>

                {/* Lead score: number + 100% gold bar */}
                <div className="flex items-center gap-2 min-w-[10rem] flex-1">
                  <span
                    className="tabular text-lg leading-none"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color:
                        score >= 70
                          ? 'var(--primary-glow)'
                          : score >= 40
                          ? 'var(--warn)'
                          : 'var(--ink-soft)',
                    }}
                  >
                    {score}
                  </span>
                  <div
                    className="flex-1 h-1.5"
                    style={{
                      background: 'var(--paper-sink)',
                      borderRadius: '1px',
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, score)}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full"
                      style={{
                        background:
                          score >= 70
                            ? 'linear-gradient(90deg, var(--warn), var(--primary-glow))'
                            : score >= 40
                            ? 'var(--warn)'
                            : 'var(--ink-faint)',
                        borderRadius: '1px',
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] tracking-widest uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                  >
                    SCORE
                  </span>
                </div>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
              {/* Quick actions */}
              <section>
                <div className="section-head !mb-3">
                  <span className="eyebrow">QUICK ACTIONS</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBrochureOpen((v) => !v)}
                    className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>إرسال brochure</span>
                  </button>
                  <button
                    type="button"
                    onClick={markHot}
                    disabled={busyAction === 'hot'}
                    className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                    style={{
                      borderColor:
                        lead.lead_stage === 'hot'
                          ? 'var(--signal)'
                          : 'var(--rule)',
                      color:
                        lead.lead_stage === 'hot'
                          ? 'var(--signal)'
                          : 'var(--ink)',
                    }}
                  >
                    {busyAction === 'hot' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Flame className="w-3.5 h-3.5" />
                    )}
                    <span>تعليم كساخن</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignOpen((v) => !v)}
                    className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>تعيين مندوب</span>
                  </button>
                  <Link
                    href={`/conversations/${lead.id}`}
                    className="btn-primary h-10 text-xs gap-1.5 justify-start px-3"
                  >
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    <span>المحادثة كاملة</span>
                  </Link>
                  {/* KYC quick-action — only when the brokerage has opted
                      into the compliance workflow. Starts a case linked to
                      this conversation and deep-links into /kyc with the
                      new case open in the drawer. */}
                  {kycEnabled && (
                    <button
                      type="button"
                      onClick={startKyc}
                      disabled={busyAction === 'kyc'}
                      className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3 col-span-2"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--primary-glow) 35%, var(--rule))',
                        color: 'var(--primary-glow)',
                      }}
                    >
                      {busyAction === 'kyc' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Shield className="w-3.5 h-3.5" />
                      )}
                      <span>بدء حالة KYC</span>
                    </button>
                  )}
                  {/* RERA form generator deep-link — prefills buyer/seller
                      fields from this lead. UAE brokerages need at least
                      Form A/B for every active deal. */}
                  <Link
                    href={`/forms?lead=${lead.id}`}
                    className="btn-ghost h-10 text-xs gap-1.5 justify-start px-3 col-span-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>توليد نموذج RERA</span>
                  </Link>
                </div>

                {assignOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex items-center gap-2"
                  >
                    <input
                      value={assignName}
                      onChange={(e) => setAssignName(e.target.value)}
                      placeholder="اسم المندوب"
                      className="input-boxed h-9 text-xs flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={assignAgent}
                      disabled={busyAction === 'assign'}
                      className="btn-primary h-9 px-3 text-xs"
                    >
                      {busyAction === 'assign' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'تعيين'
                      )}
                    </button>
                  </motion.div>
                )}

                {brochureOpen && (
                  <BrochurePicker
                    leadId={lead.id}
                    onDone={() => setBrochureOpen(false)}
                  />
                )}
              </section>

              {/* Qualification snapshot */}
              <section>
                <div className="section-head !mb-3">
                  <span className="eyebrow">QUALIFICATION · TLDR</span>
                </div>
                {qualifyLoading ? (
                  <div
                    className="p-6 flex items-center justify-center"
                    style={{
                      background: 'var(--paper-lift)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      style={{ color: 'var(--ink-faint)' }}
                    />
                  </div>
                ) : (
                  <div
                    className="divide-y"
                    style={{
                      borderColor: 'var(--rule)',
                      background: 'var(--paper-lift)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    <QualifyRow
                      label="Budget"
                      labelAr="الميزانية"
                      value={formatBudget(
                        qualify?.budget_min ?? lead.budget_min,
                        qualify?.budget_max ?? lead.budget_max,
                        qualify?.budget_currency ?? lead.budget_currency
                      )}
                      onEdit={() => {
                        setEditingField('budget_min');
                        setEditValue(
                          `${qualify?.budget_min ?? lead.budget_min ?? ''}-${
                            qualify?.budget_max ?? lead.budget_max ?? ''
                          }`
                        );
                      }}
                      editing={editingField === 'budget_min'}
                      editor={
                        <BudgetEditor
                          value={editValue}
                          currency={
                            qualify?.budget_currency ??
                            lead.budget_currency ??
                            'AED'
                          }
                          onChange={setEditValue}
                          saving={savingField === 'budget_min'}
                          onCancel={() => setEditingField(null)}
                          onSave={async () => {
                            const [a, b] = editValue.split('-').map((s) =>
                              s.trim() === '' ? null : Number(s.trim())
                            );
                            await patchQualify('budget_min', a);
                            await patchQualify('budget_max', b);
                          }}
                        />
                      }
                    />
                    <QualifyRow
                      label="Bedrooms"
                      labelAr="غرف"
                      value={
                        qualify?.bedrooms_wanted ??
                        lead.bedrooms_wanted ??
                        '—'
                      }
                      onEdit={() => {
                        setEditingField('bedrooms_wanted');
                        setEditValue(
                          String(
                            qualify?.bedrooms_wanted ??
                              lead.bedrooms_wanted ??
                              ''
                          )
                        );
                      }}
                      editing={editingField === 'bedrooms_wanted'}
                      editor={
                        <SimpleEditor
                          value={editValue}
                          onChange={setEditValue}
                          saving={savingField === 'bedrooms_wanted'}
                          onCancel={() => setEditingField(null)}
                          onSave={() =>
                            patchQualify(
                              'bedrooms_wanted',
                              editValue.trim() === ''
                                ? null
                                : Number(editValue)
                            )
                          }
                          inputProps={{ type: 'number', min: 0, max: 20 }}
                        />
                      }
                    />
                    <ChipRow
                      label="Types"
                      labelAr="أنواع العقار"
                      values={
                        qualify?.property_types_wanted ??
                        lead.property_types_wanted ??
                        []
                      }
                    />
                    <ChipRow
                      label="Locations"
                      labelAr="مناطق مفضّلة"
                      values={
                        qualify?.preferred_locations ??
                        lead.preferred_locations ??
                        []
                      }
                    />
                    <QualifyRow
                      label="Citizenship"
                      labelAr="الجنسية"
                      value={qualify?.citizenship ?? '—'}
                      onEdit={() => {
                        setEditingField('citizenship');
                        setEditValue(qualify?.citizenship ?? '');
                      }}
                      editing={editingField === 'citizenship'}
                      editor={
                        <SimpleEditor
                          value={editValue}
                          onChange={setEditValue}
                          saving={savingField === 'citizenship'}
                          onCancel={() => setEditingField(null)}
                          onSave={() =>
                            patchQualify(
                              'citizenship',
                              editValue.trim() === '' ? null : editValue.trim()
                            )
                          }
                        />
                      }
                    />
                    <QualifyRow
                      label="Mortgage"
                      labelAr="رهن"
                      value={qualify?.mortgage_status ?? '—'}
                      onEdit={() => {
                        setEditingField('mortgage_status');
                        setEditValue(qualify?.mortgage_status ?? '');
                      }}
                      editing={editingField === 'mortgage_status'}
                      editor={
                        <SimpleEditor
                          value={editValue}
                          onChange={setEditValue}
                          saving={savingField === 'mortgage_status'}
                          onCancel={() => setEditingField(null)}
                          onSave={() =>
                            patchQualify(
                              'mortgage_status',
                              editValue.trim() === '' ? null : editValue.trim()
                            )
                          }
                        />
                      }
                    />
                    <QualifyRow
                      label="Timeline"
                      labelAr="الإطار الزمني"
                      value={qualify?.timeline ?? lead.timeline ?? '—'}
                      onEdit={() => {
                        setEditingField('timeline');
                        setEditValue(qualify?.timeline ?? lead.timeline ?? '');
                      }}
                      editing={editingField === 'timeline'}
                      editor={
                        <SimpleEditor
                          value={editValue}
                          onChange={setEditValue}
                          saving={savingField === 'timeline'}
                          onCancel={() => setEditingField(null)}
                          onSave={() =>
                            patchQualify(
                              'timeline',
                              editValue.trim() === '' ? null : editValue.trim()
                            )
                          }
                        />
                      }
                    />
                    <QualifyRow
                      label="Intent"
                      labelAr="النية"
                      value={qualify?.intent ?? lead.intent ?? '—'}
                      onEdit={() => {
                        setEditingField('intent');
                        setEditValue(qualify?.intent ?? lead.intent ?? '');
                      }}
                      editing={editingField === 'intent'}
                      editor={
                        <SimpleEditor
                          value={editValue}
                          onChange={setEditValue}
                          saving={savingField === 'intent'}
                          onCancel={() => setEditingField(null)}
                          onSave={() =>
                            patchQualify(
                              'intent',
                              editValue.trim() === '' ? null : editValue.trim()
                            )
                          }
                        />
                      }
                    />
                    {qualify?.raw_extracted && (
                      <div className="p-3">
                        <button
                          type="button"
                          onClick={() => setRawOpen((v) => !v)}
                          className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--ink-faint)',
                          }}
                        >
                          {rawOpen ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                          )}
                          <span>Last raw extracted</span>
                        </button>
                        {rawOpen && (
                          <pre
                            className="mt-2 p-3 text-[10px] tabular overflow-auto max-h-48"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--paper-sink)',
                              border: '1px solid var(--rule)',
                              borderRadius: '3px',
                              color: 'var(--ink-soft)',
                              direction: 'ltr',
                            }}
                          >
                            {JSON.stringify(qualify.raw_extracted, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Conversation tail */}
              <section>
                <div className="section-head !mb-3">
                  <span className="eyebrow">CONVERSATION · LAST 10</span>
                </div>
                {tailLoading ? (
                  <div
                    className="p-6 flex items-center justify-center"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      style={{ color: 'var(--ink-faint)' }}
                    />
                  </div>
                ) : (
                  <div
                    className="px-4 py-4 space-y-2"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    {(tail ?? []).length === 0 && (
                      <p
                        className="text-xs text-center py-4"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        لا رسائل بعد
                      </p>
                    )}
                    {(tail ?? []).map((m) => (
                      <TailBubble key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(drawer, document.body);
}

function prettySource(src: string): string {
  if (!src.startsWith('portal_')) return src.toUpperCase();
  return src.slice('portal_'.length).replace(/_/g, ' ').toUpperCase();
}

function QualifyRow({
  label,
  labelAr,
  value,
  onEdit,
  editing,
  editor,
}: {
  label: string;
  labelAr: string;
  value: string | number;
  onEdit: () => void;
  editing: boolean;
  editor: React.ReactNode;
}) {
  return (
    <div className="p-3 flex items-start gap-3">
      <div className="w-24 shrink-0">
        <div
          className="text-[10px] tracking-widest uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
          }}
        >
          {label}
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ color: 'var(--ink-faint)' }}
        >
          {labelAr}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          editor
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div
              className="text-sm tabular truncate"
              style={{
                color:
                  value === '—' ? 'var(--ink-faint)' : 'var(--ink)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {value}
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="btn-ghost h-7 w-7 p-0"
              aria-label="Edit"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChipRow({
  label,
  labelAr,
  values,
}: {
  label: string;
  labelAr: string;
  values: string[] | string | null | undefined;
}) {
  // Defensive: Postgres array columns occasionally arrive as JSON-encoded
  // strings ("[\"foo\",\"bar\"]") or as a single string when the row was
  // inserted by an older code path. Coerce anything non-array to [] so we
  // never throw `l.map is not a function`.
  const safeValues = normaliseStringList(values);
  return (
    <div className="p-3 flex items-start gap-3">
      <div className="w-24 shrink-0">
        <div
          className="text-[10px] tracking-widest uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
          }}
        >
          {label}
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ color: 'var(--ink-faint)' }}
        >
          {labelAr}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {safeValues.length === 0 ? (
          <span
            className="text-sm"
            style={{ color: 'var(--ink-faint)' }}
          >
            —
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {safeValues.map((v) => (
              <span
                key={v}
                className="text-[10px] px-2 py-0.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: 'var(--paper-sink)',
                  border: '1px solid var(--rule)',
                  borderRadius: '2px',
                  color: 'var(--ink-soft)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  inputProps,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-boxed h-8 text-xs flex-1"
        autoFocus
        {...inputProps}
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="btn-primary h-8 w-8 p-0"
        aria-label="حفظ"
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Save className="w-3 h-3" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn-ghost h-8 w-8 p-0"
        aria-label="إلغاء"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function BudgetEditor({
  value,
  currency,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  currency: string;
  onChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="text-[10px] tabular"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-faint)',
        }}
      >
        {currency}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="min-max"
        className="input-boxed h-8 text-xs flex-1"
        dir="ltr"
        autoFocus
      />
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="btn-primary h-8 w-8 p-0"
        aria-label="حفظ"
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Save className="w-3 h-3" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn-ghost h-8 w-8 p-0"
        aria-label="إلغاء"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function TailBubble({ m }: { m: TailMessage }) {
  const isInbound = m.direction === 'inbound';
  // Voice provenance heuristic: backend stamps `metadata.voice === true`
  // OR (older path) `metadata.reason === 'voice_transcribed'`. We treat
  // either as a voice-note marker. Documented in the report.
  const isVoice =
    !!m.metadata &&
    ((m.metadata as Record<string, unknown>).voice === true ||
      (m.metadata as Record<string, unknown>).reason === 'voice_transcribed');
  const lang = (m.language ?? '').toUpperCase();
  return (
    <div
      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
    >
      {isVoice && isInbound && (
        <span
          className="text-[9px] mb-1 px-1 flex items-center gap-1"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--primary-glow)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <Mic className="w-2.5 h-2.5" />
          <span>
            VOICE NOTE
            {lang ? ` · TRANSCRIBED FROM ${lang}` : ''}
          </span>
        </span>
      )}
      <div
        className="max-w-[80%] text-xs leading-relaxed px-3 py-2"
        style={{
          background: isInbound
            ? 'var(--paper-lift)'
            : 'color-mix(in srgb, var(--primary) 85%, var(--paper-sink) 15%)',
          color: isInbound ? 'var(--ink)' : 'var(--paper)',
          border: isInbound ? '1px solid var(--rule)' : 'none',
          borderRadius: isInbound ? '10px 10px 10px 2px' : '10px 10px 2px 10px',
        }}
      >
        {m.body}
      </div>
    </div>
  );
}

function BrochurePicker({
  leadId,
  onDone,
}: {
  leadId: string;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<{
    properties: PickerOption[];
    projects: PickerOption[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [tab, setTab] = useState<'properties' | 'projects'>('properties');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/properties').then((r) => (r.ok ? r.json() : { properties: [] })),
      fetch('/api/projects').then((r) => (r.ok ? r.json() : { projects: [] })),
    ])
      .then(([p, j]) => {
        const props: PickerOption[] = (p.properties ?? []).map(
          (x: { id: string; reference: string | null; type: string; location: string | null }) => ({
            id: x.id,
            label: x.reference || x.type,
            hint: x.location ?? undefined,
          })
        );
        const projs: PickerOption[] = (j.projects ?? []).map(
          (x: { id: string; name: string; developer: string | null }) => ({
            id: x.id,
            label: x.name,
            hint: x.developer ?? undefined,
          })
        );
        setOptions({ properties: props, projects: projs });
      })
      .catch(() => setOptions({ properties: [], projects: [] }))
      .finally(() => setLoading(false));
  }, []);

  async function send(kind: 'property' | 'project', id: string) {
    setSending(id);
    try {
      const res = await fetch(
        `/api/conversations/${leadId}/send-brochure`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            kind === 'property'
              ? { property_id: id }
              : { project_id: id }
          ),
        }
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        reason?: string;
        sent?: number;
      };
      // Backend returns ok:false with reason='no_media_attached' when the
      // property exists but has no media_urls. Surface that distinctly so
      // the operator knows to add a brochure to the property record.
      if (!res.ok || j.ok === false) {
        const friendly =
          j.error === 'no_media_attached' || j.reason === 'no_media_attached'
            ? 'لا يوجد brochure مرفق بهذا العقار. أضف وسائط من شاشة العقار أولاً.'
            : j.error === 'property_not_found'
              ? 'لم يتم العثور على العقار.'
              : j.error === 'project_not_found'
                ? 'لم يتم العثور على المشروع.'
                : j.error === 'send_failed'
                  ? `فشل الإرسال عبر واتساب${j.detail ? `: ${j.detail}` : ''}`
                  : `لم نتمكن من الإرسال (${j.error ?? `http_${res.status}`}${j.detail ? `: ${j.detail}` : ''})`;
        toast.error(friendly);
        return;
      }
      toast.success('تم إرسال الـ brochure');
      onDone();
    } catch (err: any) {
      toast.error(`فشل الاتصال: ${err?.message ?? 'unknown'}`);
    } finally {
      setSending(null);
    }
  }

  const items = tab === 'properties' ? options?.properties ?? [] : options?.projects ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 p-3"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-center gap-1 mb-2">
        {(['properties', 'projects'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="h-7 px-2 text-[10px] tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              background: tab === t ? 'var(--ink)' : 'transparent',
              color: tab === t ? 'var(--paper)' : 'var(--ink-soft)',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="py-6 text-center">
          <Loader2
            className="w-4 h-4 animate-spin inline-block"
            style={{ color: 'var(--ink-faint)' }}
          />
        </div>
      ) : items.length === 0 ? (
        <p
          className="text-xs text-center py-4"
          style={{ color: 'var(--ink-faint)' }}
        >
          لا {tab === 'properties' ? 'عقارات' : 'مشاريع'} مسجّلة
        </p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {items.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() =>
                  send(tab === 'properties' ? 'property' : 'project', o.id)
                }
                disabled={sending === o.id}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-[var(--paper-sink)] transition-colors"
                style={{ borderRadius: '3px' }}
              >
                <div className="min-w-0 text-left">
                  <div
                    className="truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    {o.label}
                  </div>
                  {o.hint && (
                    <div
                      className="text-[10px] truncate"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      {o.hint}
                    </div>
                  )}
                </div>
                {sending === o.id ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                ) : (
                  <ArrowRight
                    className="w-3 h-3 shrink-0 rtl:rotate-180"
                    style={{ color: 'var(--ink-faint)' }}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// Re-export for callers that need the helper without importing the
// internal module path.
export const formatBudgetForRow = formatBudget;
