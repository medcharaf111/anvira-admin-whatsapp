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
  // NEW (Fix 3) — Evolution reported `state=open` within
  // STALE_THRESHOLD_MS of QR display, which means Baileys auto-resumed
  // a previously-paired device rather than completing a fresh handshake.
  // We pause here to make the operator confirm this is the right number
  // (it usually is, but a stale device hijack would silently bind the
  // wrong WhatsApp account).
  | 'stale_confirm'
  // NEW (Fix 2 admin half) — pair succeeded, now backfilling the DB
  // (instance + token + connected status + audit row) via
  // /api/settings/evolution/sync-after-pair. Brief but blocking so the
  // operator doesn't see a phantom "connected" state before the bot can
  // actually reply.
  | 'syncing'
  // NEW (Fix B2) — backend returned 409 `owner_jid_mismatch` from
  // sync-after-pair: the QR was scanned from a WhatsApp account whose
  // primary number doesn't match the tenant's registered wa_number.
  // We auto-abandon the contradictory pairing (so the DB is clean) and
  // then surface a two-CTA recovery panel: Retry-with-registered or
  // Switch-registered-to-scanned (the latter is destructive — gated by
  // a typed-digits confirmation, same pattern as change-number-modal).
  | 'recovery_owner_mismatch'
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
   * The whatsapp:+E164 (or +E164) number being paired. Passed to
   * /api/settings/evolution/sync-after-pair so the backend can
   * re-derive the expected instance slug and verify ownerJid against
   * this number. Optional only because the parent may not have it
   * resolved yet on mount — if it's null when `state=open` arrives,
   * sync is skipped and we fall back to the legacy "rely on next
   * outbound resolve" behaviour (degrades cleanly, no broken flow).
   */
  waNumber?: string | null;
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
// Fix 3 — stale-device detection threshold. Baileys auto-resume from a
// still-linked device returns `state=open` within ~200-800ms in field
// traces, whereas a fresh QR scan + WhatsApp handshake takes 3-8s.
// 2000ms sits comfortably in the gap. Configurable via the public env
// var for ops tuning without a code redeploy.
const STALE_THRESHOLD_MS = Number(
  process.env.NEXT_PUBLIC_QR_STALE_THRESHOLD_MS ?? 2_000
);
// F1: cap auto-re-provision attempts per modal lifetime so a permanently
// broken backend can't loop the operator into an infinite re-provision
// storm. Resets on fresh modal open + on successful post-pair sync.
const QR_REFRESH_MAX_ATTEMPTS = 3;

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
  waNumber = null,
  resumeInstance = null,
  onConnected,
}: QrScanModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [instance, setInstance] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(SCAN_BUDGET_MS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Fix B2 — when sync-after-pair returns 409 owner_jid_mismatch we
  // surface both the wa_number the operator THOUGHT they were pairing
  // (the registered number on this tenant) and the wa_number Evolution
  // actually saw on the scanned account. The backend's 409 body returns
  // both as `detail: { registered_wa_number, scanned_wa_number }`. We
  // fall back to the waNumber prop for registered when the backend
  // hasn't populated the detail object yet (graceful degrade).
  const [registeredWaNumber, setRegisteredWaNumber] = useState<string | null>(
    null
  );
  const [scannedWaNumber, setScannedWaNumber] = useState<string | null>(null);
  // Fix B2 — typed-confirmation gate for the [Switch registered to
  // scanned] CTA. We require the operator to retype the last 4 digits
  // of the scanned number (the destructive side). Mirrors the gate in
  // change-number-modal so the operator can't reflexively click their
  // way into re-keying the tenant's primary number on a wrong scan.
  const [switchTypedDigits, setSwitchTypedDigits] = useState<string>('');
  const [switchSubmitting, setSwitchSubmitting] = useState<boolean>(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // Fix 3 — timestamp the moment `state=open` could possibly arrive
  // (i.e. when we first display the QR or hand off to resume). We can't
  // rely on `phase === 'qr_pending'` alone because state setters are
  // async; an explicit ref pegs the wall-clock instant.
  const qrDisplayedAtRef = useRef<number | null>(null);

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
  // F1: dedupe re-entrant onError calls (browsers fire onError multiple
  // times per failed <img> load) and cap total re-provisions per modal
  // lifetime. Both reset on fresh modal open + post-pair sync success.
  const qrRefreshInFlightRef = useRef(false);
  const qrRefreshAttemptsRef = useRef(0);
  // F2: read the current phase from inside the polling interval without
  // re-spawning the interval on every phase transition (the polling
  // useCallback only depends on stable helpers). Kept in sync via the
  // phase useEffect below.
  const phaseRef = useRef<Phase>('idle');
  // F1+F2: stable ref to reprovisionFresh so the polling callback (which
  // is defined before createInstance/reprovisionFresh) can invoke the
  // latest version without forcing a forward declaration. Assigned in a
  // useEffect below.
  const reprovisionFreshRef = useRef<(() => Promise<void>) | null>(null);

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
    setRegisteredWaNumber(null);
    setScannedWaNumber(null);
    setSwitchTypedDigits('');
    setSwitchSubmitting(false);
    setSwitchError(null);
    qrDisplayedAtRef.current = null;
    // F1: clear the auto-re-provision dedupe + attempts counter on every
    // transient reset (fresh modal open, retry CTA, stale-cancel path).
    qrRefreshInFlightRef.current = false;
    qrRefreshAttemptsRef.current = 0;
  }, [stopAllTimers]);

  // Fix 2 admin half — backfill the DB row (instance + token + status)
  // after Evolution reports the pair as live. Defined as a callback
  // because it's invoked from two places (the normal slow-path
  // `connected` branch and the `stale_confirm` accept path).
  const runPostPairSync = useCallback(
    async (instanceName: string) => {
      setPhase('syncing');
      // If the parent didn't pass a wa_number (legacy callsite or race),
      // skip the sync and behave the way the modal did before this fix —
      // the next outbound resolve will eventually pick up the instance
      // via the resolver cache TTL. We do NOT block the success UX on a
      // missing prop; the operator paired successfully.
      if (!waNumber) {
        setPhase('connected');
        // F1: clear auto-re-provision counter on the legacy success path too.
        qrRefreshAttemptsRef.current = 0;
        onConnected?.(instanceName);
        setTimeout(() => onClose(), SUCCESS_HOLD_MS);
        return;
      }
      try {
        const res = await fetch('/api/settings/evolution/sync-after-pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instance_name: instanceName,
            wa_number: waNumber,
          }),
        });
        if (!res.ok) {
          // Backend uses `detail` for two shapes: a freeform string (most
          // errors) OR a nested object for 409 owner_jid_mismatch:
          //   { error: 'owner_jid_mismatch',
          //     detail: { registered_wa_number, scanned_wa_number } }
          // We have to type both arms because the recovery panel needs
          // the structured numbers, while the generic error display only
          // wants a flat string.
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?:
              | string
              | {
                  registered_wa_number?: string;
                  scanned_wa_number?: string;
                }
              | null;
          };
          // Fix B2 — 409 owner_jid_mismatch is recoverable, not an
          // error. Route it through the recovery panel: auto-call
          // abandon-pair (so the DB is already clean when the broker
          // sees the CTAs), capture both numbers for display, then
          // switch the phase.
          if (res.status === 409 && body.error === 'owner_jid_mismatch') {
            const detailObj =
              body.detail && typeof body.detail === 'object'
                ? body.detail
                : null;
            // Backend SHOULD return both — fall back to `waNumber` prop
            // for registered (we know what we sent) and to a placeholder
            // for scanned if the backend hasn't extended the detail
            // shape yet (graceful degrade, broker still sees a useful
            // recovery panel even on an under-extended backend).
            const registered =
              detailObj?.registered_wa_number ?? waNumber ?? null;
            const scanned = detailObj?.scanned_wa_number ?? null;
            setRegisteredWaNumber(registered);
            setScannedWaNumber(scanned);
            // Fire-and-await the abandon so the DB is consistent BEFORE
            // we show the recovery CTAs. If abandon fails we still show
            // the panel — the operator's retry CTA will surface the
            // remaining inconsistency through a fresh 409, and a
            // re-abandon will fire from this same branch on the next
            // attempt (idempotent).
            try {
              await fetch('/api/settings/whatsapp/abandon-pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  wa_number: registered,
                  recovery_reason: 'owner_jid_mismatch',
                }),
              });
            } catch {
              // Best-effort. The recovery panel itself is the next
              // affordance — we don't want a network blip on the
              // abandon call to deny the broker their recovery CTAs.
            }
            setPhase('recovery_owner_mismatch');
            return;
          }
          // Surface the most specific signal we have. Backend distinguishes
          // `instance_name_mismatch`,
          // `evolution_token_missing_from_fetchInstances`, etc — relay
          // verbatim so the operator can take an informed retry path.
          // For the structured 409 case above we never reach here.
          const detailStr =
            typeof body.detail === 'string' ? body.detail : null;
          setErrorMsg(detailStr ?? body.error ?? `sync_${res.status}`);
          setPhase('error');
          return;
        }
        setPhase('connected');
        // F1: successful pair means any prior auto-re-provision attempts
        // are no longer relevant — clear the counter so a subsequent
        // session in the same modal lifetime starts fresh.
        qrRefreshAttemptsRef.current = 0;
        onConnected?.(instanceName);
        setTimeout(() => onClose(), SUCCESS_HOLD_MS);
      } catch {
        // Network failure after a successful pair is recoverable —
        // the operator can retry sync via the next QR open, and the
        // resolver cache will eventually pick up the orphan token
        // anyway. Show an actionable error rather than pretending
        // everything's fine.
        setErrorMsg('sync_network_error');
        setPhase('error');
      }
    },
    [waNumber, onConnected, onClose]
  );

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
          // F2: 404 instance_not_found — the Evolution row is gone
          // (admin abandoned, daemon GC, etc). Don't silently swallow:
          // route through the F1 re-provision path under the same
          // attempts cap so we recover without an infinite re-create
          // loop on a permanently broken backend.
          if (res.status === 404) {
            stopAllTimers();
            if (qrRefreshInFlightRef.current) return;
            if (qrRefreshAttemptsRef.current >= QR_REFRESH_MAX_ATTEMPTS) {
              setPhase('error');
              setErrorMsg('instance_gone_max_retries');
              return;
            }
            qrRefreshInFlightRef.current = true;
            try {
              await reprovisionFreshRef.current?.();
            } finally {
              qrRefreshInFlightRef.current = false;
            }
            return;
          }
          if (!res.ok) return;
          const json = (await res.json()) as StateResponse;
          // F2: banned is terminal — lifecycle.ts never downgrades banned
          // back to anything else, so polling further is pure churn.
          // Distinct copy from the generic error path so the operator
          // doesn't waste time retrying.
          if (json.state === 'banned') {
            stopAllTimers();
            setPhase('error');
            setErrorMsg('instance_banned');
            return;
          }
          // F2: disconnected after qr_pending implies the scan attempt
          // collapsed the session (e.g. operator scanned, WhatsApp
          // rejected, Baileys dropped to disconnected). Bail with a
          // distinct error so the next retry kicks off a fresh QR
          // rather than continuing to poll a dead session.
          if (
            json.state === 'disconnected' &&
            phaseRef.current === 'qr_pending'
          ) {
            stopAllTimers();
            setPhase('error');
            setErrorMsg('disconnected_after_qr');
            return;
          }
          if (json.state === 'connected') {
            stopAllTimers();
            // Fix 3 — distinguish a fresh-scan handshake from a Baileys
            // auto-resume of a stale-but-still-linked device. If the
            // `state=open` arrives suspiciously fast (< STALE_THRESHOLD_MS
            // after the QR became visible), the device almost certainly
            // didn't get scanned — it just reconnected from its cached
            // session. Pause for operator confirmation before binding
            // (and before the sync write) so we don't silently attach
            // the wrong WhatsApp account.
            const qrAt = qrDisplayedAtRef.current;
            const elapsedSinceQr =
              qrAt === null ? Number.POSITIVE_INFINITY : Date.now() - qrAt;
            if (elapsedSinceQr < STALE_THRESHOLD_MS) {
              setPhase('stale_confirm');
              return;
            }
            // Fresh handshake — proceed straight into the DB backfill,
            // then on to the success view + auto-close. runPostPairSync
            // owns the phase transitions from here.
            void runPostPairSync(instanceName);
          }
        } catch {
          // Network blip — keep polling, the next tick will recover.
        }
      }, POLL_INTERVAL_MS);
    },
    [runPostPairSync, stopAllTimers]
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
    // F1: clear any stale qrUrl so an in-flight <img> can't fire onError
    // against the previous (now-gone) instance and trigger a re-entrant
    // re-provision.
    setQrUrl(null);
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
      // F3: tenant already paired (409 already_provisioned + state=connected
      // + null qr_fetch_url) — skip qr_pending entirely and jump straight
      // to the sync handoff. runPostPairSync already dispatches into
      // 'syncing' → 'connected' (auto-close) or 'recovery_owner_mismatch'
      // (existing e4500fa recovery panel) so no new UI work is needed.
      // Idempotent: instance names are deterministic from (slug, wa_number),
      // so a re-provision triggered by F1 or F2 against an already-paired
      // tenant returns the same 409 shape and re-enters F3 cleanly.
      if (json.state === 'connected' && !json.qr_fetch_url) {
        setInstance(instanceName);
        void runPostPairSync(instanceName);
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
  }, [numberId, startPolling, runPostPairSync]);

  // F1: thin wrapper around createInstance that bumps the auto-re-provision
  // attempts counter before calling. Kept as a separate callback so F1
  // (img onError) and F2 (state-poll 404) both share the same dedupe +
  // cap path without duplicating the increment logic. Caller is responsible
  // for the in-flight gate (qrRefreshInFlightRef) and the cap check.
  const reprovisionFresh = useCallback(async () => {
    qrRefreshAttemptsRef.current += 1;
    setQrUrl(null);
    await createInstance();
  }, [createInstance]);

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

  // Fix 3 — stale-confirm "نعم — تابع": operator vouched that the
  // auto-resumed session is the correct number, so proceed with the
  // DB backfill exactly the way a fresh handshake would.
  const onStaleConfirmYes = useCallback(() => {
    if (!instance) {
      setErrorMsg('missing_instance_after_stale');
      setPhase('error');
      return;
    }
    void runPostPairSync(instance);
  }, [instance, runPostPairSync]);

  // Fix 3 — stale-confirm "إلغاء — أعد المحاولة": operator wants to
  // re-pair from scratch. Best-effort unlink to free the auto-resumed
  // session on Evolution's side, then re-provision (which yields a
  // fresh QR). Swallow the unlink failure — worst case is an orphan
  // instance, which idempotency in the backend handles cleanly on the
  // next attempt.
  const onStaleConfirmCancel = useCallback(async () => {
    if (waNumber) {
      try {
        await fetch('/api/settings/evolution/unlink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wa_number: waNumber }),
        });
      } catch {
        // Best-effort — see comment above.
      }
    }
    // Reset transient state and kick off a brand-new provision; this
    // routes back through `creating` → `qr_pending`, including a fresh
    // qrDisplayedAt timestamp so a subsequent rapid `state=open` will
    // be detected as stale again (and we'll re-loop) rather than
    // silently binding the wrong number.
    resetTransient();
    void createInstance();
  }, [waNumber, resetTransient, createInstance]);

  // Fix B2 — recovery panel CTA 1: "أعد المحاولة بالرقم المسجل". The
  // backend already cleaned the contradictory pairing in the auto-abandon
  // we fired when we entered recovery_owner_mismatch, so a clean retry
  // is just resetTransient + a fresh ack/provision cycle (same path a
  // fresh modal open would take). The numberId is unchanged so the new
  // instance binds to the same client_numbers row.
  const onRecoveryRetryRegistered = useCallback(() => {
    resetTransient();
    void startAck();
  }, [resetTransient, startAck]);

  // Fix B2 — recovery panel CTA 2: "غيّر الرقم المسجل إلى ...". The
  // destructive side: re-keys the tenant's primary wa_number to the
  // scanned number (via the existing change-number endpoint), then
  // onSuccess closes the modal so the parent can re-open the pair flow
  // with the new registered number pre-populated. Gated behind a typed-
  // digits confirmation (same pattern as change-number-modal) so a
  // reflexive click can't accidentally re-key the tenant on a wrong
  // scan.
  const onRecoverySwitchRegistered = useCallback(async () => {
    if (!scannedWaNumber) {
      setSwitchError('missing_scanned_number');
      return;
    }
    setSwitchSubmitting(true);
    setSwitchError(null);
    try {
      const res = await fetch('/api/settings/whatsapp/change-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_wa_number: scannedWaNumber }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        new_wa_number?: string;
      };
      if (!res.ok) {
        setSwitchError(body.error ?? `change_${res.status}`);
        setSwitchSubmitting(false);
        return;
      }
      // Hand the new wa_number to the parent. The parent's onConnected
      // callback is the bridge to re-opening the pair flow with the new
      // registered number — same contract as the connected branch, except
      // we pass the wa_number INSTEAD of an instance name. The parent is
      // expected to re-open this modal with `waNumber` set to the new
      // number.
      onConnected?.(scannedWaNumber);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setSwitchError(`network_error:${msg}`);
      setSwitchSubmitting(false);
    }
  }, [scannedWaNumber, onConnected, onClose]);

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

  // Fix 3 — peg the QR-displayed-at timestamp whenever we enter the
  // qr_pending phase, and clear it when we leave (unless we leave for
  // the stale_confirm sub-step, which still needs the original
  // timestamp for diagnostic logging if we surface it later).
  useEffect(() => {
    if (phase === 'qr_pending') {
      qrDisplayedAtRef.current = Date.now();
    } else if (phase !== 'stale_confirm') {
      qrDisplayedAtRef.current = null;
    }
    // F2: mirror phase into a ref so the polling interval can branch
    // on the current phase without depending on it (which would force
    // a re-spawn on every phase transition and orphan in-flight fetches).
    phaseRef.current = phase;
  }, [phase]);

  // F1+F2: keep the reprovisionFresh ref pointed at the latest callback
  // identity so the polling interval (defined before createInstance) can
  // invoke it without a forward declaration. createInstance's identity
  // changes when numberId/startPolling/runPostPairSync change; this
  // effect keeps the ref aligned.
  useEffect(() => {
    reprovisionFreshRef.current = reprovisionFresh;
  }, [reprovisionFresh]);

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

  // Esc to close — but only when we're not mid-success, mid-sync,
  // mid-stale-confirm, or mid-switch (recovery panel while a destructive
  // change-number is in flight). Yanking the modal during `syncing`
  // would orphan the Evolution session vs the DB row; during
  // `stale_confirm` it would swallow the operator's confirmation
  // decision; mid-switch could leave the change-number request half-
  // resolved on the backend without the broker seeing the outcome.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (
        e.key === 'Escape' &&
        phase !== 'connected' &&
        phase !== 'syncing' &&
        phase !== 'stale_confirm' &&
        !(phase === 'recovery_owner_mismatch' && switchSubmitting)
      ) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, switchSubmitting, onClose]);

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
          // Click-out closes — unless we're mid-success, mid-sync,
          // mid-stale-confirm, or mid-switch (see Esc handler above for
          // rationale).
          if (
            e.target === e.currentTarget &&
            phase !== 'connected' &&
            phase !== 'syncing' &&
            phase !== 'stale_confirm' &&
            !(phase === 'recovery_owner_mismatch' && switchSubmitting)
          ) {
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
              onClick={() => {
                if (
                  phase !== 'connected' &&
                  phase !== 'syncing' &&
                  phase !== 'stale_confirm' &&
                  !(phase === 'recovery_owner_mismatch' && switchSubmitting)
                ) {
                  onClose();
                }
              }}
              disabled={
                phase === 'connected' ||
                phase === 'syncing' ||
                phase === 'stale_confirm' ||
                (phase === 'recovery_owner_mismatch' && switchSubmitting)
              }
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
                        // F1: auto-recover when the QR <img> fails to load
                        // (stale instance, 410 expired, transient blip).
                        // Dedupe re-entrant onError fires via the in-flight
                        // ref; cap absolute re-provisions at
                        // QR_REFRESH_MAX_ATTEMPTS so a broken backend can't
                        // loop forever.
                        onError={async () => {
                          if (!qrUrl) return; // empty src (post-reset) — ignore
                          if (qrRefreshInFlightRef.current) return;
                          if (
                            qrRefreshAttemptsRef.current >=
                            QR_REFRESH_MAX_ATTEMPTS
                          ) {
                            stopAllTimers();
                            setPhase('error');
                            setErrorMsg('qr_unavailable_retry_later');
                            return;
                          }
                          qrRefreshInFlightRef.current = true;
                          try {
                            // HEAD probe to classify: 404 = instance gone
                            // (re-provision), null = transient network
                            // (show retry CTA, no loop), other = expired
                            // or unknown (just bump cache-buster).
                            const probe = await fetch(
                              `/api/evolution/instances/${encodeURIComponent(
                                instance ?? ''
                              )}/qr`,
                              { method: 'HEAD', cache: 'no-store' }
                            ).catch(() => null);

                            if (probe && probe.status === 404) {
                              stopAllTimers();
                              await reprovisionFreshRef.current?.();
                            } else if (!probe) {
                              stopAllTimers();
                              setPhase('error');
                              setErrorMsg('qr_refresh_needed_transient');
                            } else {
                              // 410 expired / other non-404 — just bump
                              // the cache-buster on qrUrl and let the
                              // <img> reload from the same instance.
                              if (instance) {
                                setQrUrl(
                                  `/api/evolution/instances/${encodeURIComponent(
                                    instance
                                  )}/qr?t=${Date.now()}`
                                );
                              }
                            }
                          } finally {
                            qrRefreshInFlightRef.current = false;
                          }
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

              {phase === 'stale_confirm' && (
                <motion.div
                  key="stale-confirm"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="py-6 flex flex-col gap-4"
                  dir="rtl"
                  role="alertdialog"
                  aria-live="assertive"
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
                      تم اكتشاف جهاز سابق مرتبط
                    </h3>
                  </div>
                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    هل أنت متأكد أن هذا الرقم هو الصحيح؟
                  </p>
                  <p
                    className="text-[11px] leading-relaxed"
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    (يمكن أن يحدث هذا إذا لم يتم فصل الجهاز السابق من إعدادات
                    واتساب)
                  </p>
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={onStaleConfirmYes}
                      className="btn-primary h-10 px-5 text-[13px]"
                    >
                      نعم — تابع
                    </button>
                    <button
                      type="button"
                      onClick={() => void onStaleConfirmCancel()}
                      className="inline-flex items-center gap-2 h-10 px-5 text-[13px] font-medium"
                      style={{
                        background: 'var(--paper-sink)',
                        color: 'var(--ink-soft)',
                        border: '1px solid var(--rule)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      إلغاء — أعد المحاولة
                    </button>
                  </div>
                </motion.div>
              )}

              {phase === 'syncing' && (
                <motion.div
                  key="syncing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="py-12 flex flex-col items-center gap-4"
                  role="status"
                  aria-live="polite"
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
                    جاري حفظ الربط…
                  </p>
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

              {phase === 'recovery_owner_mismatch' && (
                <motion.div
                  key="recovery-owner-mismatch"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="py-4 flex flex-col gap-4"
                  dir="rtl"
                  role="alertdialog"
                  aria-live="assertive"
                >
                  {/* Header — same visual weight as stale_confirm so
                      the operator immediately reads this as a
                      recoverable mismatch, not a generic error. */}
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className="w-5 h-5"
                      style={{ color: 'var(--warn)' }}
                    />
                    <h3
                      className="text-sm font-medium"
                      style={{ color: 'var(--ink)' }}
                    >
                      يبدو أنك مسحت من حساب واتساب غير المسجل
                    </h3>
                  </div>

                  <p
                    className="text-[13px] leading-relaxed"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    اخترنا تنظيف الجلسة المتعارضة تلقائياً. اختر إحدى
                    الطريقتين أدناه للمتابعة.
                  </p>

                  {/* Numbers block — registered + scanned side by side
                      so the operator can spot the difference at a
                      glance. Both rendered LTR + monospace because
                      E.164 numbers are not RTL text. */}
                  <div
                    className="p-3 flex flex-col gap-2"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span
                        className="text-[11px]"
                        style={{ color: 'var(--ink-soft)' }}
                      >
                        الرقم المسجل:
                      </span>
                      <span
                        className="text-sm tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink)',
                          letterSpacing: '0.02em',
                        }}
                        dir="ltr"
                      >
                        {registeredWaNumber ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span
                        className="text-[11px]"
                        style={{ color: 'var(--ink-soft)' }}
                      >
                        الرقم الذي مسحت به:
                      </span>
                      <span
                        className="text-sm tabular"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--warn)',
                          letterSpacing: '0.02em',
                        }}
                        dir="ltr"
                      >
                        {scannedWaNumber ?? '—'}
                      </span>
                    </div>
                  </div>

                  {/* CTA 1 — non-destructive retry. No confirmation
                      gate; this just re-opens the QR for the same
                      registered number. */}
                  <button
                    type="button"
                    onClick={onRecoveryRetryRegistered}
                    disabled={switchSubmitting}
                    className="btn-primary h-10 px-5 text-[13px] disabled:opacity-40"
                  >
                    أعد المحاولة بالرقم المسجل
                  </button>

                  {/* CTA 2 — destructive: re-keys the tenant. Gated by
                      typed-confirmation on the last 4 digits of the
                      SCANNED number. Pattern mirrors change-number-
                      modal so the operator's muscle memory transfers
                      across surfaces. */}
                  {scannedWaNumber && (
                    <div
                      className="mt-2 p-3 flex flex-col gap-2"
                      style={{
                        background: 'var(--signal-soft)',
                        border:
                          '1px solid color-mix(in srgb, var(--signal) 30%, transparent)',
                        borderRadius: '3px',
                      }}
                    >
                      <p
                        className="text-[11px] leading-relaxed"
                        style={{ color: 'var(--signal)' }}
                      >
                        لتغيير الرقم المسجل إلى الرقم الذي مسحت به،
                        اكتب آخر{' '}
                        <strong style={{ fontWeight: 600 }}>4</strong>{' '}
                        أرقام منه (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.04em',
                          }}
                          dir="ltr"
                        >
                          …{scannedWaNumber.replace(/\D/g, '').slice(-4)}
                        </span>
                        ):
                      </p>
                      <input
                        type="text"
                        value={switchTypedDigits}
                        onChange={(e) =>
                          setSwitchTypedDigits(
                            e.target.value.replace(/\D/g, '')
                          )
                        }
                        disabled={switchSubmitting}
                        maxLength={4}
                        className="w-full h-10 px-3 text-sm tabular"
                        style={{
                          background: 'var(--paper)',
                          border: '1px solid var(--rule)',
                          borderRadius: '3px',
                          color: 'var(--ink)',
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.04em',
                        }}
                        dir="ltr"
                        placeholder="0000"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => void onRecoverySwitchRegistered()}
                        disabled={
                          switchSubmitting ||
                          switchTypedDigits.length !== 4 ||
                          switchTypedDigits !==
                            scannedWaNumber.replace(/\D/g, '').slice(-4)
                        }
                        className="btn-signal inline-flex items-center justify-center gap-2 h-10 px-5 text-[13px] disabled:opacity-40"
                      >
                        {switchSubmitting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>…جارٍ</span>
                          </>
                        ) : (
                          <span>
                            غيّر الرقم المسجل إلى{' '}
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.02em',
                              }}
                              dir="ltr"
                            >
                              {scannedWaNumber}
                            </span>
                          </span>
                        )}
                      </button>
                      {switchError && (
                        <p
                          className="text-[10px] tabular"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--signal)',
                            letterSpacing: '0.04em',
                          }}
                          dir="ltr"
                        >
                          {switchError}
                        </p>
                      )}
                    </div>
                  )}
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
                      {/* Distinguish a post-pair sync failure from a
                          pre-pair provisioning failure — the operator's
                          next action is different (retry vs. reach out). */}
                      {errorMsg && errorMsg.startsWith('sync_')
                        ? 'فشل حفظ الربط — يرجى المحاولة مرة أخرى'
                        : 'تعذّر إنشاء الجلسة'}
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

