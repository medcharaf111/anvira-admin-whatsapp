'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type Provider = 'stub' | 'opensanctions' | 'comply_advantage';

interface ProviderMeta {
  label: string;
  pillBg: string;
  pillFg: string;
  helper: string;
}

const PROVIDER_META: Record<Provider, ProviderMeta> = {
  stub: {
    label: 'STUB',
    pillBg: 'color-mix(in srgb, var(--ink-faint) 18%, var(--paper-lift))',
    pillFg: 'var(--ink-soft)',
    helper:
      'وضع التطوير — لا فحص حقيقي. اضبط SANCTIONS_PROVIDER في البيئة لتشغيل الفحص الحقيقي.',
  },
  opensanctions: {
    label: 'OPENSANCTIONS',
    pillBg: 'color-mix(in srgb, var(--primary-glow) 20%, var(--paper-lift))',
    pillFg: 'var(--primary-glow)',
    helper:
      'فحص ضد UN، OFAC، EU، UK HMT، Interpol عبر OpenSanctions (مجاني ١٠٠ استعلام/يوم).',
  },
  comply_advantage: {
    label: 'COMPLY_ADVANTAGE',
    pillBg: 'color-mix(in srgb, var(--success, var(--primary-glow)) 18%, var(--paper-lift))',
    pillFg: 'var(--primary-glow)',
    helper:
      'فحص متقدّم عبر ComplyAdvantage (يشمل adverse media وقوائم محلية).',
  },
};

// Backend's canonical SanctionsResult strings (src/sanctions/types.ts):
// 'clear' | 'possible_match' | 'confirmed_match' | 'error'.
// The UI previously expected a different vocabulary ('clean' / 'match' /
// 'review_needed'), so a real confirmed match fell through to the
// catch-all and rendered as "خطأ من المزوّد". Aligning here.
interface TestResult {
  provisioned: boolean;
  result?: 'clear' | 'possible_match' | 'confirmed_match' | 'error';
  matches?: Array<{
    source: string;
    matchedName: string;
    matchScore: number;
    listingUrl?: string;
  }>;
  matched_lists?: string[]; // legacy — pre-Track-D backend response shape
  notes?: string;
  provider?: string;
  error?: string;
}

/**
 * Read-only status panel surfacing the server-controlled
 * SANCTIONS_PROVIDER env to RE operators in the /kyc header.
 *
 * Hidden when kyc_enabled === false (mounted by the parent only after
 * opt-in). Single fetch on mount, no realtime needed — provider only
 * changes via deploy.
 */
export function SanctionsStatusPanel() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [testName, setTestName] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/sanctions/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { provider?: Provider } | null) => {
        if (cancelled) return;
        setProvider((j?.provider as Provider | undefined) ?? 'stub');
      })
      .catch(() => {
        if (!cancelled) setProvider('stub');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runTest() {
    const name = testName.trim();
    if (!name) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sanctions/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name }),
      });
      const j = (await res.json().catch(() => ({}))) as TestResult;
      setTestResult(j);
    } catch {
      setTestResult({ provisioned: false, error: 'fetch_failed' });
    } finally {
      setTestBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        className="mb-6 p-4 flex items-center gap-3"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <Loader2
          className="w-3.5 h-3.5 animate-spin"
          style={{ color: 'var(--ink-faint)' }}
        />
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          جارٍ التحقّق من مزوّد الفحص…
        </span>
      </div>
    );
  }

  const meta = PROVIDER_META[provider ?? 'stub'];
  const Icon =
    provider === 'stub' ? Shield : provider === 'opensanctions' ? ShieldAlert : ShieldCheck;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 p-4"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '3px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 shrink-0 inline-flex items-center justify-center"
          style={{
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <Icon
            className="w-4 h-4"
            strokeWidth={1.5}
            style={{ color: meta.pillFg }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
            >
              SANCTIONS PROVIDER · موفّر فحص العقوبات
            </span>
            <span
              className="text-[10px] tabular tracking-widest uppercase px-2 py-0.5"
              style={{
                fontFamily: 'var(--font-mono)',
                background: meta.pillBg,
                color: meta.pillFg,
                border: `1px solid color-mix(in srgb, ${meta.pillFg} 30%, transparent)`,
                borderRadius: '2px',
              }}
              dir="ltr"
            >
              {meta.label}
            </span>
          </div>
          <p
            className="text-[11px] leading-relaxed mt-2"
            style={{ color: 'var(--ink-soft)' }}
          >
            {meta.helper}
          </p>

          {/* Test action */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTestOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[10px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                background: testOpen ? 'var(--ink)' : 'transparent',
                color: testOpen ? 'var(--paper)' : 'var(--ink-soft)',
                border: '1px solid var(--rule)',
                borderRadius: '2px',
              }}
            >
              <Play className="w-3 h-3" />
              <span>Test screening</span>
            </button>
            <span
              className="text-[10px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              تحقّق سريع من اتصال المزوّد باسم تجريبي
            </span>
          </div>

          <AnimatePresence initial={false}>
            {testOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void runTest();
                    }}
                    placeholder="اسم تجريبي، مثلاً: Ahmad Ali"
                    className="input-boxed h-8 text-xs flex-1 min-w-[12rem]"
                    dir="ltr"
                    aria-label="Test sanctions name"
                  />
                  <button
                    type="button"
                    onClick={runTest}
                    disabled={testBusy || !testName.trim()}
                    className="btn-primary h-8 px-3 text-[11px] gap-1.5"
                  >
                    {testBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    <span>تشغيل</span>
                  </button>
                </div>
                {testResult && (
                  <div className="mt-3">
                    <TestResultPill result={testResult} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}

function TestResultPill({ result }: { result: TestResult }) {
  // Phase-B: backend `/internal/sanctions/test` is shipping. We still
  // tolerate a transient `provisioned:false` (env not yet pointed at
  // the new backend deploy) but surface it as a degraded-provider
  // warning rather than a "not implemented" empty state.
  if (!result.provisioned) {
    return (
      <div
        className="p-3 flex items-start gap-2 text-[11px] leading-relaxed"
        style={{
          background: 'var(--warn-soft)',
          border:
            '1px solid color-mix(in srgb, var(--warn) 30%, var(--rule))',
          borderRadius: '3px',
          color: 'var(--ink-soft)',
        }}
      >
        <AlertCircle
          className="w-3.5 h-3.5 mt-0.5 shrink-0"
          style={{ color: 'var(--warn)' }}
        />
        <span>
          الخادم لا يستجيب لطلب الاختبار الآن. حاول مجدداً بعد لحظات، أو
          راجع الدعم إذا استمرّت المشكلة.
        </span>
      </div>
    );
  }

  const r = result.result ?? 'error';
  // 'confirmed_match' is the most severe (>= 0.85 score on the OpenSanctions
  // adapter); 'possible_match' covers the 0.50-0.85 band that needs
  // operator review; 'clear' is no hits; 'error' is provider failure.
  const color =
    r === 'clear'
      ? 'var(--primary-glow)'
      : r === 'confirmed_match'
      ? 'var(--signal)'
      : r === 'possible_match'
      ? 'var(--warn)'
      : 'var(--ink-faint)';
  const label =
    r === 'clear'
      ? 'نظيف — لا تطابقات'
      : r === 'confirmed_match'
      ? 'تطابق مؤكّد — يحتاج مراجعة بشرية فوراً'
      : r === 'possible_match'
      ? 'تطابق محتمل — يُنصح بالمراجعة'
      : 'خطأ من المزوّد';

  return (
    <div
      className="p-3 flex items-start gap-2"
      style={{
        background: 'var(--paper-sink)',
        border: `1px solid color-mix(in srgb, ${color} 30%, var(--rule))`,
        borderRadius: '3px',
      }}
    >
      <CheckCircle2
        className="w-3.5 h-3.5 mt-0.5 shrink-0"
        style={{ color }}
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-[11px] font-medium"
          style={{ color }}
        >
          {label}
        </div>
        {/* Track D — render dataset chips from either the new `matches[]`
            shape (OpenSanctions provider, one entry per source hit) or the
            legacy `matched_lists[]` strings the stub provider used to emit.
            Dedupe by source so the same person across multiple lists shows
            each list only once. */}
        {(() => {
          const sources = result.matches
            ? Array.from(new Set(result.matches.map((m) => m.source)))
            : (result.matched_lists ?? []);
          if (sources.length === 0) return null;
          return (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {sources.slice(0, 10).map((l) => (
                <span
                  key={l}
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--paper-lift)',
                    border: '1px solid var(--rule)',
                    borderRadius: '2px',
                    color: 'var(--ink-soft)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {l}
                </span>
              ))}
              {sources.length > 10 && (
                <span
                  className="text-[10px] px-1.5 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                >
                  +{sources.length - 10}
                </span>
              )}
            </div>
          );
        })()}
        {result.notes && (
          <p
            className="text-[11px] mt-1"
            style={{ color: 'var(--ink-soft)' }}
          >
            {result.notes}
          </p>
        )}
      </div>
    </div>
  );
}
