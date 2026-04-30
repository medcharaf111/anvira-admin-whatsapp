import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/operator';
import { createServiceClient } from '@/lib/supabase/server';

interface NewClientBody {
  email: string;
  password: string;
  business_name: string;
  slug: string;
  language: 'ar' | 'en' | 'fr';
  timezone: string;
  plan: 'starter' | 'pro' | 'business';
}

export async function POST(req: Request) {
  await requireOperator();

  const body = (await req.json().catch(() => null)) as Partial<NewClientBody> | null;
  if (
    !body?.email ||
    !body?.password ||
    !body?.business_name ||
    !body?.slug ||
    !body?.language ||
    !body?.timezone ||
    !body?.plan
  ) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!/^[a-z0-9-]{2,40}$/.test(body.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Check slug isn't taken
  const { data: slugTaken } = await svc
    .from('dashboard_clients')
    .select('id')
    .eq('slug', body.slug)
    .maybeSingle();
  if (slugTaken) {
    return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
  }

  // Create the auth user (auto-confirm so they can log in immediately)
  const { data: created, error: uErr } = await svc.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (uErr || !created.user) {
    return NextResponse.json(
      { error: 'auth_create_failed', detail: uErr?.message },
      { status: 500 }
    );
  }
  const userId = created.user.id;

  // Insert the client row owned by the new user
  const { data: client, error: cErr } = await svc
    .from('dashboard_clients')
    .insert({
      slug: body.slug,
      name: body.business_name,
      owner_id: userId,
      is_sandbox: false,
      business_timezone: body.timezone,
      plan: body.plan,
      subscription_status: 'trial',
    })
    .select('id')
    .single();
  if (cErr || !client) {
    // Best-effort cleanup of the orphaned auth user
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: 'client_create_failed', detail: cErr?.message },
      { status: 500 }
    );
  }

  // Seed empty KB and default settings rows
  const [{ error: kbErr }, { error: stErr }] = await Promise.all([
    svc.from('knowledge_base').insert({
      client_id: client.id,
      business_name: body.business_name,
      languages: body.language,
    }),
    svc.from('settings').insert({
      client_id: client.id,
      business_timezone: body.timezone,
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

  return NextResponse.json({ ok: true, clientId: client.id, userId });
}
