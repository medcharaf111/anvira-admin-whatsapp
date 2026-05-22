import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { callInternal, getInternalContext } from '@/lib/internal-api';

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

function normalizeBackendSchema(payload: Record<string, unknown>, type: string) {
  const raw = (payload.schema ?? payload) as BackendSchema;
  const required = new Set(raw.required ?? []);
  const fields = (raw.fields ?? []).map((f) => ({
    name: f.key,
    label_ar: f.label ?? f.key,
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
