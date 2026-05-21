'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mail,
  MessageCircle,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { PORTAL_KEYS } from '@/lib/portals';

interface LeadSourcesData {
  wa_number: string | null;
  inbound_email_token: string | null;
  inbound_email_enabled: boolean;
  llm_detected_count_30d: number;
  inbound_email_domain: string;
}

/**
 * Lead sources panel — replaces the old per-portal-card grid.
 *
 * The previous design implied portal partnerships we don't actually have.
 * This reframe makes the three honest mechanisms explicit:
 *   1) WhatsApp number — buyers tap "Contact via WhatsApp" on portal
 *      listings and land directly on the agent. No partnership required.
 *   2) Email forwarding — the operator points portal-side notification
 *      emails at a unique inbound address we provision.
 *   3) In-conversation detection — the LLM tags lead_source when the
 *      buyer mentions where they saw the listing.
 *
 * Webhook URLs for hypothetical future PFDN partnerships are demoted to
 * an "Advanced" disclosure at the bottom — kept for forward-compat but
 * framed as not-the-recommended-path.
 */
export function LeadSourcesPanel() {
  const [data, setData] = useState<LeadSourcesData | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const res = await fetch('/api/lead-sources', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const json = (await res.json()) as LeadSourcesData;
      setData(json);
    } catch {
      toast.error('تعذّر تحميل مصادر العملاء');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (loading) {
    return (
      <div
        className="mt-12 p-12 flex items-center justify-center"
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
    );
  }

  if (!data) return null;

  const fullAddress = data.inbound_email_token
    ? `leads-${data.inbound_email_token}@${data.inbound_email_domain}`
    : null;

  return (
    <section className="mt-12">
      {/* Section header — matches PortalsPanel's editorial header */}
      <div className="mb-8 flex items-start gap-3">
        <Waypoints
          className="w-5 h-5 mt-0.5 shrink-0"
          style={{ color: 'var(--primary-glow)' }}
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-medium" style={{ color: 'var(--ink)' }}>
              مصادر العملاء
            </h2>
            <span
              className="text-[11px] tracking-widest uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
              }}
            >
              Lead sources · 03
            </span>
          </div>
          <p
            className="text-sm mt-1.5 max-w-2xl"
            style={{ color: 'var(--ink-soft)' }}
          >
            ثلاث آليات صادقة لاستقبال العملاء من Bayut و Property Finder و
            Dubizzle و Aqar و Wasalt — بدون شراكات وهمية، بدون webhook معقّد.
          </p>
        </div>
      </div>

      {/* The three rows */}
      <div
        className="overflow-hidden"
        style={{
          background: 'var(--paper-lift)',
          border: '1px solid var(--rule)',
          borderRadius: '3px',
        }}
      >
        <WhatsAppRow waNumber={data.wa_number} />
        <RowDivider />
        <EmailRow
          enabled={data.inbound_email_enabled}
          fullAddress={fullAddress}
          onChange={refresh}
        />
        <RowDivider />
        <DetectionRow count={data.llm_detected_count_30d} />
      </div>

      {/* Demoted partner-integration disclosure */}
      <PartnerIntegrationsFootnote />
    </section>
  );
}

function RowDivider() {
  return <div style={{ height: 1, background: 'var(--rule)' }} />;
}

/* ── Row 1 — WhatsApp number ──────────────────────────────────── */

function WhatsAppRow({ waNumber }: { waNumber: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!waNumber) return;
    try {
      await navigator.clipboard.writeText(waNumber);
      setCopied(true);
      toast.success('تم النسخ');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('تعذّر النسخ');
    }
  }

  return (
    <SourceRow
      index="01"
      icon={<MessageCircle className="w-4 h-4" strokeWidth={1.5} />}
      titleAr="رقم واتساب المكتب"
      titleEn="Your WhatsApp number"
      pillVariant="active"
      pillLabelAr="نشط"
      pillLabelEn="Active"
      delay={0}
    >
      {waNumber ? (
        <div className="space-y-2.5">
          <div
            className="flex items-stretch gap-px"
            style={{ background: 'var(--rule)', borderRadius: 3 }}
          >
            <div
              className="flex-1 min-w-0 px-3 h-9 flex items-center text-[13px] tabular truncate"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-sink)',
                color: 'var(--ink)',
                letterSpacing: '0.04em',
              }}
              dir="ltr"
              title={waNumber}
            >
              {waNumber}
            </div>
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 flex items-center gap-1.5 text-[11px] transition-colors"
              style={{
                background: 'var(--paper-lift)',
                fontFamily: 'var(--font-mono)',
                color: copied ? 'var(--primary-glow)' : 'var(--ink-soft)',
                letterSpacing: '0.06em',
              }}
              aria-label="Copy WhatsApp number"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'COPIED' : 'COPY'}</span>
            </button>
          </div>
          <HelperText
            ar="كل عميل ضغط «تواصل عبر واتساب» على Bayut أو Property Finder أو Dubizzle أو Aqar أو Wasalt يصلك هنا. لا حاجة لإعداد."
            en="Every buyer who taps Contact via WhatsApp on Bayut, Property Finder, Dubizzle, Aqar, or Wasalt lands on this number. Nothing to configure."
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          <div
            className="px-3 py-2.5 text-[12px]"
            style={{
              background: 'var(--paper-sink)',
              color: 'var(--ink-soft)',
              border: '1px dashed var(--rule)',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span dir="rtl">لم يُضبط بعد — أكمل الإعداد من قسم الإعدادات أعلاه.</span>
          </div>
          <HelperText
            ar="بمجرد ضبط الرقم، يصبح هذا المسار نشطاً تلقائياً."
            en="Once the number is configured, this channel becomes active automatically."
          />
        </div>
      )}
    </SourceRow>
  );
}

/* ── Row 2 — Email forwarding ─────────────────────────────────── */

function EmailRow({
  enabled,
  fullAddress,
  onChange,
}: {
  enabled: boolean;
  fullAddress: string | null;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  async function enable() {
    setBusy(true);
    try {
      const res = await fetch('/api/lead-sources/email/enable', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      toast.success('تم تفعيل البريد المُولّد');
      await onChange();
      setHowOpen(true);
    } catch {
      toast.error('تعذّر التفعيل — حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'إيقاف تحويل البريد؟ ستتوقّف Anvira عن استقبال leads من رسائل المنصّات حتى تعيد التفعيل.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/lead-sources/email/disable', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      toast.success('تم إيقاف تحويل البريد');
      await onChange();
    } catch {
      toast.error('تعذّر الإيقاف');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!fullAddress) return;
    try {
      await navigator.clipboard.writeText(fullAddress);
      setCopied(true);
      toast.success('تم النسخ');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('تعذّر النسخ');
    }
  }

  return (
    <SourceRow
      index="02"
      icon={<Mail className="w-4 h-4" strokeWidth={1.5} />}
      titleAr="تحويل البريد الإلكتروني"
      titleEn="Email forwarding"
      pillVariant={enabled ? 'connected' : 'idle'}
      pillLabelAr={enabled ? 'متّصل' : 'غير مُعدّ'}
      pillLabelEn={enabled ? 'Connected' : 'Not configured'}
      delay={0.05}
    >
      {enabled && fullAddress ? (
        <div className="space-y-3">
          <div
            className="flex items-stretch gap-px"
            style={{ background: 'var(--rule)', borderRadius: 3 }}
          >
            <div
              className="flex-1 min-w-0 px-3 h-9 flex items-center text-[12px] tabular truncate"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--paper-sink)',
                color: 'var(--ink)',
              }}
              dir="ltr"
              title={fullAddress}
            >
              {fullAddress}
            </div>
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 flex items-center gap-1.5 text-[11px]"
              style={{
                background: 'var(--paper-lift)',
                fontFamily: 'var(--font-mono)',
                color: copied ? 'var(--primary-glow)' : 'var(--ink-soft)',
                letterSpacing: '0.06em',
              }}
              aria-label="Copy inbound email address"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'COPIED' : 'COPY'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] transition-colors"
            style={{
              fontFamily: 'var(--font-mono)',
              color: howOpen ? 'var(--ink)' : 'var(--ink-soft)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: howOpen ? 'rotate(180deg)' : 'none' }}
            />
            <span>{howOpen ? 'إخفاء التعليمات' : 'كيف تربط؟'}</span>
          </button>

          <AnimatePresence initial={false}>
            {howOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <SetupInstructions address={fullAddress} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-1">
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-[11px] transition-colors disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--ink-faint)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                textDecorationColor: 'var(--ink-ghost)',
              }}
            >
              إيقاف التحويل
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <HelperText
            ar="فعّل البريد المُولّد ثم وجّه إشعارات Bayut و Property Finder وغيرها إليه — Anvira ستفتح كل إشعار، تستخرج رقم العميل، وتبدأ المحادثة تلقائياً."
            en="Generate your inbound address, then forward portal notification emails to it — Anvira will parse each one, extract the buyer's contact, and start the conversation."
          />
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="btn-primary h-9 px-4 text-[13px]"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>تفعيل البريد المُولّد</span>
              </>
            )}
          </button>
        </div>
      )}
    </SourceRow>
  );
}

function SetupInstructions({ address }: { address: string }) {
  const steps: { portal: string; instruction: string }[] = [
    {
      portal: 'Bayut',
      instruction:
        'Bayut Agent dashboard → Notifications → Email → أضف هذا العنوان كمستلم منسوخ (CC) لإشعارات الـ leads.',
    },
    {
      portal: 'Property Finder',
      instruction:
        'PF Expert → Settings → Email forwarding → أدخل العنوان أعلاه في حقل "Forward leads to".',
    },
    {
      portal: 'Dubizzle',
      instruction:
        'Dubizzle Pro → Notification preferences → Lead emails → أضف العنوان كمستلم.',
    },
    {
      portal: 'Aqar',
      instruction:
        'لوحة Aqar → الإشعارات → البريد → أضف العنوان كنسخة (CC) في تنبيهات العملاء.',
    },
    {
      portal: 'Wasalt',
      instruction:
        'Wasalt Agent → Email settings → Lead alerts → أضف العنوان كمستلم إضافي.',
    },
  ];

  return (
    <div
      className="mt-1 p-4 space-y-3"
      style={{
        background: 'var(--paper-sink)',
        border: '1px solid var(--rule)',
        borderRadius: 3,
      }}
    >
      {steps.map((s, i) => (
        <div key={s.portal} className="flex items-start gap-3">
          <span
            className="text-[10px] tracking-widest uppercase shrink-0 w-6 pt-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--ink-faint)',
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="text-[12px] mb-0.5"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {s.portal}
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {s.instruction}
            </div>
          </div>
        </div>
      ))}

      <div
        className="pt-3 mt-1 text-[11px] leading-relaxed"
        style={{
          borderTop: '1px solid var(--rule)',
          color: 'var(--ink-faint)',
        }}
      >
        <span
          className="block mb-1"
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}
        >
          Gmail / Outlook fallback
        </span>
        <span dir="rtl">
          أنشئ فلتراً بالشرط{' '}
          <code
            className="px-1 py-0.5 mx-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              fontSize: '0.7rem',
            }}
            dir="ltr"
          >
            from:(@bayut.com OR @propertyfinder.ae OR @dubizzle.com OR @aqar.fm OR @wasalt.com)
          </code>{' '}
          ثم وجّهه إلى{' '}
          <code
            className="px-1 py-0.5 mx-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--paper-lift)',
              border: '1px solid var(--rule)',
              fontSize: '0.7rem',
            }}
            dir="ltr"
          >
            {address}
          </code>
        </span>
      </div>
    </div>
  );
}

/* ── Row 3 — In-conversation detection ────────────────────────── */

function DetectionRow({ count }: { count: number }) {
  return (
    <SourceRow
      index="03"
      icon={<Sparkles className="w-4 h-4" strokeWidth={1.5} />}
      titleAr="اكتشاف المصدر من المحادثة"
      titleEn="Conversation-based detection"
      pillVariant="auto"
      pillLabelAr="تلقائي"
      pillLabelEn="Automatic"
      delay={0.1}
    >
      <div className="space-y-3">
        <div
          className="flex items-baseline gap-2.5 px-3 py-2.5"
          style={{
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: 3,
          }}
        >
          <span
            className="tabular"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: '1.75rem',
              lineHeight: 1,
              color: count > 0 ? 'var(--primary-glow)' : 'var(--ink-faint)',
              letterSpacing: '-0.02em',
            }}
          >
            {count}
          </span>
          <span
            className="text-[10px] tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
          >
            محادثة بمصدر مُحدَّد · 30D
          </span>
        </div>
        <HelperText
          ar="عندما يقول العميل «شفت إعلانكم في Bayut» يُسجَّل المصدر تلقائياً في حقل lead_source."
          en="When a buyer says 'I saw your listing on Bayut,' the source is captured automatically into lead_source."
        />
      </div>
    </SourceRow>
  );
}

/* ── Partner integrations footnote ────────────────────────────── */

function PartnerIntegrationsFootnote() {
  const [open, setOpen] = useState(false);
  const base = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[11px] transition-colors group"
        style={{
          fontFamily: 'var(--font-mono)',
          color: open ? 'var(--ink-soft)' : 'var(--ink-faint)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        <ChevronDown
          className="w-3 h-3 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
        <span>Partner integrations · coming soon</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mt-3 p-5"
              style={{
                background: 'var(--paper-sink)',
                border: '1px dashed var(--rule)',
                borderRadius: 3,
              }}
            >
              <p
                className="text-[12px] leading-relaxed mb-3"
                style={{ color: 'var(--ink-soft)' }}
              >
                للشركاء المعتمدين فقط — تكامل مباشر مع منصات Bayut و Property
                Finder عبر شراكاتهم الرسمية. هذه الـ webhook URLs محفوظة لِما بعد
                توقيع اتفاقيات PFDN، وليست المسار الموصى به اليوم.
              </p>
              <div className="space-y-px" style={{ background: 'var(--rule)' }}>
                {PORTAL_KEYS.map((k) => (
                  <div
                    key={k}
                    className="flex items-center gap-3 px-3 h-8 text-[11px]"
                    style={{
                      background: 'var(--paper-lift)',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--ink-faint)',
                    }}
                    dir="ltr"
                  >
                    <span
                      className="w-24 shrink-0"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      {k}
                    </span>
                    <span className="truncate" title={`${base}/webhook/portals/${k}`}>
                      {base}/webhook/portals/{k}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Shared row primitive ─────────────────────────────────────── */

type PillVariant = 'active' | 'connected' | 'idle' | 'auto';

function SourceRow({
  index,
  icon,
  titleAr,
  titleEn,
  pillVariant,
  pillLabelAr,
  pillLabelEn,
  delay,
  children,
}: {
  index: string;
  icon: React.ReactNode;
  titleAr: string;
  titleEn: string;
  pillVariant: PillVariant;
  pillLabelAr: string;
  pillLabelEn: string;
  delay: number;
  children: React.ReactNode;
}) {
  const pillClass =
    pillVariant === 'idle'
      ? 'pill pill-idle'
      : pillVariant === 'connected'
        ? 'pill pill-success'
        : pillVariant === 'active'
          ? 'pill pill-warn'
          : 'pill pill-warn';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-[64px_1fr] md:grid-cols-[80px_1fr_minmax(260px,2fr)] gap-6 md:gap-8 px-5 md:px-7 py-7 md:py-8"
    >
      {/* Index + icon */}
      <div className="flex md:block items-center gap-3">
        <span
          className="text-[10px] tracking-widest uppercase block"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faint)' }}
        >
          · {index}
        </span>
        <div
          className="md:mt-3 w-9 h-9 flex items-center justify-center"
          style={{
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: 3,
            color: 'var(--ink-soft)',
          }}
        >
          {icon}
        </div>
      </div>

      {/* Title + status */}
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
          <h3
            className="text-base"
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              color: 'var(--ink)',
            }}
          >
            {titleAr}
          </h3>
          <span className={pillClass} title={pillLabelEn}>
            <span className="pill-dot" />
            <span>{pillLabelAr}</span>
          </span>
        </div>
        <div
          className="text-[11px] tracking-wider"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
            letterSpacing: '0.06em',
          }}
        >
          {titleEn}
        </div>
      </div>

      {/* Value / action — full width on mobile, fixed col on desktop */}
      <div className="col-span-2 md:col-span-1 md:max-w-[420px]">{children}</div>
    </motion.div>
  );
}

function HelperText({ ar, en }: { ar: string; en: string }) {
  return (
    <div className="space-y-1">
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: 'var(--ink-soft)' }}
        dir="rtl"
      >
        {ar}
      </p>
      <p
        className="text-[11px] leading-relaxed"
        style={{
          color: 'var(--ink-faint)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.005em',
        }}
        dir="ltr"
      >
        {en}
      </p>
    </div>
  );
}
