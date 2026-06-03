'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  QrCode,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';

type Phase =
  | 'idle'
  | 'ack'
  | 'creating'
  | 'qr_pending'
  | 'connected'
  | 'expired'
  | 'error';

interface CreateResponse {
  // Backend returns `instance_name`; older callers read `instance`. Accept
  // both so a backend field-name rename doesn't crash the modal.
  instance?: string;
  instance_name?: string;
  qr_fetch_url?: string;
  already_provisioned?: boolean;
  state?: 'qr_pending' | 'connected' | 'disconnected' | 'banned';
  error?: string;
}

interface StateResponse {
  provisioned?: boolean;
  state?: 'qr_pending' | 'connected' | 'disconnected' | 'banned';
  error?: string;
}

interface QrScanModalProps {
  open: boolean;
  onClose: () => void;
  /** Primary branch_number row id to bind the new Evolution instance to. */
  numberId: string | null;
  /**
   * Optional pre-existing instance to resume scanning for. Skips the
   * creation step and jumps straight to QR display. Used by the
   * "Resume scan" CTA on the instance panel when the previous session
   * timed out.
   */
  resumeInstance?: string | null;
  onConnected?: (instance: string) => void;
}

// QR rotation budget — WhatsApp's QR expires every ~60s but the backend
// rotates earlier. We cap the total scan window at 5 minutes so we don't
// poll forever if the operator walks away.
const SCAN_BUDGET_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2_000;
const SUCCESS_HOLD_MS = 2_000;
// Item 16 — minimum dwell on the ban-risk disclosure before the operator can
// proceed. Forces a real read, not a reflexive click-through.
const ACK_ENABLE_SEC = 20;

/**
 * QR scan modal — the pilot's onboarding heart.
 *
 * State machine:
 *   idle → creating → qr_pending → connected → (auto-close)
 *                                  → expired (user can retry)
 *                                  → error   (user can retry)
 *
 * We keep all transient state in this component; the parent only knows
 * about `open` / `numberId` / `onConnected`. Polling/timers are torn
 * down on close or unmount.
 */
export function QrScanModal({
  open,
  onClose,
  numberId,
  resumeInstance = null,
  onConnected,
}: QrScanModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [instance, setInstance] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(SCAN_BUDGET_MS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Item 16 — ban-risk acknowledgement gate. Before provisioning a fresh
  // instance the operator must affirm the unofficial-WhatsApp ban-risk
  // disclosure: read the exact text, tick the checkbox, and wait out a ~20s
  // enable delay. The server is the real enforcement; this is the UX.
  const [ackText, setAckText] = useState<{ version: string; text_ar: string } | null>(null);
  const [ackChecked, setAckChecked] = useState(false);
  const [ackRemainingSec, setAckRemainingSec] = useState(ACK_ENABLE_SEC);

  // Use refs for intervals so we can clean them up reliably across
  // every transition without re-binding on each state change.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAllTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (expiryTimeoutRef.current) clearTimeout(expiryTimeoutRef.current);
    if (ackTimerRef.current) clearInterval(ackTimerRef.current);
    pollRef.current = null;
    countdownRef.current = null;
    expiryTimeoutRef.current = null;
    ackTimerRef.current = null;
  }, []);

  const resetTransient = useCallback(() => {
    stopAllTimers();
    setInstance(null);
    setQrUrl(null);
    setRemainingMs(SCAN_BUDGET_MS);
    setErrorMsg(null);
    setAckText(null);
    setAckChecked(false);
    setAckRemainingSec(ACK_ENABLE_SEC);
  }, [stopAllTimers]);

  // Polling — runs only while `phase === 'qr_pending'`. We pass the
  // instance explicitly because state setters are async and we'd
  // otherwise race the close.
  const startPolling = useCallback(
    (instanceName: string) => {
      stopAllTimers();
      const startedAt = Date.now();

      // Countdown ticks every 1s for the visible timer.
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, SCAN_BUDGET_MS - elapsed);
        setRemainingMs(remaining);
      }, 1_000);

      // Hard cap — if we haven't connected by SCAN_BUDGET_MS we expire.
      expiryTimeoutRef.current = setTimeout(() => {
        stopAllTimers();
        setPhase('expired');
      }, SCAN_BUDGET_MS);

      // Connection poll — 2s cadence, lightweight JSON.
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/evolution/instances/${encodeURIComponent(instanceName)}/state`,
            { cache: 'no-store' }
          );
          if (!res.ok) return;
          const json = (await res.json()) as StateResponse;
          if (json.state === 'connected') {
            stopAllTimers();
            setPhase('connected');
            onConnected?.(instanceName);
            // Auto-close after a short celebration hold.
            setTimeout(() => {
              onClose();
            }, SUCCESS_HOLD_MS);
          }
        } catch {
          // Network blip — keep polling, the next tick will recover.
        }
      }, POLL_INTERVAL_MS);
    },
    [onClose, onConnected, stopAllTimers]
  );

  // Provisioning step — POST /api/evolution/instances and flip to
  // qr_pending when the URL comes back.
  const createInstance = useCallback(async () => {
    if (!numberId) {
      setErrorMsg('لا يوجد رقم أساسي');
      setPhase('error');
      return;
    }
    setPhase('creating');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/evolution/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number_id: numberId }),
      });
      const json = (await res.json().catch(() => ({}))) as CreateResponse;
      // Accept either `instance_name` (canonical backend field) or `instance`
      // (legacy alias). The 409 "already_provisioned" path is treated as
      // success since the existing instance + qr_fetch_url come back too.
      // Backend may signal it as either `already_provisioned: true` (newer
      // shape) or `error: 'already_provisioned'` (deployed shape) — accept
      // both so a future backend refactor doesn't re-break this path.
      const instanceName = json.instance_name ?? json.instance;
      const alreadyProv =
        json.already_provisioned === true || json.error === 'already_provisioned';
      const ok = res.ok || (res.status === 409 && alreadyProv && !!instanceName);
      if (!ok || !instanceName) {
        setErrorMsg(json.error ?? `backend_${res.status}`);
        setPhase('error');
        return;
      }
      setInstance(instanceName);
      // We proxy the QR through our own admin route to enforce session
      // + RE-only gating, regardless of what backend hands us.
      setQrUrl(
        `/api/evolution/instances/${encodeURIComponent(
          instanceName
        )}/qr?t=${Date.now()}`
      );
      setPhase('qr_pending');
      startPolling(instanceName);
    } catch {
      setErrorMsg('network_error');
      setPhase('error');
    }
  }, [numberId, startPolling]);

  // Item 16 — open the ban-risk acknowledgement screen. Fetches the current
  // disclosure (version + exact text) and starts the ~20s enable countdown.
  const startAck = useCallback(async () => {
    stopAllTimers();
    setPhase('ack');
    setAckChecked(false);
    setAckRemainingSec(ACK_ENABLE_SEC);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/evolution/ban-risk-ack', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as { version?: string; text_ar?: string };
        if (json.version && json.text_ar) {
          setAckText({ version: json.version, text_ar: json.text_ar });
        }
      }
    } catch {
      // Leave ackText null — the panel shows a placeholder and the confirm
      // button stays disabled (we can't affirm a disclosure we couldn't load).
    }
    // Tick the enable countdown to 0.
    ackTimerRef.current = setInterval(() => {
      setAckRemainingSec((s) => {
        if (s <= 1) {
          if (ackTimerRef.current) clearInterval(ackTimerRef.current);
          ackTimerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1_000);
  }, [stopAllTimers]);

  // Item 16 — record the acknowledgement, then proceed to provisioning.
  const confirmAck = useCallback(async () => {
    if (!ackText) return;
    try {
      const res = await fetch('/api/evolution/ban-risk-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number_id: numberId, disclosure_version: ackText.version }),
      });
      if (!res.ok) {
        setErrorMsg(`ack_${res.status}`);
        setPhase('error');
        return;
      }
      void createInstance(); // proceeds to 'creating' → QR
    } catch {
      setErrorMsg('network_error');
      setPhase('error');
    }
  }, [ackText, numberId, createInstance]);

  // Open transition — either resume an existing instance (skip
  // provisioning) or create a fresh one.
  useEffect(() => {
    if (!open) {
      resetTransient();
      setPhase('idle');
      return;
    }
    if (resumeInstance) {
      // Resuming an already-provisioned instance — no new ack required (the
      // affirmation happened at first provision).
      setInstance(resumeInstance);
      setQrUrl(
        `/api/evolution/instances/${encodeURIComponent(
          resumeInstance
        )}/qr?t=${Date.now()}`
      );
      setPhase('qr_pending');
      startPolling(resumeInstance);
    } else {
      // Fresh provision — gate behind the ban-risk acknowledgement screen.
      void startAck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      stopAllTimers();
    };
  }, [stopAllTimers]);

  // Periodically refresh the QR <img> so we pick up backend rotations
  // without forcing the operator to refresh. ~25s cadence keeps under
  // the 60s expiry, but doesn't hammer the proxy.
  useEffect(() => {
    if (phase !== 'qr_pending' || !instance) return;
    const id = setInterval(() => {
      setQrUrl(
        `/api/evolution/instances/${encodeURIComponent(
          instance
        )}/qr?t=${Date.now()}`
      );
    }, 25_000);
    return () => clearInterval(id);
  }, [phase, instance]);

  // Esc to close — but only when we're not mid-success (don't yank
  // the confirmation away from the operator).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'connected') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  function handleRetry() {
    resetTransient();
    void createInstance();
  }

  if (!open) return null;

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1_000);
  const countdown = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{
          background: 'color-mix(in srgb, var(--ink) 55%, transparent)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={(e) => {
          // Click-out closes — unless we're mid-success.
          if (e.target === e.currentTarget && phase !== 'connected') {
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scan-title"
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[480px]"
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            boxShadow:
              '0 20px 60px -20px color-mix(in srgb, var(--ink) 30%, transparent), 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent)',
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-5 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--rule-soft)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 inline-flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--paper-sink)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                }}
              >
                <QrCode
                  className="w-4 h-4"
                  strokeWidth={1.5}
                  style={{ color: 'var(--primary-glow)' }}
                />
              </div>
              <div className="min-w-0">
                <h2
                  id="qr-scan-title"
                  className="text-base font-medium leading-tight"
                  style={{ color: 'var(--ink)' }}
                  dir="rtl"
                >
                  ربط رقم واتساب
                </h2>
                <p
                  className="text-[10px] tracking-widest uppercase mt-1"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                  }}
                  dir="ltr"
                >
                  QR · امسح من جوّالك
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => phase !== 'connected' && onClose()}
              disabled={phase === 'connected'}
              className="w-8 h-8 inline-flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ color: 'var(--ink-faint)' }}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <AnimatePresence mode="wait">
              {phase === 'ack' && (
                <motion.div
                  key="ack"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-6 flex flex-col gap-4"
                  dir="rtl"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className="w-5 h-5"
                      style={{ color: 'var(--warn)' }}
                    />
                    <h3
                      className="text-sm font-medium"
                      style={{ color: 'var(--ink)' }}
                    >
                      إقرار مخاطر الربط المباشر بواتساب
                    </h3>
                  </div>
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    {ackText?.text_ar ?? '…'}
                  </p>
                  <label
                    className="flex items-start gap-2 text-[13px]"
                    style={{ color: 'var(--ink)' }}
                  >
                    <input
                      type="checkbox"
                      checked={ackChecked}
                      onChange={(e) => setAckChecked(e.target.checked)}
                    />
                    <span>
                      أُقرّ بأنني قرأت وفهمت مخاطر حظر الرقم وأتحمّل المسؤولية.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!ackText || !ackChecked || ackRemainingSec > 0}
                    onClick={() => void confirmAck()}
                    className="btn-primary h-10 px-5 disabled:opacity-40"
                  >
                    {ackRemainingSec > 0
                      ? `أتابع خلال ${ackRemainingSec}s`
                      : 'أتابع إلى ربط الرقم'}
                  </button>
                </motion.div>
              )}

              {phase === 'creating' && (
                <motion.div
                  key="creating"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-12 flex flex-col items-center gap-4"
                >
                  <Loader2
                    className="w-6 h-6 animate-spin"
                    style={{ color: 'var(--primary-glow)' }}
                  />
                  <p
                    className="text-sm"
                    style={{ color: 'var(--ink-soft)' }}
                    dir="rtl"
                  >
                    جارٍ تهيئة الاتصال…
                  </p>
                </motion.div>
              )}

              {phase === 'qr_pending' && (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28 }}
                >
                  {/* Step-by-step instructions */}
                  <ol
                    className="space-y-2 mb-5"
                    style={{ color: 'var(--ink-soft)' }}
                    dir="rtl"
                  >
                    <Step n="1" label="افتح واتساب على جوّالك" />
                    <Step n="2" label="الإعدادات ← الأجهزة المرتبطة" />
                    <Step n="3" label="اضغط «ربط جهاز جديد»" />
                    <Step n="4" label="امسح الرمز أدناه" />
                  </ol>

                  {/* QR — gold-bordered tile centered in a calm frame */}
                  <div className="flex justify-center">
                    <div
                      className="p-2"
                      style={{
                        background: '#ffffff',
                        border:
                          '8px solid color-mix(in srgb, var(--warn) 60%, var(--paper))',
                        borderRadius: '4px',
                        boxShadow:
                          '0 8px 32px -12px color-mix(in srgb, var(--warn) 35%, transparent)',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl ?? ''}
                        alt="WhatsApp QR code — scan from your phone"
                        width={300}
                        height={300}
                        style={{
                          width: 300,
                          height: 300,
                          display: 'block',
                          imageRendering: 'pixelated',
                        }}
                      />
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="mt-5 flex flex-col items-center gap-1.5">
                    <span
                      className="text-[10px] tracking-widest uppercase"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-faint)',
                      }}
                      dir="ltr"
                    >
                      ينتهي خلال · expires in
                    </span>
                    <span
                      className="tabular text-2xl font-medium"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color:
                          remainingMs < 60_000
                            ? 'var(--signal)'
                            : 'var(--ink)',
                        letterSpacing: '0.05em',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      dir="ltr"
                    >
                      {countdown}
                    </span>
                  </div>

                  {/* Hidden polling indicator — announced to AT only */}
                  <span
                    className="sr-only"
                    aria-live="polite"
                    role="status"
                  >
                    في انتظار اتصال الجهاز…
                  </span>
                </motion.div>
              )}

              {phase === 'connected' && (
                <motion.div
                  key="connected"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="py-10 flex flex-col items-center gap-4 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <motion.div
                    initial={{ scale: 0.5, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      duration: 0.45,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                    className="w-14 h-14 inline-flex items-center justify-center"
                    style={{
                      background:
                        'color-mix(in srgb, var(--primary-glow) 18%, var(--paper-lift))',
                      border:
                        '1px solid color-mix(in srgb, var(--primary-glow) 40%, transparent)',
                      borderRadius: '999px',
                    }}
                  >
                    <CheckCircle2
                      className="w-7 h-7"
                      strokeWidth={1.5}
                      style={{ color: 'var(--primary-glow)' }}
                    />
                  </motion.div>
                  <div>
                    <p
                      className="text-base font-medium"
                      style={{ color: 'var(--ink)' }}
                      dir="rtl"
                    >
                      تم الربط بنجاح
                    </p>
                    <p
                      className="text-xs mt-1.5 max-w-[28ch] mx-auto"
                      style={{ color: 'var(--ink-soft)' }}
                      dir="rtl"
                    >
                      الرقم متّصل · البوت جاهز للردّ على رسائل هذا المكتب.
                    </p>
                  </div>
                </motion.div>
              )}

              {phase === 'expired' && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="py-8 flex flex-col items-center gap-4 text-center"
                >
                  <div
                    className="w-12 h-12 inline-flex items-center justify-center"
                    style={{
                      background: 'var(--warn-soft)',
                      border:
                        '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
                      borderRadius: '999px',
                    }}
                  >
                    <AlertTriangle
                      className="w-5 h-5"
                      strokeWidth={1.5}
                      style={{ color: 'var(--warn)' }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-base font-medium"
                      style={{ color: 'var(--ink)' }}
                      dir="rtl"
                    >
                      انتهت صلاحية الرمز
                    </p>
                    <p
                      className="text-xs mt-1.5 max-w-[34ch]"
                      style={{ color: 'var(--ink-soft)' }}
                      dir="rtl"
                    >
                      لم يتم المسح خلال ٥ دقائق. الرمز ينتهي تلقائياً لأسباب
                      أمنية.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    style={{
                      background: 'var(--warn)',
                      color: 'var(--paper)',
                      borderRadius: '3px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>إعادة المحاولة</span>
                  </button>
                </motion.div>
              )}

              {phase === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-8 flex flex-col items-center gap-4 text-center"
                >
                  <div
                    className="w-12 h-12 inline-flex items-center justify-center"
                    style={{
                      background: 'var(--signal-soft)',
                      border:
                        '1px solid color-mix(in srgb, var(--signal) 40%, transparent)',
                      borderRadius: '999px',
                    }}
                  >
                    <AlertTriangle
                      className="w-5 h-5"
                      strokeWidth={1.5}
                      style={{ color: 'var(--signal)' }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-base font-medium"
                      style={{ color: 'var(--ink)' }}
                      dir="rtl"
                    >
                      تعذّر إنشاء الجلسة
                    </p>
                    <p
                      className="text-xs mt-1.5 max-w-[36ch]"
                      style={{ color: 'var(--ink-soft)' }}
                      dir="rtl"
                    >
                      حدث خطأ غير متوقّع — حاول مجدداً أو تواصل مع الدعم.
                    </p>
                    {errorMsg && (
                      <p
                        className="text-[10px] mt-2 tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink-faint)',
                          letterSpacing: '0.04em',
                        }}
                        dir="ltr"
                      >
                        {errorMsg}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="btn-primary h-10 px-5 gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>إعادة المحاولة</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer hint — only during qr_pending */}
          {phase === 'qr_pending' && (
            <div
              className="px-6 py-3 flex items-center gap-2"
              style={{
                background: 'var(--paper-sink)',
                borderTop: '1px solid var(--rule-soft)',
                borderBottomLeftRadius: '4px',
                borderBottomRightRadius: '4px',
              }}
            >
              <Smartphone
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--ink-faint)' }}
              />
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--ink-faint)' }}
                dir="rtl"
              >
                استخدم نفس الرقم الذي سجّلته في «أرقام الفروع». ربط رقم آخر
                سيتجاوز إعدادات التوجيه.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <li className="flex items-center gap-3 text-[13px]">
      <span
        className="w-5 h-5 shrink-0 inline-flex items-center justify-center tabular text-[10px]"
        style={{
          fontFamily: 'var(--font-mono)',
          background: 'var(--paper-sink)',
          border: '1px solid var(--rule)',
          color: 'var(--ink-soft)',
          borderRadius: '2px',
          fontWeight: 500,
        }}
      >
        {n}
      </span>
      <span>{label}</span>
    </li>
  );
}

