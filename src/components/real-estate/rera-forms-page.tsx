'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Handshake,
  Users,
  RefreshCcw,
  XCircle,
  ArrowLeftRight,
} from 'lucide-react';
import { ReraFormDrawer } from '@/components/real-estate/rera-form-drawer';

export type ReraFormType = 'A' | 'B' | 'F' | 'I' | 'U';

interface FormCardDef {
  type: ReraFormType;
  title: string;
  description: string;
  icon: typeof FileText;
}

const FORMS: FormCardDef[] = [
  {
    type: 'A',
    title: 'Form A — اتفاقية وكالة بيع',
    description: 'Seller-listing agreement: brokerage exclusively appointed to market a property for sale.',
    icon: FileText,
  },
  {
    type: 'B',
    title: 'Form B — اتفاقية وكالة شراء',
    description: 'Buyer-agent appointment: broker represents a buyer searching for a specific property.',
    icon: Handshake,
  },
  {
    type: 'F',
    title: 'Form F — مذكرة تفاهم لإعادة البيع',
    description: 'Resale MOU between buyer and seller — captures price, deposit, transfer date.',
    icon: ArrowLeftRight,
  },
  {
    type: 'I',
    title: 'Form I — اتفاقية تعاون بين وسطاء',
    description: 'Inter-agent referral: two brokers split commission on a co-listed or co-sold deal.',
    icon: Users,
  },
  {
    type: 'U',
    title: 'Form U — إلغاء اتفاقية وكالة',
    description: 'Cancellation form: serves the regulatory 7-day notice to terminate Form A or B.',
    icon: XCircle,
  },
];

/**
 * RERA Forms page — five card grid (one per regulatory form type) +
 * dynamic drawer that fetches the form's JSON schema on click and
 * renders the inputs from it.
 *
 * Prefill sources:
 *   - `leadId` → `/api/leads/:id/detail` pulls budget / bedrooms /
 *     locations / customer details from `leads_qualification`.
 *   - `propertyId` → `/api/properties` filter (we fetch the list, pick
 *     the matching entry, and map standard property fields).
 *
 * If both are present, lead data wins for customer-side fields and
 * property data wins for unit-side fields.
 */
export function ReraFormsPage({
  leadId,
  propertyId,
  initialType,
}: {
  leadId: string | null;
  propertyId: string | null;
  initialType: string | null;
}) {
  const [openType, setOpenType] = useState<ReraFormType | null>(() => {
    if (initialType && (FORMS as { type: string }[]).some((f) => f.type === initialType.toUpperCase())) {
      return initialType.toUpperCase() as ReraFormType;
    }
    return null;
  });

  // Prefetch lead + property prefill data once on mount so opening a
  // card is instant. We only refetch if the IDs change (they don't, in
  // practice — they come from search params).
  const [prefill, setPrefill] = useState<Record<string, unknown>>({});
  const [prefillLoading, setPrefillLoading] = useState(!!(leadId || propertyId));

  useEffect(() => {
    if (!leadId && !propertyId) {
      setPrefillLoading(false);
      return;
    }
    let cancelled = false;
    const next: Record<string, unknown> = {};

    const tasks: Promise<void>[] = [];
    if (leadId) {
      tasks.push(
        fetch(`/api/leads/${leadId}/detail`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (!j || cancelled) return;
            const q = j.qualification ?? {};
            // Customer-side field shapes vary across forms (Form A
            // has owner_name; Form B has buyer_name); we fill all
            // common keys and the drawer picks what its schema asks
            // for.
            next.customer_name = j.customer_name ?? null;
            next.customer_phone = j.customer_phone ?? null;
            next.buyer_name = j.customer_name ?? null;
            next.buyer_phone = j.customer_phone ?? null;
            next.seller_name = j.customer_name ?? null;
            next.seller_phone = j.customer_phone ?? null;
            next.owner_name = j.customer_name ?? null;
            next.owner_phone = j.customer_phone ?? null;
            next.client_name = j.customer_name ?? null;
            next.budget_min = q.budget_min ?? null;
            next.budget_max = q.budget_max ?? null;
            next.budget_currency = q.budget_currency ?? 'AED';
            next.bedrooms = q.bedrooms_wanted ?? null;
            next.property_types = q.property_types_wanted ?? null;
            next.locations = q.preferred_locations ?? null;
            next.nationality = q.citizenship ?? null;
          })
          .catch(() => {
            /* swallow — drawer still works with empty prefill */
          })
      );
    }
    if (propertyId) {
      tasks.push(
        fetch('/api/properties', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { properties?: Array<Record<string, unknown>> } | null) => {
            if (!j || cancelled) return;
            const p = (j.properties ?? []).find((x) => x.id === propertyId);
            if (!p) return;
            next.property_reference = p.reference ?? null;
            next.property_type = p.type ?? null;
            next.property_location = p.location ?? null;
            next.property_bedrooms = p.bedrooms ?? null;
            next.property_bathrooms = p.bathrooms ?? null;
            next.property_area_sqft = p.area_sqft ?? null;
            next.property_price = p.price ?? null;
            next.property_currency = p.currency ?? 'AED';
            next.property_view = p.view ?? null;
            next.property_handover_date = p.handover_date ?? null;
          })
          .catch(() => {
            /* swallow */
          })
      );
    }

    Promise.all(tasks).finally(() => {
      if (!cancelled) {
        setPrefill(next);
        setPrefillLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [leadId, propertyId]);

  return (
    <div>
      {(leadId || propertyId) && (
        <div
          className="mb-6 p-3 flex items-center gap-2 text-xs"
          style={{
            background: 'color-mix(in srgb, var(--primary-glow) 8%, var(--paper-lift))',
            border: '1px solid color-mix(in srgb, var(--primary-glow) 30%, transparent)',
            borderRadius: '3px',
            color: 'var(--ink-soft)',
          }}
        >
          <RefreshCcw
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--primary-glow)' }}
          />
          <span>
            {prefillLoading
              ? 'جارٍ تجهيز البيانات للتعبئة التلقائية…'
              : 'سيتم ملء الحقول تلقائياً من ' +
                (leadId && propertyId
                  ? 'بيانات العميل والعقار'
                  : leadId
                  ? 'بيانات العميل'
                  : 'بيانات العقار')}
          </span>
        </div>
      )}

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.05 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {FORMS.map((f) => (
          <FormCard
            key={f.type}
            form={f}
            onOpen={() => setOpenType(f.type)}
          />
        ))}
      </motion.div>

      <p
        className="mt-8 text-[11px] max-w-2xl leading-relaxed"
        style={{ color: 'var(--ink-faint)' }}
      >
        نماذج RERA الصادرة عن دائرة الأراضي والأملاك بدبي. بعد تحميل PDF،
        على الوسيط طباعة النموذج، توقيعه يدوياً مع العميل، ورفعه إلى نظام
        Trakheesi أو تسليمه ورقياً.
      </p>

      <ReraFormDrawer
        open={openType !== null}
        type={openType}
        prefill={prefill}
        leadId={leadId}
        propertyId={propertyId}
        onClose={() => setOpenType(null)}
      />
    </div>
  );
}

function FormCard({
  form,
  onOpen,
}: {
  form: FormCardDef;
  onOpen: () => void;
}) {
  const Icon = form.icon;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="text-right p-5 h-full flex flex-col items-start gap-3 group"
      style={{
        background: 'var(--paper-lift)',
        border: '1px solid var(--rule)',
        borderRadius: '4px',
        transition: 'border-color 0.15s ease',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor =
          'color-mix(in srgb, var(--primary-glow) 50%, var(--rule))')
      }
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--rule)')}
    >
      <div className="flex items-center justify-between w-full">
        <div
          className="w-9 h-9 inline-flex items-center justify-center"
          style={{
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: '3px',
          }}
        >
          <Icon
            className="w-4 h-4"
            strokeWidth={1.5}
            style={{ color: 'var(--primary-glow)' }}
          />
        </div>
        <span
          className="tabular text-[10px] tracking-widest uppercase px-2 py-0.5"
          style={{
            fontFamily: 'var(--font-mono)',
            background: 'var(--paper-sink)',
            border: '1px solid var(--rule)',
            borderRadius: '2px',
            color: 'var(--ink-soft)',
          }}
          dir="ltr"
        >
          FORM · {form.type}
        </span>
      </div>
      <h3
        className="display-ar text-base leading-snug"
        style={{ color: 'var(--ink)' }}
      >
        {form.title}
      </h3>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: 'var(--ink-soft)' }}
      >
        {form.description}
      </p>
    </motion.button>
  );
}
