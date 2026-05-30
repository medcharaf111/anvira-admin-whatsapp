'use client';

// ----------------------------------------------------------------------------
// PLATFORM_ADMIN_PLAN.md Phase 2 §5.3 — ChangeTierModal
//
// Modal surface for the platform-admin's "change tenant tier" action. Eight
// stacked sections (header, tier select, status select, downgrade chip,
// features-lost list, AML retention disclosure, reason textarea + counter,
// typed-acknowledgement, footer). Posts to
//   POST /api/platform-admin/tenants/[id]/tier
// with an Idempotency-Key derived from sha256(tenant_id|to_tier|to_status|
// reason) so an accidental double-click hands the server an identical key
// and the server replays the cached response instead of re-applying.
//
// Verbatim strings (Arabic disclosure + English mirror + ACK_PHRASE) are
// legally load-bearing per UAE Federal Decree-Law No. 10 of 2025. Do not
// paraphrase. The ACK_PHRASE constant is the SINGLE source of truth shared
// with the server-side validator — see src/lib/platform-admin/constants.ts.
//
// Animation timing mirrors the QR scan modal (backdrop 180ms fade, card
// 280ms scale+y with the project's standard [0.22, 1, 0.36, 1] easing).
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import {
  FEATURE_MIN_TIER,
  TIER_RANK,
  type SubscriptionTier,
  type TierFeature,
} from '@/lib/tier-gates';
import type { SubscriptionStatus } from '@/lib/platform-admin/tenants-query';
import { ACK_PHRASE } from '@/lib/platform-admin/constants';
import type {
  TenantDetail,
  ChangeTierRequest,
  ChangeTierResponse,
  ChangeTierErrorResponse,
} from '@/lib/platform-admin/tenant-detail-types';

// ─────────────────────────────────────────────────────────────────────────────
// Enum option lists — keep aligned with the DB enums + tier-gates parity copy.
// ─────────────────────────────────────────────────────────────────────────────
const TIERS: SubscriptionTier[] = [
  'pilot',
  'team',
  'brokerage',
  'enterprise',
  'grandfather',
  'suspended',
];
const STATUSES: SubscriptionStatus[] = [
  'pilot',
  'trialing',
  'active',
  'past_due',
  'suspended',
  'cancelled',
];

const TIER_LABEL_AR: Record<SubscriptionTier, string> = {
  pilot: 'تجريبي',
  team: 'الفريق',
  brokerage: 'الوساطة',
  enterprise: 'المؤسسات',
  grandfather: 'موروثة',
  suspended: 'موقوفة',
};
const STATUS_LABEL_AR: Record<SubscriptionStatus, string> = {
  pilot: 'تجريبي',
  trialing: 'تجربة مجانية',
  active: 'نشطة',
  past_due: 'متأخر السداد',
  suspended: 'موقوفة',
  cancelled: 'ملغاة',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper — features that the tenant LOSES moving from one tier to
// another. Empty array for upgrades / equal-rank moves. Mirrors the helper
// added to tier-gates.ts by Deliverable 3 — kept inline here so the modal
// doesn't have to await an Implementer-B-shipped utility before it can
// preview features-lost interactively.
// ─────────────────────────────────────────────────────────────────────────────
function featuresLostBetween(
  fromTier: SubscriptionTier,
  toTier: SubscriptionTier,
): TierFeature[] {
  if (TIER_RANK[toTier] >= TIER_RANK[fromTier]) return [];
  return (Object.entries(FEATURE_MIN_TIER) as [TierFeature, SubscriptionTier][])
    .filter(([, minTier]) => {
      const fromAllows = TIER_RANK[fromTier] >= TIER_RANK[minTier];
      const toAllows = TIER_RANK[toTier] >= TIER_RANK[minTier];
      return fromAllows && !toAllows;
    })
    .map(([feature]) => feature);
}

// ─────────────────────────────────────────────────────────────────────────────
// SubtleCrypto sha256 → lowercase hex. Browser-native, no dependency.
// Used to derive a deterministic Idempotency-Key for the POST request.
// ─────────────────────────────────────────────────────────────────────────────
async function deriveIdempotencyKey(
  tenantId: string,
  toTier: SubscriptionTier,
  toStatus: SubscriptionStatus,
  reason: string,
): Promise<string> {
  const seed = `${tenantId}|${toTier}|${toStatus}|${reason}`;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(seed));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Server error → Arabic UX message. Mirrors the contract documented in the
// Deliv 3 route — keep the codes here in sync.
// ─────────────────────────────────────────────────────────────────────────────
function errorMessageFor(
  code: string | undefined,
  allowed?: string[],
): string | null {
  switch (code) {
    case 'reason_too_short':
      return 'السبب يجب أن يكون ١٢ حرف على الأقل.';
    case 'acknowledgement_required':
      return 'يجب كتابة عبارة التأكيد للتخفيض حرفياً.';
    case 'invalid_transition':
      return `الانتقال غير مسموح. الانتقالات المسموحة: ${
        (allowed ?? []).join(', ') || '—'
      }`;
    case 'admin_client_not_found':
      return 'المستأجِر غير موجود.';
    case 'admin_not_super_admin':
      return 'الصلاحية غير كافية.';
    case 'admin_invalid_tier':
      return 'باقة غير صحيحة.';
    case 'admin_invalid_status':
      return 'حالة غير صحيحة.';
    case 'idempotency_key_conflict':
      return 'تم تنفيذ طلب مختلف بنفس المفتاح — أعد المحاولة بعد لحظة.';
    case 'invalid_json':
      return 'فشل في قراءة الطلب.';
    case 'rpc_failed':
      return 'فشلت العملية على الخادم.';
    case 'db_error':
      return 'خطأ في قاعدة البيانات.';
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export interface ChangeTierModalProps {
  tenant: TenantDetail;
  open: boolean;
  onClose: () => void;
  /** Fired after the server returns ok:true. The parent typically refreshes
   *  the tenant detail view so the timeline + chips reflect the new state. */
  onSuccess?: (response: ChangeTierResponse) => void;
}

export function ChangeTierModal({
  tenant,
  open,
  onClose,
  onSuccess,
}: ChangeTierModalProps) {
  // Form state — resets whenever the modal opens against a (potentially
  // different) tenant. We seed the selects with the tenant's current values
  // so the operator sees "no-op until I change something".
  const [toTier, setToTier] = useState<SubscriptionTier>(
    tenant.subscription_tier,
  );
  const [toStatus, setToStatus] = useState<SubscriptionStatus>(
    tenant.subscription_status,
  );
  const [reason, setReason] = useState('');
  const [ackText, setAckText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close OR on tenant identity change. Watching subscription_tier
  // alone wouldn't refresh if the operator opens the same tenant twice in a
  // row after one mutation.
  useEffect(() => {
    if (!open) {
      setToTier(tenant.subscription_tier);
      setToStatus(tenant.subscription_status);
      setReason('');
      setAckText('');
      setError(null);
      setSaving(false);
    }
  }, [open, tenant.id, tenant.subscription_tier, tenant.subscription_status]);

  // Esc to close — never while saving (don't let the operator yank a request
  // mid-flight and end up wondering whether it landed).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  // Live FEATURE_MIN_TIER diff — recomputed on every tier change so the
  // "what the tenant loses" panel updates as the operator scrolls through
  // the dropdown.
  const featuresLost: TierFeature[] = useMemo(
    () => featuresLostBetween(tenant.subscription_tier, toTier),
    [tenant.subscription_tier, toTier],
  );

  // Downgrade = strictly lower TIER_RANK OR moving to the sticky-lockout
  // 'suspended' tier (which has rank -1 so this is captured by the strict
  // comparison, but we keep the explicit check for read clarity).
  const isDowngrade =
    TIER_RANK[toTier] < TIER_RANK[tenant.subscription_tier] ||
    toTier === 'suspended';

  const reasonTrimmed = reason.trim();
  const reasonOk = reasonTrimmed.length >= 12;
  const ackOk = !isDowngrade || ackText === ACK_PHRASE;
  const tierChanged =
    toTier !== tenant.subscription_tier ||
    toStatus !== tenant.subscription_status;
  const canSubmit = reasonOk && ackOk && tierChanged && !saving;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      const idemKey = await deriveIdempotencyKey(
        tenant.id,
        toTier,
        toStatus,
        reasonTrimmed,
      );

      const body: ChangeTierRequest = {
        to_tier: toTier,
        to_status: toStatus,
        reason: reasonTrimmed,
        ...(isDowngrade ? { acknowledged_text: ackText } : {}),
      };

      const res = await fetch(
        `/api/platform-admin/tenants/${encodeURIComponent(tenant.id)}/tier`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idemKey,
          },
          body: JSON.stringify(body),
        },
      );

      const json = (await res.json().catch(() => ({}))) as
        | ChangeTierResponse
        | ChangeTierErrorResponse
        | Record<string, never>;

      if (!res.ok || (json as ChangeTierErrorResponse).ok === false) {
        const err = json as ChangeTierErrorResponse;
        const msg =
          err.message ??
          errorMessageFor(err.error, err.allowed_transitions) ??
          `فشل: ${err.error ?? `http_${res.status}`}`;
        setError(msg);
        return;
      }

      onSuccess?.(json as ChangeTierResponse);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      setError(`خطأ في الاتصال: ${msg}`);
    } finally {
      setSaving(false);
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
          if (e.target === e.currentTarget && !saving) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-tier-title"
      >
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl"
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
              <div className="eyebrow mb-2">TIER CHANGE · تغيير الباقة</div>
              <h2
                id="change-tier-title"
                className="display-ar text-2xl"
                style={{ color: 'var(--ink)' }}
              >
                تغيير باقة المستأجِر
              </h2>
              <div
                className="text-xs mt-1 truncate"
                style={{ color: 'var(--ink-soft)' }}
              >
                {tenant.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="w-8 h-8 inline-flex items-center justify-center transition-colors disabled:opacity-30 shrink-0"
              style={{ color: 'var(--ink-faint)' }}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-7 py-6">
            {/* Section 2 — Tier + Status selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <Field label="الباقة الجديدة · New tier">
                <select
                  value={toTier}
                  onChange={(e) => setToTier(e.target.value as SubscriptionTier)}
                  className="w-full h-10 px-3 text-sm"
                  style={{
                    background: 'var(--paper)',
                    border: '1px solid var(--rule)',
                    borderRadius: '3px',
                    color: 'var(--ink)',
                  }}
                  disabled={saving}
                  dir="ltr"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL_AR[t]} ({t})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الحالة الجديدة · New status">
                <select
                  value={toStatus}
                  onChange={(e) =>
                    setToStatus(e.target.value as SubscriptionStatus)
                  }
                  className="w-full h-10 px-3 text-sm"
                  style={{
                    background: 'var(--paper)',
                    border: '1px solid var(--rule)',
                    borderRadius: '3px',
                    color: 'var(--ink)',
                  }}
                  disabled={saving}
                  dir="ltr"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL_AR[s]} ({s})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Section 3 — Downgrade chip */}
            {isDowngrade && (
              <div
                className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--warn-soft)',
                  color: 'var(--warn)',
                  border:
                    '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
                  borderRadius: '999px',
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>تخفيض · DOWNGRADE</span>
              </div>
            )}

            {/* Section 4 — Features lost */}
            <div
              className="mb-5 p-4"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '4px',
              }}
            >
              <div
                className="text-xs mb-2"
                style={{ color: 'var(--ink-soft)' }}
              >
                ما الذي سيفقده المستأجِر · What the tenant loses
              </div>
              {featuresLost.length === 0 ? (
                <div
                  className="text-sm"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  لا تتغير الميزات المتاحة · No features change
                </div>
              ) : (
                <ul
                  className="text-sm space-y-1"
                  style={{ color: 'var(--ink)' }}
                >
                  {featuresLost.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ background: 'var(--signal)' }}
                      />
                      <span
                        dir="ltr"
                        className="font-mono text-xs"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--ink)',
                        }}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Section 5 — Verbatim AML retention disclosure
              *
              * The Arabic + English paragraphs below are LEGALLY LOAD-BEARING
              * under UAE Federal Decree-Law No. 10 of 2025. Copy-pasted from
              * the design plan §2.1. Do not paraphrase, re-flow, or edit.
              */}
            <div
              className="mb-5 p-4"
              style={{
                background: 'var(--paper-sink)',
                border:
                  '1px solid color-mix(in srgb, var(--warn) 50%, var(--rule))',
                borderRadius: '4px',
              }}
            >
              <div
                className="text-xs mb-3 flex items-center gap-1.5"
                style={{ color: 'var(--warn)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  ما يبقى ملزماً للمستأجِر (المرسوم ١٠/٢٠٢٥) · What the tenant
                  retains
                </span>
              </div>
              <p
                className="text-sm leading-relaxed mb-3"
                style={{ color: 'var(--ink)' }}
                dir="rtl"
              >
                بموجب المرسوم الاتحادي رقم ١٠ لسنة ٢٠٢٥، يظل المستأجِر مسؤولاً
                عن التزاماته المتعلقة بمكافحة غسل الأموال وتمويل الإرهاب
                وتمويل انتشار التسلح بصرف النظر عن باقة الاشتراك. تغيير الباقة
                لا يُعفي المستأجِر من واجب العناية الواجبة بالعملاء (CDD)، ولا
                من الإبلاغ عن المعاملات المشبوهة (STR/SAR) عبر منصة goAML، ولا
                من الاحتفاظ بسجلات لمدة لا تقل عن خمس سنوات. إذا انتقل
                المستأجِر إلى باقة لا تتضمن أدوات الامتثال المُدمجة، فعليه
                توفير ضوابط بديلة على نفقته الخاصة.
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="ltr"
              >
                Under UAE Federal Decree-Law No. 10 of 2025, the tenant remains
                responsible for their AML/CFT/CPF obligations regardless of
                subscription tier. Changing the tier does not relieve the
                tenant of Customer Due Diligence (CDD) duties, of
                suspicious-transaction reporting (STR/SAR) via the goAML
                portal, or of record-retention obligations of no less than
                five years. If the tenant moves to a tier that does not
                include the integrated compliance tooling, the tenant must
                arrange equivalent controls at their own cost.
              </p>
            </div>

            {/* Section 6 — Reason textarea + counter */}
            <Field label="السبب (إلزامي، ١٢ حرف على الأقل) · Reason (required, 12 chars min)">
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 text-sm"
                style={{
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                  color: 'var(--ink)',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
                dir="rtl"
              />
              <div
                className="text-xs mt-1 tabular"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: reasonOk ? 'var(--ink-soft)' : 'var(--signal)',
                }}
                dir="ltr"
              >
                {reasonOk
                  ? `${reasonTrimmed.length} حرف`
                  : `${reasonTrimmed.length}/12 حرف`}
              </div>
            </Field>

            {/* Section 7 — Typed-acknowledgement (downgrades only) */}
            {isDowngrade && (
              <div className="mt-4">
                <Field label="لتأكيد التخفيض، اكتب العبارة التالية حرفياً (بالإنجليزية):">
                  <div
                    className="text-xs p-3 mb-2 select-all"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule)',
                      borderRadius: '3px',
                      color: 'var(--ink-soft)',
                      fontFamily: 'var(--font-mono)',
                    }}
                    dir="ltr"
                  >
                    {ACK_PHRASE}
                  </div>
                  <input
                    type="text"
                    value={ackText}
                    onChange={(e) => setAckText(e.target.value)}
                    disabled={saving}
                    className="w-full h-10 px-3 text-sm"
                    style={{
                      background: 'var(--paper)',
                      border: `1px solid ${
                        ackText && !ackOk ? 'var(--signal)' : 'var(--rule)'
                      }`,
                      borderRadius: '3px',
                      color: 'var(--ink)',
                      fontFamily: 'var(--font-mono)',
                    }}
                    dir="ltr"
                    placeholder="Type the phrase verbatim…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {ackText && !ackOk && (
                    <div
                      className="text-xs mt-1"
                      style={{ color: 'var(--signal)' }}
                    >
                      العبارة غير مطابقة حرفياً
                    </div>
                  )}
                </Field>
              </div>
            )}

            {/* Inline error from the server */}
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
              >
                {error}
              </div>
            )}
          </div>

          {/* Section 8 — Footer */}
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
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="btn-ghost h-10 px-5 text-sm"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="btn-primary h-10 px-5 text-sm inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>تأكيد التغيير · Confirm change</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Field wrapper — bilingual label above a control with the
// platform-admin's standard spacing + ink-soft caption color.
// ─────────────────────────────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-xs mb-1.5"
        style={{ color: 'var(--ink-soft)' }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
