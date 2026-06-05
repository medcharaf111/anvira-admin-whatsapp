'use client';

// ----------------------------------------------------------------------------
// ChangeNumberModal — confirmation surface for re-keying the WhatsApp number
// bound to a tenant's Evolution instance. Sits between "unlink + re-pair from
// scratch" and "do nothing" — preserves conversation history while swapping
// the upstream Baileys binding.
//
// UX shape (mirrors UnlinkNumberModal §3):
//   1. Header                  — bilingual eyebrow + display-ar title
//   2. Warning callout         — explains the unlink-then-pair sequence
//   3. Current-number block    — wa_number rendered LTR in monospace
//   4. New-number input        — E.164 entry with live regex validation
//   5. Typed-confirmation gate — must retype last 4 digits of NEW number
//                                (distinct from Unlink which types a phrase,
//                                 protects against accidentally re-typing
//                                 the same old number)
//   6. Footer                  — btn-ghost cancel + btn-signal destructive
//
// Animation timing matches UnlinkNumberModal (backdrop 180ms fade, card 280ms
// scale+y on [0.22, 1, 0.36, 1] easing) so destructive surfaces stay visually
// coherent across admin areas.
//
// On 200 → onSuccess(newWaNumber, deterministicInstanceName). Parent uses
// the wa_number to pre-populate the QR pair modal; the instance name is
// informational (the QR modal calls /api/evolution/instances on its own).
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';

// Same E.164 regex the proxy uses server-side. Kept in sync as a module
// constant so a future tightening (e.g. blocking specific country codes)
// only needs to update both places.
const E164_RE = /^\+[1-9]\d{7,14}$/;

// We require typing the last 4 digits of the NEW number rather than a
// fixed phrase. This catches "operator typed the wrong country code"
// situations: if the digits don't match what's in the new-number field,
// neither side can fool the other.
const CONFIRMATION_DIGITS = 4;

// Human-readable Arabic copy for each backend error code. Defaults to a
// generic retry message for unknown codes so the modal never goes blank.
function errorMessageFor(code: string | null, scope?: string | null): string {
  switch (code) {
    case 'collision':
      return scope === 'dashboard_clients'
        ? 'هذا الرقم مسجّل كرقم أساسي لحساب آخر.'
        : 'هذا الرقم مرتبط بحساب آخر بالفعل.';
    case 'e164_invalid':
      return 'صيغة الرقم غير صحيحة. استخدم صيغة دولية مثل +971501234567.';
    case 'same_number_noop':
      return 'الرقم الجديد مطابق للحالي.';
    case 'from_number_not_found':
      return 'الرقم الحالي غير موجود على حسابك. حدّث الصفحة وحاول مرّة أخرى.';
    case 'unlink_failed':
      return 'تعذّر فصل الرقم الحالي. حاول بعد قليل.';
    case 'db_write_failed':
      return 'تعذّر تحديث السجلات. تواصل مع الدعم لمراجعة الحالة.';
    case 'forbidden':
      return 'صلاحيتك لا تسمح بتغيير رقم الحساب.';
    case 'not_real_estate':
      return 'هذا الإجراء متاح لحسابات العقارات فقط حالياً.';
    case 'backend_not_configured':
      return 'الخدمة غير مهيّأة. تواصل مع الدعم.';
    default:
      return 'تعذّر تغيير الرقم. حاول مرّة أخرى.';
  }
}

export interface ChangeNumberModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Fired after the server returns 200. Parent receives the new wa_number
   * (to pre-populate the QR pair modal) and the deterministic instance
   * name (informational — the QR modal recomputes from the slug).
   */
  onSuccess: (newWaNumber: string, deterministicInstanceName: string) => void;
  /** Tenant's CURRENT WhatsApp number. Displayed LTR in monospace. */
  currentWaNumber: string;
  /** Passed through for future analytics/audit hooks; the server resolves
   *  tenant identity from the cookie session, so we don't include it in
   *  the POST body. */
  clientId: string;
}

export function ChangeNumberModal({
  open,
  onClose,
  onSuccess,
  currentWaNumber,
  // clientId is intentionally accepted for future telemetry hooks; the
  // backend resolves tenant identity from the cookie session, so we
  // don't include it in the POST body.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientId,
}: ChangeNumberModalProps) {
  const [newNumber, setNewNumber] = useState('');
  const [typedDigits, setTypedDigits] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorScope, setErrorScope] = useState<string | null>(null);

  // Reset transient state whenever the modal closes so the next open
  // starts from a clean slate. We don't blank on open because the parent
  // controls mount/unmount via the `open` prop.
  useEffect(() => {
    if (!open) {
      setNewNumber('');
      setTypedDigits('');
      setSubmitting(false);
      setError(null);
      setErrorScope(null);
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

  // Derived gates so the render path stays a single boolean per check.
  const trimmedNew = newNumber.trim();
  const e164Valid = useMemo(() => E164_RE.test(trimmedNew), [trimmedNew]);
  const sameAsCurrent = trimmedNew === currentWaNumber.trim();

  // Last N digits of the NEW number — the operator must retype these to
  // unlock the destructive action. Strips the leading `+` and any
  // separators a paste might smuggle in.
  const expectedDigits = useMemo(() => {
    const digitsOnly = trimmedNew.replace(/\D/g, '');
    return digitsOnly.slice(-CONFIRMATION_DIGITS);
  }, [trimmedNew]);

  const digitsMatch =
    expectedDigits.length === CONFIRMATION_DIGITS &&
    typedDigits.trim() === expectedDigits;

  const canConfirm =
    e164Valid && !sameAsCurrent && digitsMatch && !submitting;

  async function handleConfirm() {
    if (!canConfirm) return;
    setError(null);
    setErrorScope(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/settings/whatsapp/change-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_wa_number: trimmedNew }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        scope?: string | null;
        stage?: string | null;
        new_wa_number?: string;
        deterministic_instance_name?: string;
        ok?: boolean;
      };
      if (!res.ok || payload.ok === false) {
        setError(payload.error ?? 'unknown_error');
        setErrorScope(payload.scope ?? null);
        return;
      }
      // Backend returns the canonical new number + deterministic instance
      // name. We forward both — parent uses wa_number to pre-populate the
      // QR modal, instance name is informational/telemetry only.
      onSuccess(
        payload.new_wa_number ?? trimmedNew,
        payload.deterministic_instance_name ?? ''
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setError(`connection_error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  // Border colour for the new-number input — red only after the operator
  // has typed something invalid, so a freshly-opened modal looks neutral.
  const newNumberBorder =
    trimmedNew && !e164Valid && !submitting
      ? 'var(--signal)'
      : sameAsCurrent && trimmedNew
      ? 'var(--signal)'
      : 'var(--rule)';

  // Border colour for the confirmation-digits input — red only after the
  // operator has typed the wrong digits (the field is meaningless before
  // they've entered a valid new number).
  const digitsBorder =
    typedDigits &&
    expectedDigits.length === CONFIRMATION_DIGITS &&
    !digitsMatch &&
    !submitting
      ? 'var(--signal)'
      : 'var(--rule)';

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
        aria-labelledby="change-number-title"
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
                CHANGE NUMBER · تغيير الرقم
              </div>
              <h2
                id="change-number-title"
                className="display-ar text-2xl"
                style={{ color: 'var(--ink)' }}
              >
                تغيير رقم واتساب
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
            {/* Section 2 — Sequence warning callout
              *
              * The operator needs to understand BOTH halves of this
              * operation: (a) the old number gets cleanly unlinked from
              * Evolution, and (b) they'll be walked through pairing the
              * new one immediately after. History is preserved — we say so
              * explicitly because the unlink half tends to spook brokers
              * who fear losing customer threads. */}
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
                  سيتم فصل الرقم الحالي من واتساب أولاً، ثم سنوجّهك لمسح QR
                  للرقم الجديد.
                  <br />
                  المحادثات القائمة ستبقى محفوظة، لكن لن يردّ المساعد حتى
                  يكتمل ربط الرقم الجديد.
                </div>
              </div>
            </div>

            {/* Section 3 — Current-number block */}
            <div
              className="mb-5 flex items-baseline justify-between flex-wrap gap-2"
              dir="rtl"
            >
              <span
                className="text-xs"
                style={{ color: 'var(--ink-soft)' }}
              >
                الرقم الحالي:
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
                {currentWaNumber}
              </span>
            </div>

            {/* Section 4 — New-number input */}
            <label className="block mb-5">
              <span
                className="block text-xs mb-2 leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="rtl"
              >
                الرقم الجديد (صيغة دولية، يبدأ بـ +)
              </span>
              <input
                type="tel"
                value={newNumber}
                onChange={(e) => {
                  setNewNumber(e.target.value);
                  // Clear stale validation error when the operator edits
                  // the number — they're acting on the previous error.
                  if (error) {
                    setError(null);
                    setErrorScope(null);
                  }
                }}
                disabled={submitting}
                className="w-full h-10 px-3 text-sm tabular"
                style={{
                  background: 'var(--paper-sink)',
                  border: `1px solid ${newNumberBorder}`,
                  borderRadius: '3px',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.02em',
                }}
                dir="ltr"
                placeholder="+971501234567"
                inputMode="tel"
                autoComplete="off"
                spellCheck={false}
              />
              {/* Inline validation hints — only after typing starts so a
                * freshly-opened modal isn't immediately scolding. */}
              {trimmedNew && !e164Valid && (
                <span
                  className="block text-[11px] mt-1.5"
                  style={{ color: 'var(--signal)' }}
                  dir="rtl"
                >
                  صيغة E.164 مطلوبة (مثال: +971501234567).
                </span>
              )}
              {trimmedNew && e164Valid && sameAsCurrent && (
                <span
                  className="block text-[11px] mt-1.5"
                  style={{ color: 'var(--signal)' }}
                  dir="rtl"
                >
                  الرقم الجديد لا يمكن أن يطابق الحالي.
                </span>
              )}
            </label>

            {/* Section 5 — Typed-confirmation gate
              *
              * We ask for the last 4 digits of the NEW number (not a
              * fixed phrase) precisely so the operator must look at what
              * they just typed and re-enter the digits that matter. If
              * they accidentally retype the OLD number's digits, the
              * gate stays locked. */}
            <label className="block">
              <span
                className="block text-xs mb-2 leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="rtl"
              >
                للتأكيد، اكتب آخر{' '}
                <strong
                  style={{ color: 'var(--ink)', fontWeight: 600 }}
                >
                  {CONFIRMATION_DIGITS}
                </strong>{' '}
                أرقام من الرقم الجديد
                {expectedDigits.length === CONFIRMATION_DIGITS && (
                  <>
                    {' '}
                    (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--ink-faint)',
                        letterSpacing: '0.04em',
                      }}
                      dir="ltr"
                    >
                      …{expectedDigits}
                    </span>
                    )
                  </>
                )}
                :
              </span>
              <input
                type="text"
                value={typedDigits}
                onChange={(e) => {
                  // Strip everything but digits so a paste of "+...4369"
                  // still resolves to "4369". Avoids the operator
                  // confusion of "I typed it but it won't unlock."
                  setTypedDigits(e.target.value.replace(/\D/g, ''));
                }}
                disabled={submitting || !e164Valid || sameAsCurrent}
                maxLength={CONFIRMATION_DIGITS}
                className="w-full h-10 px-3 text-sm tabular"
                style={{
                  background: 'var(--paper-sink)',
                  border: `1px solid ${digitsBorder}`,
                  borderRadius: '3px',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                }}
                dir="ltr"
                placeholder={'0'.repeat(CONFIRMATION_DIGITS)}
                inputMode="numeric"
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
                {errorMessageFor(error, errorScope)}
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
                <span>تأكيد تغيير الرقم</span>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
