import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/leads/:id/qualify — edit the qualification snapshot for a
 * conversation (one row in leads_qualification per conversation). The id
 * param is the conversation id. If a qualification row doesn't exist yet
 * we upsert one. Operator-edited values are persisted but the backend's
 * extractor will keep enriching them on subsequent inbound messages.
 */
const ALLOWED = [
  'budget_min',
  'budget_max',
  'budget_currency',
  'bedrooms_wanted',
  'property_types_wanted',
  'preferred_locations',
  'citizenship',
  'residency_status',
  'mortgage_status',
  'timeline',
  'intent',
  'language_preference',
  'notes',
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  // Confirm the conversation belongs to this client before any write.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('client_id', client.id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const svc = createServiceClient();

  // Does a qualification row already exist? We can't rely on a
  // conversation_id unique constraint everywhere, so just check.
  const { data: existing } = await svc
    .from('leads_qualification')
    .select('id')
    .eq('conversation_id', id)
    .eq('client_id', client.id)
    .maybeSingle();

  if (existing) {
    const { error } = await svc
      .from('leads_qualification')
      .update(updates)
      .eq('id', (existing as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await svc.from('leads_qualification').insert({
      ...updates,
      conversation_id: id,
      client_id: client.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'lead.qualify.update',
    targetType: 'conversation',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}
