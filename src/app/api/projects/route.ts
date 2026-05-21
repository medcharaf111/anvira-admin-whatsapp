import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ALLOWED = [
  'name',
  'developer',
  'location',
  'description',
  'total_units',
  'completion_year',
  'payment_plan_summary',
  'highlights',
  'media_folder_path',
  'status',
  'permit_number',
] as const;

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
    .from('projects')
    .select('*')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

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
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const safe: Record<string, unknown> = { client_id: client.id };
  for (const k of ALLOWED) if (body[k] !== undefined) safe[k] = body[k];

  const svc = createServiceClient();
  const { data, error } = await svc.from('projects').insert(safe).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'project.create',
    targetType: 'project',
    targetId: data.id,
  });

  return NextResponse.json({ ok: true, project: data });
}
