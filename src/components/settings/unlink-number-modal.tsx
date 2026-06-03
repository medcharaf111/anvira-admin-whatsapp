'use client';

// ----------------------------------------------------------------------------
// UnlinkNumberModal — destructive confirmation surface for severing the
// Evolution-instance ↔ WhatsApp-number binding on a tenant.
//
// UX shape (design §2.b / §3):
//   1. Header                  — bilingual eyebrow + display-ar title
//   2. Warning callout         — verbatim Arabic, --signal-soft background
//   3. Linked-number block     — wa_number rendered LTR in monospace
//   4. Active-conversation     — "{N} محادثات نشطة في آخر ٧ أيام", "—" if null
//   5. Typed-confirmation      — exact match of "إلغاء الربط" (RTL input)
//   6. Footer                  — btn-ghost cancel + btn-signal destructive
//
// Animation timing mirrors ChangeTierModal (backdrop 180ms fade, card 280ms
// scale+y on the project standard [0.22, 1, 0.36, 1] easing) so destructive
// surfaces feel consistent across admin areas.
//
// Submit POSTs to /api/settings/evolution/unlink (Implementer B). Success
// closes via onSuccess so the parent can collapse the panel; error keeps
// the modal open and surfaces an inline retry hint.
// ----------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';

// The verbatim phrase the operator must type to unlock the destructive
// action. Kept as a module constant so it appears only ONCE in the source
// — the displayed strong-text label and the input comparison both read it
// from here, preventing accidental drift.
const CONFIRMATION_PHRASE = 'إلغاء الربط';

export interface UnlinkNumberModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after the server returns 200 — parent typically collapses the
   *  WhatsApp panel and triggers router.refresh() to re-pull the
   *  authoritative "no transport linked" state from the server. */
  onSuccess: () => void;
  /** Tenant's WhatsApp number being unlinked. Displayed LTR in monospace. */
  waNumber: string;
  /** 7-day active-conversation count from /api/settings/evolution/active-count.
   *  `null` while the parent is still fetching — rendered as "—". */
  activeCount: number | null;
  /** Passed through for future analytics/audit hooks; not used in the
   *  body since the unlink route resolves the tenant from the session. */
  clientId: string;
}

export function UnlinkNumberModal({
  open,
  onClose,
  onSuccess,
  waNumber,
  activeCount,
  // clientId is intentionally accepted for future telemetry hooks; the
  // backend resolves tenant identity from the cookie session, so we
  // don't include it in the POST body.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientId,
}: UnlinkNumberModalProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state whenever the modal closes so the next open
  // starts from a clean slate. We don't blank it on open because the
  // parent controls mount/unmount via the `open` prop.
  useEffect(() => {
    if (!open) {
      setTyped('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Esc to close — disabled while a request is in flight to avoid
  // leaving the operator wondering whether their click landed.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  const canConfirm = typed.trim() === CONFIRMATION_PHRASE && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/settings/evolution/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_number: waNumber }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string | null;
        ok?: boolean;
      };
      if (!res.ok || payload.ok === false) {
        setError(payload.error ?? 'unknown_error');
        return;
      }
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setError(`connection_error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

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
          if (e.target === e.currentTarget && !submitting) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlink-number-title"
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-lg"
          style={{
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: '4px',
            boxShadow:
              '0 20px 60px -20px color-mix(in srgb, var(--ink) 30%, transparent), 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent)',
            maxHeight: '90dvh',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          {/* Section 1 — Header */}
          <div
            className="px-7 py-5 flex items-start justify-between"
            style={{ borderBottom: '1px solid var(--rule-soft)' }}
          >
            <div className="min-w-0">
              <div className="eyebrow mb-2" dir="ltr">
                UNLINK NUMBER · إلغاء الربط
              </div>
              <h2
                id="unlink-number-title"
                className="display-ar text-2xl"
                style={{ color: 'var(--ink)' }}
              >
                إلغاء ربط رقم واتساب
              </h2>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="w-8 h-8 inline-flex items-center justify-center transition-colors disabled:opacity-30 shrink-0"
              style={{ color: 'var(--ink-faint)' }}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-7 py-6">
            {/* Section 2 — Verbatim Arabic warning callout
              *
              * Copy below is taken VERBATIM from the design spec §3 and is
              * load-bearing for the destructive UX contract. Do not
              * paraphrase, re-flow line breaks, or translate. */}
            <div
              className="mb-5 p-4 leading-relaxed"
              style={{
                background: 'var(--signal-soft)',
                border:
                  '1px solid color-mix(in srgb, var(--signal) 35%, transparent)',
                borderRadius: '3px',
                color: 'var(--signal)',
              }}
              dir="rtl"
            >
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle
                  className="w-4 h-4 shrink-0 mt-0.5"
                  strokeWidth={1.5}
                />
                <div>
                  هذا الإجراء يوقف استقبال الرسائل على الرقم فوراً.
                  <br />
                  المحادثات القائمة ستبقى محفوظة، لكن لن يردّ المساعد على
                  أي عميل جديد حتى تربط رقماً آخر.
                </div>
              </div>
            </div>

            {/* Section 3 — Linked-number block */}
            <div
              className="mb-2 flex items-baseline justify-between flex-wrap gap-2"
              dir="rtl"
            >
              <span
                className="text-xs"
                style={{ color: 'var(--ink-soft)' }}
              >
                الرقم:
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
                {waNumber}
              </span>
            </div>

            {/* Section 4 — Active-conversation line */}
            <p
              className="text-xs mb-5 tabular"
              style={{
                color: 'var(--ink-faint)',
                fontFamily: 'var(--font-mono)',
              }}
              dir="rtl"
            >
              {activeCount === null
                ? '—'
                : `${activeCount.toLocaleString('ar-EG')} محادثات نشطة في آخر ٧ أيام`}
            </p>

            {/* Section 5 — Typed-confirmation gate */}
            <label className="block">
              <span
                className="block text-xs mb-2 leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="rtl"
              >
                للتأكيد، اكتب العبارة:{' '}
                <strong
                  style={{
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  {CONFIRMATION_PHRASE}
                </strong>
              </span>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={submitting}
                className="w-full h-10 px-3 text-sm"
                style={{
                  background: 'var(--paper-sink)',
                  border: `1px solid ${
                    typed && !canConfirm && !submitting
                      ? 'var(--signal)'
                      : 'var(--rule)'
                  }`,
                  borderRadius: '3px',
                  color: 'var(--ink)',
                }}
                dir="rtl"
                placeholder={CONFIRMATION_PHRASE}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {/* Inline error from the server — modal stays open so the
              * operator can retry without losing typed state. */}
            {error && (
              <div
                className="text-xs p-3 mt-4 leading-relaxed"
                style={{
                  background: 'var(--signal-soft)',
                  border:
                    '1px solid color-mix(in srgb, var(--signal) 40%, transparent)',
                  color: 'var(--signal)',
                  borderRadius: '3px',
                }}
                role="alert"
                aria-live="polite"
                dir="rtl"
              >
                تعذّر إلغاء الربط. حاول مرة أخرى.
              </div>
            )}
          </div>

          {/* Section 6 — Footer */}
          <div
            className="px-7 py-4 flex items-center justify-end gap-2"
            style={{
              background: 'var(--paper-sink)',
              borderTop: '1px solid var(--rule-soft)',
              borderBottomLeftRadius: '4px',
              borderBottomRightRadius: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="btn-ghost"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
              className="btn-signal inline-flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>…جارٍ</span>
                </>
              ) : (
                <span>تأكيد إلغاء الربط</span>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
