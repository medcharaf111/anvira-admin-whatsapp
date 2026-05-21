import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/properties — list properties for the active tenant.
 * The list view server-component already does a direct supabase query, so
 * this endpoint exists mainly for client-side refresh after a mutation.
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

  const { data, error } = await supabase
    .from('properties')
    .select(
      'id, reference, type, bedrooms, bathrooms, area_sqft, price, currency, location, view, handover_date, status, is_offplan, highlights, media_urls, project_id, payment_plan_id, projects(name), payment_plans(name)'
    )
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ properties: data ?? [] });
}

/**
 * POST /api/properties — create a new property. Required fields are the
 * reference + type + status; everything else is optional and may be filled
 * in later. project_id / payment_plan_id are FK uuids, validated by RLS.
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

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  // Whitelist: never accept client_id/id from the caller — derive from session.
  const allowed = [
    'project_id',
    'payment_plan_id',
    'reference',
    'type',
    'bedrooms',
    'bathrooms',
    'area_sqft',
    'price',
    'currency',
    'location',
    'view',
    'handover_date',
    'status',
    'is_offplan',
    'highlights',
    'media_urls',
  ] as const;
  const safe: Record<string, unknown> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) safe[k] = body[k];
  }
  safe.client_id = client.id;
  if (!safe.currency) safe.currency = 'AED';

  const svc = createServiceClient();
  const { data, error } = await svc.from('properties').insert(safe).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'property.create',
    targetType: 'property',
    targetId: data.id,
  });

  return NextResponse.json({ ok: true, property: data });
}
