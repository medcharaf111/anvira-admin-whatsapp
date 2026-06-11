import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';
import { gateAdminRoute } from '@/lib/tier-gates-server';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['A', 'B', 'F', 'I', 'U']);

/**
 * GET /api/forms/schema?type=A|B|F|I|U — proxies the backend's RERA
 * form schema endpoint. The schema is a JSON map of field name →
 * `{ label_ar, label_en, type, required, options? }` that the drawer
 * uses to dynamically render inputs.
 *
 * RE + Dubai/UAE-applicable. Saudi brokerages can still preview the
 * forms but they're not regulatory there.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await getCurrentClient();
  if (!client) return NextResponse.json({ error: 'no_client' }, { status: 403 });
  if (client.client_type !== 'real_estate') {
    return NextResponse.json({ error: 'not_real_estate' }, { status: 403 });
  }

  // SUBSCRIPTION_PLAN.md §5.3 — rera_forms is Brokerage+, "soft → hard at GA".
  {
    // 3.2 — gateAdminRoute logs telemetry (soft_skip AND hard_block) so
    // the admin surface is visible in tier_gate_events during the soak.
    const tierBlock = gateAdminRoute(client, 'rera_forms');
    if (tierBlock) return NextResponse.json(tierBlock, { status: 402 });
  }

  const type = (new URL(req.url).searchParams.get('type') ?? '').toUpperCase();
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }

  const ctx = getInternalContext(client.id);
  const result = await callInternal(
    ctx,
    `/internal/rera/forms/schema?type=${encodeURIComponent(type)}`,
    { method: 'GET' }
  );
  if (!result.provisioned) {
    return NextResponse.json({ provisioned: false, fields: [] });
  }
  if (!result.ok) {
    return NextResponse.json(
      { provisioned: true, fields: [], error: `backend_${result.status}` },
      { status: 200 }
    );
  }
  const payload = (result.json as Record<string, unknown> | null) ?? {};
  // Backend ships the schema as `{ ok, type, schema: { required, fields:[{ key, label, type, default?, enum? }] } }`.
  // Admin's drawer expects `{ type, title_ar, title_en, fields:[{ name, label_ar, label_en, type, required?, options? }] }`.
  // Normalize so the drawer can render without each form needing
  // backend-shape awareness.
  return NextResponse.json({
    provisioned: true,
    ...normalizeBackendSchema(payload, type),
  });
}

interface BackendField {
  key: string;
  label?: string;
  type: string;
  default?: unknown;
  enum?: string[];
}

interface BackendSchema {
  required?: string[];
  fields?: BackendField[];
}

const TITLES: Record<string, { ar: string; en: string }> = {
  A: { ar: 'اتفاقية وكالة بيع', en: 'Form A — Seller listing agreement' },
  B: { ar: 'اتفاقية وكالة شراء', en: 'Form B — Buyer agent appointment' },
  F: { ar: 'مذكرة تفاهم لإعادة البيع', en: 'Form F — Resale MOU' },
  I: { ar: 'اتفاقية تعاون بين وسطاء', en: 'Form I — Inter-agent referral' },
  U: { ar: 'إلغاء اتفاقية وكالة', en: 'Form U — Cancellation' },
};

/**
 * Arabic translations for every RERA form field key the backend exposes. The
 * backend's schemas ship only English `label` strings; this map lets the
 * admin drawer render bilingual labels without each form needing a backend
 * change. Add to this when new fields are introduced server-side.
 */
const ARABIC_LABELS: Record<string, string> = {
  // Brokerage / agent (shared across forms)
  brokerage: 'اسم المكتب العقاري',
  broker_license: 'رقم رخصة المكتب (RERA)',
  agent_name: 'اسم الوكيل',
  agent_brn: 'رقم تسجيل الوكيل (BRN)',
  introducing_brokerage: 'المكتب المُحيل (Introducer)',
  introducing_broker_license: 'رقم رخصة المكتب المُحيل',
  introducing_agent_name: 'اسم الوكيل المُحيل',
  introducing_agent_brn: 'رقم تسجيل الوكيل المُحيل',
  listing_brokerage: 'المكتب المُدرج (Listing)',
  listing_broker_license: 'رقم رخصة المكتب المُدرج',
  listing_agent_name: 'اسم وكيل الإدراج',
  listing_agent_brn: 'رقم تسجيل وكيل الإدراج',

  // Seller fields (Form A, F)
  seller_name: 'اسم البائع الكامل',
  seller_emirates_id: 'رقم هوية البائع الإماراتية',
  seller_phone: 'هاتف البائع',
  seller_email: 'البريد الإلكتروني للبائع',

  // Buyer fields (Form B, F)
  buyer_name: 'اسم المشتري الكامل',
  buyer_emirates_id: 'رقم هوية المشتري الإماراتية',
  buyer_phone: 'هاتف المشتري',
  buyer_email: 'البريد الإلكتروني للمشتري',
  budget_min: 'الميزانية الدنيا',
  budget_max: 'الميزانية القصوى',
  property_types_wanted: 'أنواع العقارات المطلوبة',
  preferred_locations: 'المناطق المفضّلة',

  // Property
  property_address: 'عنوان العقار',
  property_dld_number: 'رقم سند الملكية (DLD)',
  property_type: 'نوع العقار (شقة / فيلا / إلخ.)',

  // Pricing
  listing_price: 'سعر الإدراج',
  transaction_price: 'سعر الصفقة',
  deposit_amount: 'مبلغ التأمين',
  currency: 'العملة',

  // Commission
  commission_percent: 'نسبة العمولة %',
  total_commission_percent: 'إجمالي العمولة %',
  split_introducer_percent: 'حصة المحيل %',
  split_lister_percent: 'حصة المُدرج %',
  commission_buyer_percent: 'عمولة جانب المشتري %',
  commission_seller_percent: 'عمولة جانب البائع %',

  // Terms
  exclusivity_type: 'نوع الحصرية',
  agreement_term_days: 'مدة الاتفاقية (أيام، حد أقصى 90 للحصرية)',
  signing_date: 'تاريخ التوقيع',
  completion_deadline_days: 'موعد الإكمال (أيام)',
  dld_fee_payer: 'الجهة المُسدِّدة لرسوم DLD',
  notes: 'ملاحظات إضافية',
  settlement_terms: 'شروط التسوية',

  // Cancellation (Form U)
  cancelling_form_type: 'النموذج المراد إلغاؤه',
  original_signing_date: 'تاريخ التوقيع الأصلي',
  original_form_reference: 'مرجع/معرّف النموذج الأصلي',
  client_name: 'اسم العميل',
  client_emirates_id: 'رقم هوية العميل',
  cancellation_initiator: 'الجهة المُلغية',
  reason: 'سبب الإلغاء',
  notice_date: 'تاريخ الإشعار',
  effective_date: 'تاريخ النفاذ (≥ تاريخ الإشعار + 7 أيام)',
};

function normalizeBackendSchema(payload: Record<string, unknown>, type: string) {
  const raw = (payload.schema ?? payload) as BackendSchema;
  const required = new Set(raw.required ?? []);
  const fields = (raw.fields ?? []).map((f) => ({
    name: f.key,
    label_ar: ARABIC_LABELS[f.key] ?? f.label ?? f.key,
    label_en: f.label ?? f.key,
    type: mapFieldType(f.type),
    required: required.has(f.key),
    options: Array.isArray(f.enum)
      ? f.enum.map((v) => ({ value: v, label_ar: v, label_en: v }))
      : undefined,
  }));
  const title = TITLES[type] ?? { ar: `Form ${type}`, en: `Form ${type}` };
  return {
    type,
    title_ar: title.ar,
    title_en: title.en,
    fields,
  };
}

function mapFieldType(t: string): string {
  switch (t) {
    case 'enum':
      return 'select';
    case 'date':
    case 'number':
    case 'string':
    case 'text':
    case 'phone':
    case 'email':
    case 'currency':
    case 'boolean':
      return t;
    default:
      return 'string';
  }
}
