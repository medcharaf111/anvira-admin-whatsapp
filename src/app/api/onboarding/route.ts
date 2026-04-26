import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Body {
  name: string;
  slug: string;
  timezone: string;
  language: 'ar' | 'en' | 'fr';
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.name || !body?.slug) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!/^[a-z0-9-]{2,40}$/.test(body.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Check the user doesn't already have a client
  const { data: existing } = await svc
    .from('dashboard_clients')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'already_has_client' }, { status: 409 });
  }

  // Check slug is free
  const { data: slugTaken } = await svc
    .from('dashboard_clients')
    .select('id')
    .eq('slug', body.slug)
    .maybeSingle();
  if (slugTaken) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
  }

  // Create the client (no Twilio number until they upgrade to Pro)
  const { data: client, error: cErr } = await svc
    .from('dashboard_clients')
    .insert({
      slug: body.slug,
      name: body.name,
      owner_id: user.id,
      is_sandbox: false,
      business_timezone: body.timezone || 'Asia/Riyadh',
    })
    .select('id')
    .single();
  if (cErr || !client) {
    return NextResponse.json({ error: 'create_failed', detail: cErr?.message }, { status: 500 });
  }

  // Seed empty KB and default settings rows
  const [{ error: kbErr }, { error: stErr }] = await Promise.all([
    svc.from('knowledge_base').insert({
      client_id: client.id,
      business_name: body.name,
      languages: body.language,
    }),
    svc.from('settings').insert({
      client_id: client.id,
      business_timezone: body.timezone || 'Asia/Riyadh',
      business_hours: {
        sun: ['09:00', '18:00'],
        mon: ['09:00', '18:00'],
        tue: ['09:00', '18:00'],
        wed: ['09:00', '18:00'],
        thu: ['09:00', '18:00'],
        fri: null,
        sat: null,
      },
      out_of_office: false,
      default_appointment_min: 30,
    }),
  ]);
  if (kbErr || stErr) {
    return NextResponse.json(
      {
        error: 'seed_failed',
        detail: kbErr?.message ?? stErr?.message,
        clientId: client.id,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, clientId: client.id });
}
