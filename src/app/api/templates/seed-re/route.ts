import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';
import { RE_REPLY_TEMPLATE_SEEDS } from '@/lib/re-reply-templates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/templates/seed-re — bulk-insert the real-estate starter pack
 * (~12 bilingual reply templates) for the current client.
 *
 * Guards:
 *   - real-estate only (clinics/salons get their own UX path)
 *   - refuses to seed when templates already exist — keeps idempotent and
 *     prevents accidental duplication when the operator clicks twice
 *
 * Returns the seeded rows so the editor can re-render without a page
 * refresh round-trip.
 */
export async function POST() {
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

  const svc = createServiceClient();

  // Idempotency: refuse to seed if any templates already exist.
  const { count } = await svc
    .from('reply_templates')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'already_seeded', existing_count: count },
      { status: 409 }
    );
  }

  const rows = RE_REPLY_TEMPLATE_SEEDS.map((t) => ({
    client_id: client.id,
    label: t.label,
    body: t.body,
    language: t.language,
    sort_order: t.sort_order,
  }));

  const { data, error } = await svc
    .from('reply_templates')
    .insert(rows)
    .select('id, label, body, language, sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'template.seed_re',
    targetType: 'reply_templates',
    details: { count: rows.length },
  });

  return NextResponse.json({ ok: true, templates: data ?? [], inserted: rows.length });
}
