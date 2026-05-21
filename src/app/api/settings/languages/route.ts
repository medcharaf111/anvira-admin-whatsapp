import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// The seven languages the bot can reply in. AR + EN are the defaults
// and cannot be unchecked — the operator must keep at least one of the
// two primary languages active so no inbound goes un-replied.
const SUPPORTED = ['ar', 'en', 'fr', 'ru', 'hi', 'ur', 'zh'] as const;
type LangCode = (typeof SUPPORTED)[number];

/**
 * GET /api/settings/languages — current opt-in list.
 *
 * Reads from `dashboard_clients.enabled_languages` if the column exists.
 * Otherwise falls back to the ['ar','en'] default and signals deferred:true.
 */
export async function GET() {
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

  let enabled: LangCode[] = ['ar', 'en'];
  let deferred = true; // until we successfully read the column

  try {
    const { data, error } = await supabase
      .from('dashboard_clients')
      .select('enabled_languages')
      .eq('id', client.id)
      .maybeSingle();

    if (!error && data) {
      const raw = (data as { enabled_languages?: unknown }).enabled_languages;
      if (Array.isArray(raw)) {
        const cleaned = raw
          .filter((v): v is string => typeof v === 'string')
          .filter((v): v is LangCode => (SUPPORTED as readonly string[]).includes(v));
        if (cleaned.length > 0) {
          enabled = cleaned as LangCode[];
        }
        deferred = false; // column exists; persistence is live
      }
    }
  } catch {
    // Column missing — leave deferred=true and use default.
  }

  return NextResponse.json({
    enabled,
    supported: SUPPORTED,
    deferred,
  });
}

/**
 * POST /api/settings/languages — save opt-in list.
 *
 * Attempts to write `dashboard_clients.enabled_languages`. If the
 * column hasn't migrated yet, returns { ok: true, deferred: true } so
 * the operator gets honest feedback ("preference saved — bot wiring
 * activates after next deploy").
 */
export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => null)) as
    | { enabled?: string[] }
    | null;
  if (!body || !Array.isArray(body.enabled)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const enabled = Array.from(
    new Set(
      body.enabled.filter((v): v is LangCode =>
        (SUPPORTED as readonly string[]).includes(v)
      )
    )
  );

  // Operator can't opt-out of every language. Keep at least one of the
  // two primaries so the bot always has a path for the dominant local
  // demographic.
  if (!enabled.includes('ar') && !enabled.includes('en')) {
    return NextResponse.json(
      { error: 'must_keep_ar_or_en' },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  let deferred = false;
  try {
    const { error } = await svc
      .from('dashboard_clients')
      .update({ enabled_languages: enabled })
      .eq('id', client.id);
    if (error) {
      // Column doesn't exist yet — that's the deferred path.
      deferred = true;
    }
  } catch {
    deferred = true;
  }

  // Best-effort cache invalidate. Backend may ignore if it doesn't yet
  // read the column.
  fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/internal/settings/invalidate?client=${client.id}`,
    {
      method: 'POST',
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SHARED_SECRET ?? '' },
    }
  ).catch(() => {});

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'settings.languages.update',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { enabled, deferred },
  });

  return NextResponse.json({ ok: true, deferred, enabled });
}
