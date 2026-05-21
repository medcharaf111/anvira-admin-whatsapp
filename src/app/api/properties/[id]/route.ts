import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ALLOWED = [
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
  for (const k of ALLOWED) if (body[k] !== undefined) updates[k] = body[k];

  const svc = createServiceClient();
  const { error } = await svc
    .from('properties')
    .update(updates)
    .eq('id', id)
    .eq('client_id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'property.update',
    targetType: 'property',
    targetId: id,
    details: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
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

  const svc = createServiceClient();
  const { error } = await svc
    .from('properties')
    .delete()
    .eq('id', id)
    .eq('client_id', client.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'property.delete',
    targetType: 'property',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
