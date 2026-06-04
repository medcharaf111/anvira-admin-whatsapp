'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  MessageCircle,
  ArrowRightLeft,
  Loader2,
  PlugZap,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { Transport } from '@/lib/client';
import { QrScanModal } from './qr-scan-modal';
import { EvolutionInstancePanel } from './evolution-instance-panel';
import { UnlinkNumberModal } from '@/components/settings/unlink-number-modal';

interface WhatsAppTransportPanelProps {
  transport: Transport;
  evolutionInstance: string | null;
  /** Tenant id — passed through to the unlink modal for future
   *  analytics/audit hooks. The server-side unlink route resolves
   *  identity from the session cookie, not this prop. */
  clientId: string;
}

interface BranchNumber {
  id: string;
  wa_number: string;
  label: string | null;
  is_primary: boolean;
}

interface BranchNumbersResponse {
  numbers?: BranchNumber[];
  provisioned?: boolean;
}

interface TransportMeta {
  pillLabel: string;
  pillBg: string;
  pillFg: string;
  pillBorder: string;
  helperAr: string;
  helperEn: string;
  Icon: typeof MessageCircle;
}

const TRANSPORT_META: Record<Transport, TransportMeta> = {
  cloud_api: {
    pillLabel: 'META WABA · قريباً',
    pillBg: 'color-mix(in srgb, var(--warn) 18%, var(--paper-lift))',
    pillFg: 'var(--warn)',
    pillBorder: 'color-mix(in srgb, var(--warn) 35%, transparent)',
    helperAr:
      'WhatsApp Business API الرسمي من Meta · متاح لاحقاً، يتطلّب اعتماد حساب أعمال Meta. سنُعلِمك عند جاهزيّته.',
    helperEn:
      'Official Meta WhatsApp Business API — coming later. Requires a Meta-approved business account; we’ll notify you when it’s available.',
    Icon: ShieldCheck,
  },
  evolution: {
    pillLabel: 'ربط مباشر · جاهز فوراً',
    pillBg: 'color-mix(in srgb, var(--primary-glow) 18%, var(--paper-lift))',
    pillFg: 'var(--primary-glow)',
    pillBorder: 'color-mix(in srgb, var(--primary-glow) 35%, transparent)',
    helperAr:
      'ربط رقم واتساب مباشرةً عبر مسح QR من جوّالك. جاهز خلال دقائق ومتوافق مع PDPL.',
    helperEn:
      'Pair your WhatsApp number directly by scanning a QR from your phone — ready in minutes, PDPL-aware.',
    Icon: PlugZap,
  },
  mock: {
    pillLabel: 'MOCK · DEV',
    pillBg: 'color-mix(in srgb, var(--ink-faint) 18%, var(--paper-lift))',
    pillFg: 'var(--ink-soft)',
    pillBorder: 'var(--rule)',
    helperAr: 'وضع التطوير فقط — لا اتصال حقيقي، لا رسائل تُرسل.',
    helperEn: 'Dev sandbox — no real WhatsApp delivery.',
    Icon: MessageCircle,
  },
};

/**
 * WhatsApp transport panel — RE only, mounted ABOVE BranchNumbersPanel.
 *
 * Transport choice is the most foundational onboarding question for a
 * brokerage ("how does WhatsApp reach my customers?") — once it's set,
 * branch numbers and lead sources hang off of it. We give it the
 * top-of-page real estate accordingly.
 *
 * Switching transports is intentionally narrow:
 *   - cloud_api → evolution: allowed only when zero active convos
 *   - evolution → (next): not exposed; pilot tenants stay on evolution
 *   - mock:                 never settable from the UI
 *
 * We co-locate the EvolutionInstancePanel inside the same editorial
 * card (rather than a sibling) so the operator's mental model is one
 * unified "transport surface" — connection state lives where the
 * transport choice was made.
 */
export function WhatsAppTransportPanel({
  transport,
  evolutionInstance,
  clientId,
}: WhatsAppTransportPanelProps) {
  const router = useRouter();
  const [primaryNumberId, setPrimaryNumberId] = useState<string | null>(null);
  const [primaryWaNumber, setPrimaryWaNumber] = useState<string | null>(null);
  const [activeConvCount, setActiveConvCount] = useState<number | null>(null);
  const [numbersLoading, setNumbersLoading] = useState(true);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [resumeInstance, setResumeInstance] = useState<string | null>(null);
  const [instanceRefreshKey, setInstanceRefreshKey] = useState(0);
  // Unlink modal state — local optimistic flag flips on success so the
  // panel collapses to "no linked number" before router.refresh() lands
  // the authoritative empty state from the server.
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinkActiveCount, setUnlinkActiveCount] = useState<number | null>(
    null
  );
  const [optimisticallyUnlinked, setOptimisticallyUnlinked] =
    useState(false);

  const fetchSidecars = useCallback(async () => {
    try {
      const [bnRes] = await Promise.all([
        fetch('/api/branch-numbers', { cache: 'no-store' }),
      ]);
      if (bnRes.ok) {
        const json = (await bnRes.json()) as BranchNumbersResponse;
        const primary = json.numbers?.find((n) => n.is_primary);
        const chosen = primary ?? json.numbers?.[0];
        setPrimaryNumberId(chosen?.id ?? null);
        setPrimaryWaNumber(chosen?.wa_number ?? null);
      }
    } catch {
      // tolerate transient failures — the panel still renders
    } finally {
      setNumbersLoading(false);
    }
  }, []);

  // Lazy-fetch the 7-day active-conversation count when the unlink
  // modal opens. We don't preload on mount because most operators never
  // open this destructive surface, and the count is only meaningful in
  // the unlink decision context.
  async function openUnlinkModal() {
    setUnlinkActiveCount(null);
    setUnlinkOpen(true);
    if (!primaryWaNumber) return;
    try {
      const res = await fetch(
        `/api/settings/evolution/active-count?wa_number=${encodeURIComponent(
          primaryWaNumber
        )}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const json = (await res.json()) as { count?: number };
        setUnlinkActiveCount(Number(json.count ?? 0));
      } else {
        // Keep null → modal renders "—" so the operator knows we don't
        // have a confident number rather than seeing a misleading 0.
        setUnlinkActiveCount(null);
      }
    } catch {
      setUnlinkActiveCount(null);
    }
  }

  function onUnlinkSuccess() {
    setUnlinkOpen(false);
    setOptimisticallyUnlinked(true);
    // Re-render server components so getCurrentClient picks up the
    // newly cleared evolution_instance + reverted transport.
    router.refresh();
  }

  useEffect(() => {
    void fetchSidecars();
  }, [fetchSidecars]);

  async function switchTransport(target: Transport) {
    setSwitchBusy(true);
    try {
      const res = await fetch('/api/settings/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transport: target }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
      };
      if (res.status === 409) {
        setActiveConvCount(json.count ?? 1);
        toast.error('لا يمكن التبديل مع وجود محادثات نشطة');
        return;
      }
      if (!res.ok) {
        toast.error(`تعذّر التبديل · ${json.error ?? 'unknown'}`);
        return;
      }
      toast.success('تم تحديث وسيلة الاتصال');
      router.refresh();
    } finally {
      setSwitchBusy(false);
    }
  }

  function openQrFresh() {
    setResumeInstance(null);
    setQrOpen(true);
  }

  function openQrResume() {
    setResumeInstance(evolutionInstance);
    setQrOpen(true);
  }

  function onConnected() {
    setInstanceRefreshKey((k) => k + 1);
    // Server-side flag flip happens via backend; we refresh to pick up
    // the new `evolution_instance` on getCurrentClient.
    router.refresh();
  }

  const meta = TRANSPORT_META[transport];
  const TransportIcon = meta.Icon;

  // Decide which CTA to render under the helper text. The optimistic
  // unlink flag forces the panel to behave as if the instance has been
  // detached even before router.refresh() resolves — preventing the
  // operator from seeing the live instance panel for the brief window
  // between the success callback and the server re-render.
  const showSwitchToEvolution = transport === 'cloud_api';
  const showCreateEvolution =
    transport === 'evolution' &&
    (!evolutionInstance || optimisticallyUnlinked);
  const showInstancePanel =
    transport === 'evolution' &&
    !!evolutionInstance &&
    !optimisticallyUnlinked;
  // Show the destructive section only when there's something to
  // disconnect AND we know which wa_number to target.
  const showUnlinkSection = showInstancePanel && !!primaryWaNumber;

  return (
    <section className="mt-12">
      <SectionHeader />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        {/* Top — pill + helpers + action */}
        <div className="px-5 md:px-7 py-6">
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 shrink-0 inline-flex items-center justify-center"
              style={{
                background: 'var(--paper-sink)',
                border: '1px solid var(--rule)',
                borderRadius: '3px',
              }}
            >
              <TransportIcon
                className="w-4 h-4"
                strokeWidth={1.5}
                style={{ color: meta.pillFg }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span
                  className="text-[10px] tracking-widest uppercase"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-faint)',
                    letterSpacing: '0.1em',
                  }}
                  dir="ltr"
                >
                  CURRENT TRANSPORT · وسيلة الاتصال الحالية
                </span>
                <span
                  className="text-[10px] tabular tracking-widest uppercase px-2 py-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: meta.pillBg,
                    color: meta.pillFg,
                    border: `1px solid ${meta.pillBorder}`,
                    borderRadius: '2px',
                    letterSpacing: '0.08em',
                  }}
                  dir="ltr"
                >
                  {meta.pillLabel}
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="rtl"
              >
                {meta.helperAr}
              </p>
              <p
                className="text-[11px] leading-relaxed mt-1.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-faint)',
                  letterSpacing: '0.02em',
                }}
                dir="ltr"
              >
                {meta.helperEn}
              </p>
            </div>
          </div>

          {/* Action row */}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {showSwitchToEvolution && (
              <SwitchToEvolutionCta
                busy={switchBusy}
                hasActiveConvs={
                  activeConvCount !== null && activeConvCount > 0
                }
                onClick={() => void switchTransport('evolution')}
              />
            )}

            {showCreateEvolution && (
              <button
                type="button"
                onClick={openQrFresh}
                disabled={numbersLoading || !primaryNumberId}
                className="btn-primary h-10 px-5 gap-2 text-[13px]"
                title={
                  !primaryNumberId
                    ? 'أضف رقم واتساب أساسياً أولاً'
                    : undefined
                }
              >
                {numbersLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlugZap className="w-3.5 h-3.5" />
                )}
                <span>ربط رقم واتساب</span>
              </button>
            )}

            {showCreateEvolution && !primaryNumberId && !numbersLoading && (
              <div
                className="flex items-center gap-2 text-[11px]"
                style={{ color: 'var(--ink-faint)' }}
                dir="rtl"
              >
                <AlertCircle className="w-3 h-3" />
                <span>أضف رقم واتساب أساسياً من القسم أدناه أولاً.</span>
              </div>
            )}

            {/* Mock — informational only, no CTA */}
            {transport === 'mock' && (
              <p
                className="text-[11px]"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-faint)',
                  letterSpacing: '0.04em',
                }}
                dir="ltr"
              >
                Switch to a live transport via support to leave dev mode.
              </p>
            )}
          </div>
        </div>

        {/* Instance panel — only when on Evolution AND provisioned */}
        <AnimatePresence>
          {showInstancePanel && evolutionInstance && (
            <motion.div
              key="instance"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-5 md:px-7 pb-6">
                <EvolutionInstancePanel
                  instance={evolutionInstance}
                  onResumeScan={openQrResume}
                  refreshKey={instanceRefreshKey}
                />

                {/* Unlink section — a deliberate secondary surface kept
                  * BELOW the live instance panel so it never competes
                  * with the day-to-day operational chrome (warmup bar,
                  * connection dot, logout link). Only renders when we
                  * have a wa_number to target. */}
                {showUnlinkSection && (
                  <div
                    className="mt-5 px-5 py-4"
                    style={{
                      background: 'var(--paper-sink)',
                      border: '1px solid var(--rule-soft)',
                      borderRadius: '3px',
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <h4
                          className="text-sm font-medium mb-1"
                          style={{ color: 'var(--ink)' }}
                          dir="rtl"
                        >
                          إلغاء الربط
                        </h4>
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: 'var(--ink-soft)' }}
                          dir="rtl"
                        >
                          إذا أردت تغيير الرقم أو إيقاف الخدمة على هذا الرقم
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void openUnlinkModal()}
                        className="inline-flex items-center justify-center h-9 px-4 text-xs"
                        style={{
                          background: 'transparent',
                          color: 'var(--signal)',
                          border:
                            '1px solid color-mix(in srgb, var(--signal) 35%, var(--rule))',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          transition: 'background 0.18s ease',
                        }}
                      >
                        إلغاء الربط
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed post-unlink state — shown when the operator just
          * detached the only number OR when the tenant arrives on
          * Evolution with no provisioned instance yet. Provides a clear
          * recovery path to onboarding so they aren't left wondering
          * where to re-link. */}
        {transport === 'evolution' &&
          (optimisticallyUnlinked || !evolutionInstance) && (
            <div
              className="mx-5 md:mx-7 mb-6 px-4 py-3"
              style={{
                background: 'var(--paper-sink)',
                borderRadius: '3px',
                border: '1px solid var(--rule-soft)',
              }}
            >
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--ink-soft)' }}
                dir="rtl"
              >
                لا يوجد رقم مرتبط.{' '}
                <Link
                  href="/onboarding/whatsapp"
                  style={{
                    color: 'var(--primary-glow)',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  اربط رقماً جديداً من شاشة الإعداد
                </Link>
                .
              </p>
            </div>
          )}
      </motion.div>

      {/* Below-card hint */}
      <p
        className="mt-3 text-[12px] leading-relaxed"
        style={{ color: 'var(--ink-faint)' }}
        dir="rtl"
      >
        وسيلة الاتصال أساس كل شيء — تتحكّم في كيفية وصول الرسائل لعملائك،
        السرعة المسموح بها، والتزامن مع PDPL. ابدأ بالربط المباشر إذا أردت
        الإطلاق خلال دقائق، وانتقل إلى Meta WABA لاحقاً للحجم الكامل بعد
        اعتماد حسابك.
      </p>

      <QrScanModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        numberId={primaryNumberId}
        // Pass the primary wa_number so the modal can call
        // /api/settings/evolution/sync-after-pair on success — required
        // for the Fix 2 backfill (instance + token + status) and for
        // Fix 3's stale-cancel best-effort unlink. Null is tolerated by
        // the modal (skips sync, preserves legacy behaviour).
        waNumber={primaryWaNumber}
        resumeInstance={resumeInstance}
        onConnected={onConnected}
      />

      {/* Unlink confirmation surface — mounted at the section level so
        * it overlays the entire viewport regardless of which sub-panel
        * triggered it. Defensive `??` keeps the modal's RTL render
        * stable even if primaryWaNumber lookup raced the open. */}
      <UnlinkNumberModal
        open={unlinkOpen}
        onClose={() => setUnlinkOpen(false)}
        onSuccess={onUnlinkSuccess}
        waNumber={primaryWaNumber ?? ''}
        activeCount={unlinkActiveCount}
        clientId={clientId}
      />
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="mb-8 flex items-start gap-3">
      <MessageCircle
        className="w-5 h-5 mt-0.5 shrink-0"
        style={{ color: 'var(--primary-glow)' }}
        strokeWidth={1.5}
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2
            className="text-xl font-medium"
            style={{ color: 'var(--ink)' }}
            dir="rtl"
          >
            نوع الاتصال بواتساب
          </h2>
          <span
            className="text-[11px] tracking-widest uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
              letterSpacing: '0.1em',
            }}
            dir="ltr"
          >
            WhatsApp transport
          </span>
        </div>
        <p
          className="text-sm mt-1.5 max-w-2xl"
          style={{ color: 'var(--ink-soft)' }}
          dir="rtl"
        >
          اختر كيف يتصل البوت بواتساب — Meta WABA الرسمي (قريباً)، أو
          الربط المباشر للإطلاق الفوري.
        </p>
      </div>
    </div>
  );
}

function SwitchToEvolutionCta({
  busy,
  hasActiveConvs,
  onClick,
}: {
  busy: boolean;
  hasActiveConvs: boolean;
  onClick: () => void;
}) {
  // SOFT-warn pattern (2026-06-03): the hard-block "contact support" UX
  // trapped post-unlink operators — after they deliberately killed the
  // Evolution instance + transport reverted to cloud_api, this CTA is
  // their ONLY way back to Evolution, and hasActiveConvs is true by
  // construction (the conversations from before the unlink are still on
  // file). Same operator-trust posture as the unlink modal itself:
  // surface the count as a warning, let the operator proceed.
  const disabled = busy;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 text-[13px] font-medium transition-all"
        style={{
          background: disabled ? 'var(--paper-sink)' : 'var(--ink)',
          color: disabled ? 'var(--ink-faint)' : 'var(--paper)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ArrowRightLeft className="w-3.5 h-3.5" />
        )}
        <span>تفعيل الربط المباشر</span>
      </button>
      {hasActiveConvs && (
        <span
          className="text-[11px] inline-flex items-center gap-1.5"
          style={{ color: 'var(--warn)' }}
          dir="rtl"
        >
          <AlertCircle className="w-3 h-3" />
          <span>محادثات نشطة ستنتقل للقناة الجديدة بعد إقران الرقم</span>
        </span>
      )}
    </div>
  );
}
