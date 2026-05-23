'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Shield,
  ShieldCheck,
  FileText,
  RefreshCcw,
  CheckCircle2,
  Download,
  Loader2,
  Info,
  Filter,
} from 'lucide-react';
import { KycCaseDrawer, type KycCaseDetail } from '@/components/real-estate/kyc-case-drawer';
import { SanctionsStatusPanel } from '@/components/real-estate/sanctions-status-panel';

export interface KycCaseRow {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: KycStatus;
  expected_purchase_amount: number | null;
  expected_purchase_currency: string | null;
  documents_count: number | null;
  documents_required: number | null;
  last_activity_at: string | null;
}

export type KycStatus =
  | 'started'
  | 'docs_pending'
  | 'docs_collected'
  | 'screening'
  | 'ready_for_filing'
  | 'filed'
  | 'rejected'
  | 'abandoned';

const STATUS_META: Record<KycStatus, { label: string; pill: string; rank: number }> = {
  started: { label: 'بدأ', pill: 'pill-idle', rank: 0 },
  docs_pending: { label: 'بانتظار وثائق', pill: 'pill-warn', rank: 1 },
  docs_collected: { label: 'وثائق مكتملة', pill: 'pill-warn', rank: 2 },
  screening: { label: 'فحص العقوبات', pill: 'pill-warn', rank: 3 },
  ready_for_filing: { label: 'جاهز للإيداع', pill: 'pill-signal', rank: 4 },
  filed: { label: 'مودَع', pill: 'pill-success', rank: 5 },
  rejected: { label: 'مرفوض', pill: 'pill-idle', rank: 6 },
  abandoned: { label: 'متروك', pill: 'pill-idle', rank: 7 },
};

const STATUS_FILTERS: { key: 'all' | KycStatus | 'open'; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'docs_pending', label: 'بانتظار وثائق' },
  { key: 'ready_for_filing', label: 'جاهزة للإيداع' },
  { key: 'filed', label: 'مودَعة' },
];

function redactPhone(p: string): string {
  const trimmed = (p ?? '').replace(/\s+/g, '');
  if (trimmed.length < 6) return '••••';
  return `${trimmed.slice(0, 4)}${'·'.repeat(Math.max(2, trimmed.length - 6))}${trimmed.slice(-2)}`;
}

function formatAed(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  const fmt = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
  return `${currency ?? 'AED'} ${fmt.format(amount)}`;
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} يوم`;
}

export function KycPage({
  kycEnabled,
  consentRequired,
}: {
  kycEnabled: boolean;
  consentRequired: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(kycEnabled);
  const [optInBusy, setOptInBusy] = useState(false);
  const [rows, setRows] = useState<KycCaseRow[]>([]);
  const [provisioned, setProvisioned] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['key']>('all');
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(
    searchParams?.get('case') ?? null
  );
  const [activeCase, setActiveCase] = useState<KycCaseDetail | null>(null);
  const [activeCaseLoading, setActiveCaseLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (highValueOnly) params.set('high_value', '1');
      const res = await fetch(`/api/kyc/cases?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch_failed');
      const j = (await res.json()) as {
        cases: KycCaseRow[];
        provisioned: boolean;
      };
      setRows(j.cases ?? []);
      setProvisioned(j.provisioned !== false);
    } catch {
      setRows([]);
      setProvisioned(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, statusFilter, dateFrom, dateTo, highValueOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // When `?case=<id>` is in the URL we eagerly fetch the case detail
  // so the drawer can open on first render (e.g. arriving from the
  // /leads "Start KYC" quick-action).
  const fetchCase = useCallback(async (id: string) => {
    setActiveCaseLoading(true);
    try {
      const res = await fetch(`/api/kyc/cases/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        setActiveCase(null);
        return;
      }
      const j = (await res.json()) as KycCaseDetail | { provisioned: false };
      if ('provisioned' in j && j.provisioned === false) {
        setActiveCase(null);
        toast.error('خدمة KYC الخلفية ليست جاهزة بعد');
        return;
      }
      setActiveCase(j as KycCaseDetail);
    } finally {
      setActiveCaseLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeCaseId) void fetchCase(activeCaseId);
    else setActiveCase(null);
  }, [activeCaseId, fetchCase]);

  function openCase(id: string) {
    setActiveCaseId(id);
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    sp.set('case', id);
    router.replace(`/kyc?${sp.toString()}`);
  }

  function closeCase() {
    setActiveCaseId(null);
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    sp.delete('case');
    router.replace(sp.toString() ? `/kyc?${sp.toString()}` : '/kyc');
  }

  async function enableKyc() {
    setOptInBusy(true);
    try {
      const res = await fetch('/api/settings/kyc-enabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        deferred?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error('تعذّر تفعيل الامتثال');
        return;
      }
      if (j.deferred) {
        toast.message('تم الحفظ — يتم التنشيط الكامل بعد ترحيل قاعدة البيانات');
      } else {
        toast.success('تم تفعيل سير عمل الامتثال');
      }
      setEnabled(true);
      router.refresh();
    } finally {
      setOptInBusy(false);
    }
  }

  // Memos must run on every render (Rules of Hooks) so we compute them
  // before any conditional early-return. They are cheap when `rows` is
  // empty (opt-in / not-provisioned states).
  const stats = useMemo(() => {
    const open = rows.filter((r) =>
      ['started', 'docs_pending', 'docs_collected', 'screening'].includes(r.status)
    ).length;
    const docsPending = rows.filter((r) => r.status === 'docs_pending').length;
    const ready = rows.filter((r) => r.status === 'ready_for_filing').length;
    const now = new Date();
    const filedThisMonth = rows.filter((r) => {
      if (r.status !== 'filed' || !r.last_activity_at) return false;
      const d = new Date(r.last_activity_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    return { open, docsPending, ready, filedThisMonth };
  }, [rows]);

  // Composite "open" + high-value filter applied client-side so toggling
  // doesn't refetch.
  const visible = useMemo(() => {
    let r = rows;
    if (statusFilter === 'open') {
      r = r.filter((x) =>
        ['started', 'docs_pending', 'docs_collected', 'screening'].includes(x.status)
      );
    }
    if (highValueOnly) {
      r = r.filter((x) => (x.expected_purchase_amount ?? 0) > 1_000_000);
    }
    return r;
  }, [rows, statusFilter, highValueOnly]);

  // Opt-in screen — shown when kyc_enabled === false. Single CTA.
  if (!enabled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-2xl"
      >
        <div
          className="p-8 sm:p-10"
          style={{
            background: 'var(--paper-lift)',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
          }}
        >
          <ShieldCheck
            className="w-10 h-10 mb-5"
            style={{ color: 'var(--primary-glow)' }}
            strokeWidth={1.25}
          />
          <h2 className="display-ar text-2xl mb-3" style={{ color: 'var(--ink)' }}>
            تفعيل سير عمل الامتثال (KYC)
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-soft)' }}>
            للوسطاء المرخّصين في الإمارات والسعودية، تعتبر مكاتب العقار من فئة
            <span className="mx-1" style={{ color: 'var(--ink)', fontWeight: 500 }}>DNFBP</span>
            (Designated Non-Financial Businesses and Professions) ويتعيّن عليها جمع
            وثائق التحقّق من العميل قبل إتمام أي صفقة تتجاوز عتبة معيّنة. بتفعيل هذا
            السير ستبدأ Anvira تلقائياً بجمع الجواز / الهوية الإماراتية / إثبات
            العنوان / مصدر الأموال من العملاء الجادّين، ثم تُجري فحص قوائم العقوبات
            وتُولّد تقرير PDF جاهز للإيداع لدى FIU.
          </p>
          <div
            className="p-4 mb-6 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              background: 'var(--paper-sink)',
              border: '1px solid var(--rule)',
              borderRadius: '3px',
              color: 'var(--ink-soft)',
            }}
          >
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              التفعيل اختياري ويمكن إيقافه لاحقاً من الإعدادات. لا يتم تطبيقه
              بأثر رجعي على المحادثات الموجودة.
            </span>
          </div>
          {!consentRequired && (
            <div
              className="p-4 mb-6 flex items-start gap-2.5 text-xs leading-relaxed"
              style={{
                background: 'color-mix(in srgb, var(--warn) 8%, var(--paper-lift))',
                border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)',
                borderRadius: '3px',
                color: 'var(--ink)',
              }}
            >
              <Info
                className="w-3.5 h-3.5 mt-0.5 shrink-0"
                style={{ color: 'var(--warn)' }}
              />
              <span>
                ننصح بتفعيل "جمع الموافقة" أيضاً من{' '}
                <a href="/settings" className="underline" style={{ color: 'var(--primary-glow)' }}>
                  الإعدادات
                </a>{' '}
                قبل البدء — KYC وموافقة PDPL يعمل سويّاً.
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={enableKyc}
            disabled={optInBusy}
            className="btn-primary h-12 px-6 text-sm gap-2"
          >
            {optInBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            <span>تفعيل سير عمل الامتثال</span>
          </button>
        </div>
      </motion.div>
    );
  }

  // Provisioned guard — table tables not yet migrated on the backend.
  if (!provisioned) {
    return (
      <NotProvisionedState
        title="خدمة KYC الخلفية قيد التحضير"
        body="تم تفعيل سير العمل بنجاح، لكن جداول قاعدة البيانات لم تُرحَّل بعد. سيظهر العملاء هنا تلقائياً فور تشغيل الترحيل."
      />
    );
  }

  return (
    <div>
      {/* PDPL/AML positioning disclaimer (per addendum). Anvira is a
          software vendor providing workflow tools; the broker remains
          the regulated party. Banner must appear above all KYC surfaces
          so the operator is reminded on every visit, not just on
          first-touch onboarding. */}
      <ComplianceDisclaimerBanner />

      {/* Sanctions provider status — server-controlled, read-only chip
          + ad-hoc test. Sits above the stats grid so the operator can
          see "what engine is screening my cases" at a glance. */}
      <SanctionsStatusPanel />

      {/* Stats row */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.06 } },
        }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
      >
        <Stat label="حالات مفتوحة" value={stats.open} />
        <Stat label="وثائق ناقصة" value={stats.docsPending} accent="warn" />
        <Stat label="جاهزة للإيداع" value={stats.ready} accent="signal" />
        <Stat label="مودَعة هذا الشهر" value={stats.filedThisMonth} accent="success" />
      </motion.div>

      {/* Filter bar */}
      <div
        className="mb-6 p-3 flex flex-wrap items-center gap-2"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <Filter className="w-3.5 h-3.5 ms-1" style={{ color: 'var(--ink-faint)' }} />
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              className="h-8 px-3 text-[11px] tracking-widest uppercase transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                background: statusFilter === s.key ? 'var(--ink)' : 'transparent',
                color: statusFilter === s.key ? 'var(--paper)' : 'var(--ink-soft)',
                borderRadius: '2px',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="mx-2 h-5 w-px" style={{ background: 'var(--rule)' }} />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="input-boxed h-8 text-xs w-36"
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          —
        </span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="input-boxed h-8 text-xs w-36"
          dir="ltr"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <span className="mx-2 h-5 w-px" style={{ background: 'var(--rule)' }} />
        <label className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <input
            type="checkbox"
            checked={highValueOnly}
            onChange={(e) => setHighValueOnly(e.target.checked)}
            className="w-3.5 h-3.5 accent-current"
            style={{ accentColor: 'var(--primary-glow)' }}
          />
          <span>عالية القيمة (&gt; مليون درهم)</span>
        </label>
        <span className="flex-1" />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--ink-faint)' }} />}
      </div>

      {/* Case list */}
      {visible.length === 0 ? (
        <EmptyTable />
      ) : (
        <div style={{ border: '1px solid var(--rule)', borderRadius: '3px' }}>
          {/* Header row */}
          <div
            className="hidden md:grid grid-cols-[1fr_140px_140px_120px_110px_140px] gap-3 items-center px-4 py-2.5"
            style={{
              background: 'var(--paper-lift)',
              borderBottom: '1px solid var(--rule)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--ink-faint)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <span>العميل</span>
            <span>الحالة</span>
            <span>المبلغ المتوقّع</span>
            <span>الوثائق</span>
            <span>آخر نشاط</span>
            <span className="text-end">إجراءات</span>
          </div>
          {visible.map((row) => (
            <CaseRow
              key={row.id}
              row={row}
              onOpen={() => openCase(row.id)}
              onRefresh={() => void refresh()}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <KycCaseDrawer
        open={!!activeCaseId}
        caseId={activeCaseId}
        detail={activeCase}
        loading={activeCaseLoading}
        onClose={closeCase}
        onUpdated={(d) => {
          setActiveCase(d);
          void refresh();
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'warn' | 'signal' | 'success';
}) {
  const color =
    accent === 'warn'
      ? 'var(--warn)'
      : accent === 'signal'
      ? 'var(--signal)'
      : accent === 'success'
      ? 'var(--primary-glow)'
      : 'var(--ink)';
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      }}
      className="p-4"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div
        className="text-[10px] tracking-widest uppercase mb-2"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
      >
        {label}
      </div>
      <div
        className="tabular text-3xl leading-none"
        style={{ fontFamily: 'var(--font-display)', color, fontWeight: 400 }}
      >
        {value}
      </div>
    </motion.div>
  );
}

function CaseRow({
  row,
  onOpen,
  onRefresh,
}: {
  row: KycCaseRow;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<'screen' | 'file' | 'pdf' | null>(null);
  const status = STATUS_META[row.status];

  async function rescreen(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy('screen');
    try {
      const res = await fetch(`/api/kyc/cases/${row.id}/screen`, { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('تم تشغيل الفحص');
      onRefresh();
    } catch {
      toast.error('تعذّر الفحص');
    } finally {
      setBusy(null);
    }
  }
  async function markFiled(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy('file');
    try {
      const res = await fetch(`/api/kyc/cases/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'filed' }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم وضع علامة "مودَع"');
      onRefresh();
    } catch {
      toast.error('تعذّر الحفظ');
    } finally {
      setBusy(null);
    }
  }
  async function downloadPdf(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy('pdf');
    try {
      const res = await fetch(`/api/kyc/cases/${row.id}/report-pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kyc-${row.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('تعذّر تحميل التقرير');
    } finally {
      setBusy(null);
    }
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full grid md:grid-cols-[1fr_140px_140px_120px_110px_140px] grid-cols-1 gap-3 items-center px-4 py-3 row-hover text-right"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
          {row.customer_name || 'بدون اسم'}
        </div>
        <div
          className="text-[11px] mt-0.5 tabular truncate"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          dir="ltr"
        >
          {redactPhone(row.customer_phone)}
        </div>
      </div>
      <span className={`pill ${status.pill}`}>
        <span className="pill-dot" />
        <span>{status.label}</span>
      </span>
      <div
        className="text-sm tabular"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
        dir="ltr"
      >
        {formatAed(row.expected_purchase_amount, row.expected_purchase_currency)}
      </div>
      <div
        className="text-xs tabular"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}
        dir="ltr"
      >
        {row.documents_count ?? 0} / {row.documents_required ?? 4}
      </div>
      <div
        className="text-[11px]"
        style={{ color: 'var(--ink-faint)' }}
      >
        {relTime(row.last_activity_at)}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <ActionIcon
          label="إعادة فحص"
          onClick={rescreen}
          busy={busy === 'screen'}
          icon={<RefreshCcw className="w-3.5 h-3.5" />}
        />
        <ActionIcon
          label="مودَع"
          onClick={markFiled}
          busy={busy === 'file'}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        />
        <ActionIcon
          label="تقرير PDF"
          onClick={downloadPdf}
          busy={busy === 'pdf'}
          icon={<Download className="w-3.5 h-3.5" />}
        />
      </div>
    </button>
  );
}

function ActionIcon({
  label,
  onClick,
  busy,
  icon,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  busy: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="btn-ghost h-8 w-8 p-0"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    </button>
  );
}

function EmptyTable() {
  return (
    <div
      className="py-16 px-6 text-center"
      style={{
        background: 'var(--paper-lift)',
        border: '1px dashed var(--rule)',
        borderRadius: '3px',
      }}
    >
      <FileText
        className="w-9 h-9 mx-auto mb-4"
        style={{ color: 'var(--ink-ghost)' }}
        strokeWidth={1}
      />
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        لا توجد حالات تطابق التصفية الحالية.
      </p>
      <p className="text-xs mt-1.5" style={{ color: 'var(--ink-faint)' }}>
        ستظهر الحالات هنا تلقائياً عندما يبدأ البوت بجمع وثائق العميل.
      </p>
    </div>
  );
}

function NotProvisionedState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="py-16 px-6 text-center max-w-xl mx-auto"
      style={{
        background: 'var(--paper-lift)',
        border: '1px dashed var(--rule)',
        borderRadius: '3px',
      }}
    >
      <Shield
        className="w-9 h-9 mx-auto mb-4"
        style={{ color: 'var(--ink-ghost)' }}
        strokeWidth={1}
      />
      <h2 className="display-ar text-xl mb-2" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        {body}
      </p>
    </div>
  );
}

/**
 * Workflow-assistance positioning disclaimer (per addendum). Anvira is
 * software, not a regulated entity — UAE Federal Decree-Law 10/2025
 * obligations land on the broker, not on us. Banner re-asserts this
 * every visit so the operator never forgets where the line is.
 *
 * Editorial style matches the existing alert chips: dashed border,
 * paper-sink background, no glassmorphism, no emoji.
 */
function ComplianceDisclaimerBanner() {
  return (
    <div
      className="mb-6 p-4"
      style={{
        background: 'var(--paper-sink)',
        border: '1px dashed var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-start gap-3">
        <Info
          className="w-4 h-4 mt-0.5 shrink-0"
          style={{ color: 'var(--ink-faint)' }}
        />
        <div className="flex-1 space-y-2">
          <p
            className="text-[12px] leading-relaxed"
            style={{ color: 'var(--ink-soft)' }}
            dir="rtl"
          >
            توفّر Anvira أدوات سير عمل لتوثيق متطلبات الامتثال ومكافحة غسل
            الأموال. يبقى المكتب العقاري هو المسؤول عن الالتزامات التنظيمية
            بموجب المرسوم الاتحادي الإماراتي رقم ١٠ لسنة ٢٠٢٥، بما في ذلك
            تقديم تقارير STR / REAR عبر بوابة goAML. لا تقوم Anvira بتقديم
            التقارير إلى الجهات التنظيمية نيابةً عنك، ولا تضمن قبول
            المستندات المولَّدة من قِبل تلك الجهات.
          </p>
          <p
            className="text-[10px] leading-relaxed"
            style={{ color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}
          >
            Anvira provides workflow assistance for AML/KYC documentation.
            Brokers remain responsible for compliance obligations under UAE
            Federal Decree-Law No. 10 of 2025, including STR/REAR filings
            via the goAML portal. Anvira does not submit reports to
            regulators on your behalf and does not guarantee regulatory
            acceptance of generated documents.
          </p>
        </div>
      </div>
    </div>
  );
}
