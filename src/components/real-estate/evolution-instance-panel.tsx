'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Activity,
  AlertOctagon,
  Loader2,
  RefreshCw,
  LogOut,
  Replace,
} from 'lucide-react';

type InstanceState =
  | 'connected'
  | 'disconnected'
  | 'banned'
  | 'qr_pending'
  | 'unknown';

interface StateResponse {
  provisioned?: boolean;
  state?: InstanceState;
  last_seen_at?: string | null;
  warmup_started_at?: string | null;
  warmup_day?: number | null;
  outbound_last_7d?: number;
  error?: string;
}

interface EvolutionInstancePanelProps {
  instance: string;
  onResumeScan: () => void;
  /** Bumped by the parent when re-mounting after a connect. */
  refreshKey?: number;
}

// Background polling cadence for the live panel — gentle so it doesn't
// hammer the backend or distract the operator. The QR modal uses a
// much tighter 2s loop only while actively scanning.
const PANEL_POLL_MS = 30_000;

// Warmup phase boundaries — days 1–3, 4–7, 8–10, 11–14, 15+. Matches
// the bot's outbound rate-limit schedule. Each phase has a distinct
// color and label so the operator can eyeball where they are at a
// glance.
interface WarmupPhase {
  startDay: number;
  endDay: number;
  color: string;
  bg: string;
  labelAr: string;
  labelEn: string;
}
const WARMUP_PHASES: ReadonlyArray<WarmupPhase> = [
  {
    startDay: 1,
    endDay: 3,
    color: 'var(--signal)',
    bg: 'color-mix(in srgb, var(--signal) 60%, var(--paper))',
    labelAr: 'استقبال فقط',
    labelEn: 'Receive-only',
  },
  {
    startDay: 4,
    endDay: 7,
    color: 'var(--warn)',
    bg: 'color-mix(in srgb, var(--warn) 55%, var(--paper))',
    labelAr: '٥ رسائل / ساعة',
    labelEn: 'Up to 5/hour',
  },
  {
    startDay: 8,
    endDay: 10,
    color: 'var(--warn)',
    bg: 'color-mix(in srgb, var(--warn) 80%, var(--paper))',
    labelAr: '١٥ رسالة / ساعة',
    labelEn: 'Up to 15/hour',
  },
  {
    startDay: 11,
    endDay: 14,
    color: 'var(--primary-glow)',
    bg: 'color-mix(in srgb, var(--primary-glow) 55%, var(--paper))',
    labelAr: '٣٠ رسالة / ساعة — اقتربنا',
    labelEn: 'Up to 30/hour — almost ready',
  },
  {
    startDay: 15,
    endDay: 15,
    color: 'var(--primary-glow)',
    bg: 'color-mix(in srgb, var(--primary-glow) 85%, var(--paper))',
    labelAr: 'حالة مستقرّة',
    labelEn: 'Steady state',
  },
];

function getWarmupPhase(day: number): WarmupPhase {
  if (day <= 0) return WARMUP_PHASES[0];
  if (day >= 15) return WARMUP_PHASES[4];
  return (
    WARMUP_PHASES.find((p) => day >= p.startDay && day <= p.endDay) ??
    WARMUP_PHASES[0]
  );
}

function computeWarmupDay(
  warmupStartedAt: string | null | undefined,
  fallback: number | null | undefined
): number {
  if (typeof fallback === 'number' && fallback >= 0) return fallback;
  if (!warmupStartedAt) return 0;
  const started = new Date(warmupStartedAt).getTime();
  if (Number.isNaN(started)) return 0;
  const diff = Date.now() - started;
  return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'منذ لحظات';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

/**
 * Live connection panel for the Evolution instance bound to this
 * tenant. Polls every 30s while mounted; surfaces warmup progress,
 * 7-day outbound count, and a confirm-required logout link.
 *
 * Mounted by <WhatsAppTransportPanel/> below the chip when the
 * tenant is on Evolution AND has an instance.
 */
export function EvolutionInstancePanel({
  instance,
  onResumeScan,
  refreshKey = 0,
}: EvolutionInstancePanelProps) {
  const router = useRouter();
  const [data, setData] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/evolution/instances/${encodeURIComponent(instance)}/state`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        setData({ provisioned: false });
        return;
      }
      const json = (await res.json()) as StateResponse;
      setData(json);
    } catch {
      setData({ provisioned: false });
    } finally {
      setLoading(false);
    }
  }, [instance]);

  useEffect(() => {
    void fetchState();
    const id = setInterval(() => void fetchState(), PANEL_POLL_MS);
    return () => clearInterval(id);
  }, [fetchState, refreshKey]);

  async function doLogout() {
    setLogoutBusy(true);
    try {
      const res = await fetch(
        `/api/evolution/instances/${encodeURIComponent(instance)}/logout`,
        { method: 'POST' }
      );
      if (!res.ok) {
        toast.error('تعذّر تسجيل الخروج');
        return;
      }
      toast.success('تم تسجيل الخروج');
      setConfirmLogout(false);
      void fetchState();
    } finally {
      setLogoutBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        className="mt-5 p-5 flex items-center gap-3"
        style={{
          background: 'var(--paper-sink)',
          border: '1px solid var(--rule-soft)',
          borderRadius: '3px',
        }}
      >
        <Loader2
          className="w-3.5 h-3.5 animate-spin"
          style={{ color: 'var(--ink-faint)' }}
        />
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          جارٍ تحميل حالة الاتصال…
        </span>
      </div>
    );
  }

  const state: InstanceState = data?.state ?? 'unknown';
  const warmupDay = computeWarmupDay(
    data?.warmup_started_at,
    data?.warmup_day
  );
  const phase = getWarmupPhase(warmupDay);

  const dot = STATE_DOT[state];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-5"
      style={{
        background: 'var(--paper-sink)',
        border: '1px solid var(--rule-soft)',
        borderRadius: '3px',
      }}
    >
      {/* Top row: status + actions */}
      <div className="px-5 py-4 flex items-start gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Connection dot — animated halo when 'connected' */}
          <div className="relative w-3 h-3 shrink-0">
            {state === 'connected' && (
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: dot.color, opacity: 0.35 }}
              />
            )}
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: dot.color }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-medium"
                style={{ color: dot.color }}
                dir="rtl"
              >
                {dot.labelAr}
              </span>
              <span
                className="text-[10px] tracking-widest uppercase tabular"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-faint)',
                  letterSpacing: '0.08em',
                }}
                dir="ltr"
              >
                {dot.labelEn}
              </span>
            </div>
            <p
              className="text-[11px] mt-0.5 tabular"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.02em',
              }}
              dir="rtl"
            >
              {state === 'connected'
                ? `آخر اتصال ${formatLastSeen(data?.last_seen_at)}`
                : state === 'banned'
                ? 'الرقم محظور — استبدله للمتابعة'
                : state === 'qr_pending'
                ? 'لم يكتمل المسح بعد'
                : 'الجهاز غير مرتبط حالياً'}
            </p>
          </div>
        </div>

        {/* State-specific CTAs */}
        <div className="flex items-center gap-2 flex-wrap">
          {state === 'disconnected' && (
            <button
              type="button"
              onClick={onResumeScan}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] tracking-wider"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--warn)',
                color: 'var(--paper)',
                border: 'none',
                borderRadius: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              <RefreshCw className="w-3 h-3" />
              <span>أعد المسح</span>
            </button>
          )}
          {state === 'qr_pending' && (
            <button
              type="button"
              onClick={onResumeScan}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] tracking-wider"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--ink)',
                color: 'var(--paper)',
                border: 'none',
                borderRadius: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Resume scan</span>
            </button>
          )}
          {state === 'banned' && (
            <button
              type="button"
              onClick={() => router.push('/recovery')}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] tracking-wider"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--signal)',
                color: 'var(--paper)',
                border: 'none',
                borderRadius: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              <Replace className="w-3 h-3" />
              <span>استبدال الرقم</span>
            </button>
          )}
        </div>
      </div>

      {/* Warmup bar — only shown when we have a meaningful state */}
      {(state === 'connected' || state === 'disconnected') && (
        <div
          className="px-5 py-4"
          style={{ borderTop: '1px solid var(--rule-soft)' }}
        >
          <div className="flex items-baseline gap-3 flex-wrap mb-3">
            <Activity
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--ink-faint)' }}
            />
            <span
              className="text-[10px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.08em',
              }}
              dir="ltr"
            >
              Warmup · يوم {Math.min(warmupDay, 15)} / 15
            </span>
            <span
              className="text-[11px] ms-auto"
              style={{ color: 'var(--ink-soft)' }}
              dir="rtl"
            >
              {phase.labelAr}
            </span>
          </div>

          {/* 14-segment bar — 14 distinct daily ticks, the 15th rolls
              into steady-state. Each segment lights up to its phase color
              once `warmupDay` reaches it, and pulses on the current day. */}
          <div
            className="flex items-stretch gap-px h-3"
            style={{ background: 'var(--rule)', padding: 1, borderRadius: 2 }}
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={15}
            aria-valuenow={Math.min(warmupDay, 15)}
            aria-label={`Warmup day ${Math.min(warmupDay, 15)} of 15`}
          >
            {Array.from({ length: 14 }).map((_, i) => {
              const day = i + 1;
              const reached = warmupDay >= day;
              const isCurrent = warmupDay === day;
              const cellPhase = getWarmupPhase(day);
              return (
                <div
                  key={day}
                  className="flex-1"
                  style={{
                    background: reached ? cellPhase.bg : 'var(--paper-lift)',
                    transition: 'background 240ms ease',
                    boxShadow: isCurrent
                      ? `inset 0 0 0 1px ${cellPhase.color}`
                      : undefined,
                  }}
                  title={`Day ${day} · ${cellPhase.labelEn}`}
                />
              );
            })}
            {/* steady-state cap segment */}
            <div
              className="w-2"
              style={{
                background:
                  warmupDay >= 15
                    ? WARMUP_PHASES[4].bg
                    : 'var(--paper-lift)',
                borderRight:
                  warmupDay >= 15
                    ? `1px solid ${WARMUP_PHASES[4].color}`
                    : undefined,
              }}
              title="Day 15+ · Steady state"
            />
          </div>

          {/* Outbound mini-stat */}
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <span
              className="text-[10px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
              dir="ltr"
            >
              Outbound · 7d
            </span>
            <span
              className="tabular text-sm font-medium"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
              }}
              dir="ltr"
            >
              {(data?.outbound_last_7d ?? 0).toLocaleString('en-US')}
            </span>
          </div>
        </div>
      )}

      {/* Footer — instance ID + logout */}
      <div
        className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderTop: '1px solid var(--rule-soft)' }}
      >
        <span
          className="text-[10px] tabular truncate"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.04em',
            maxWidth: '20rem',
          }}
          dir="ltr"
          title={instance}
        >
          INSTANCE · {instance}
        </span>
        {state !== 'banned' && (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="text-[11px] inline-flex items-center gap-1.5 transition-colors hover:opacity-100"
            style={{
              color: 'var(--ink-faint)',
              opacity: 0.7,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <LogOut className="w-3 h-3" />
            <span>تسجيل الخروج</span>
          </button>
        )}
      </div>

      {/* Confirm-logout overlay */}
      <AnimatePresence>
        {confirmLogout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            style={{
              background: 'color-mix(in srgb, var(--ink) 55%, transparent)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmLogout(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[400px] p-6"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: '4px',
                boxShadow:
                  '0 18px 50px -20px color-mix(in srgb, var(--ink) 30%, transparent)',
              }}
            >
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-9 h-9 shrink-0 inline-flex items-center justify-center"
                  style={{
                    background: 'var(--warn-soft)',
                    border:
                      '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
                    borderRadius: '3px',
                  }}
                >
                  <AlertOctagon
                    className="w-4 h-4"
                    style={{ color: 'var(--warn)' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <h3
                    id="logout-confirm-title"
                    className="text-sm font-medium"
                    style={{ color: 'var(--ink)' }}
                    dir="rtl"
                  >
                    تسجيل الخروج من Evolution؟
                  </h3>
                  <p
                    className="text-[12px] mt-1.5 leading-relaxed"
                    style={{ color: 'var(--ink-soft)' }}
                    dir="rtl"
                  >
                    سيتوقّف البوت عن الردّ تلقائياً حتى تربط الجهاز من جديد عبر
                    مسح رمز QR. لن تُفقد المحادثات السابقة.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmLogout(false)}
                  disabled={logoutBusy}
                  className="btn-ghost h-9 px-4 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={doLogout}
                  disabled={logoutBusy}
                  className="inline-flex items-center justify-center gap-2 h-9 px-4 text-xs font-medium"
                  style={{
                    background: 'var(--signal)',
                    color: 'var(--paper)',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    opacity: logoutBusy ? 0.6 : 1,
                  }}
                >
                  {logoutBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>تأكيد الخروج</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface DotMeta {
  color: string;
  labelAr: string;
  labelEn: string;
}
const STATE_DOT: Record<InstanceState, DotMeta> = {
  connected: {
    color: 'var(--primary-glow)',
    labelAr: 'متّصل',
    labelEn: 'Connected',
  },
  disconnected: {
    color: 'var(--warn)',
    labelAr: 'غير متّصل',
    labelEn: 'Disconnected',
  },
  banned: {
    color: 'var(--signal)',
    labelAr: 'محظور — يحتاج رقم جديد',
    labelEn: 'Banned — needs new number',
  },
  qr_pending: {
    color: '#3a82f7',
    labelAr: 'في انتظار المسح',
    labelEn: 'Awaiting scan',
  },
  unknown: {
    color: 'var(--ink-faint)',
    labelAr: 'حالة غير معروفة',
    labelEn: 'Unknown',
  },
};

