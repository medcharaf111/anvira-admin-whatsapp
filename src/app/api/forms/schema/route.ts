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
  return NextResponse.json({ provisioned: true, ...payload });
}
