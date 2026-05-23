import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Body {
  name: string;
  slug: string;
  timezone: string;
  language: 'ar' | 'en' | 'fr';
  // ISO timestamp from the moment the operator ticked the ToS+Privacy
  // checkbox on the onboarding form. Required per legal-posture addendum.
  tos_accepted_at?: string;
  // Per legal-posture addendum — DIFC / ADGM blocked at signup.
  regulatory_jurisdiction?:
    | 'uae_mainland'
    | 'difc'
    | 'adgm'
    | 'ksa_mainland'
    | 'other';
}

// Mirror the client-side block so a curl-savvy operator can't bypass
// the form. 'other' is also blocked because we don't have a
// regulatory-framework story for non-UAE-mainland / non-KSA tenants yet.
const SUPPORTED_JURISDICTIONS = new Set(['uae_mainland', 'ksa_mainland']);
const BLOCKED_JURISDICTIONS = new Set(['difc', 'adgm', 'other']);

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

  // Server-side jurisdiction guard. The form blocks DIFC/ADGM/other
  // client-side but we re-check here to defend against direct API calls.
  const jurisdiction = body.regulatory_jurisdiction ?? 'uae_mainland';
  if (BLOCKED_JURISDICTIONS.has(jurisdiction)) {
    return NextResponse.json(
      {
        error: 'jurisdiction_blocked',
        detail:
          'Anvira does not currently support brokerages registered in DIFC, ADGM, or outside UAE/KSA. ' +
          'Email legal@anviraplus.it.com for the waitlist.',
      },
      { status: 403 }
    );
  }
  if (!SUPPORTED_JURISDICTIONS.has(jurisdiction)) {
    return NextResponse.json(
      { error: 'invalid_jurisdiction' },
      { status: 400 }
    );
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

  // Create the client (no Twilio number until they upgrade to Pro).
  // regulatory_jurisdiction stored so the compliance module knows
  // which framework (UAE Federal PDPL vs KSA PDPL) to apply.
  const { data: client, error: cErr } = await svc
    .from('dashboard_clients')
    .insert({
      slug: body.slug,
      name: body.name,
      owner_id: user.id,
      is_sandbox: false,
      business_timezone: body.timezone || 'Asia/Riyadh',
      regulatory_jurisdiction: jurisdiction,
    })
    .select('id')
    .single();
  if (cErr || !client) {
    return NextResponse.json({ error: 'create_failed', detail: cErr?.message }, { status: 500 });
  }

  // Seed empty KB, default settings, and the owner's tenant_members row.
  // The tenant_members insert is what lets the team module + RLS
  // recognize the signup user as an active owner going forward — the
  // team migration backfilled existing tenants, this covers fresh ones.
  const [{ error: kbErr }, { error: stErr }, { error: tmErr }] = await Promise.all([
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
    svc.from('tenant_members').insert({
      client_id: client.id,
      user_id: user.id,
      role: 'owner',
      invited_by: user.id,
      accepted_at: new Date().toISOString(),
      status: 'accepted',
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
  // tenant_members failure is non-fatal: user_can_access_client() falls
  // back to dashboard_clients.owner_id so the freshly-signed-up owner
  // can still log in. Log so an operator can spot + backfill manually.
  if (tmErr) {
    console.warn(
      '[onboarding] tenant_members seed failed (non-fatal, owner_id fallback applies):',
      tmErr.message
    );
  }

  // Audit-log the ToS acceptance. Captures actor user + email + IP
  // (from the request headers) so a regulator can verify when and
  // by whom the agreement was accepted. Fire-and-forget — if audit
  // log write fails, the account is still created (we'd rather have
  // a usable account with a soft-missing audit row than a broken
  // signup flow), but we log the failure so it's recoverable later.
  if (body.tos_accepted_at) {
    const ipHeader = req.headers.get('x-forwarded-for') ?? '';
    const actorIp = ipHeader.split(',')[0]?.trim() || null;
    void svc.from('audit_log').insert({
      client_id: client.id,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_ip: actorIp,
      action: 'onboarding.tos_accepted',
      target_type: 'dashboard_clients',
      target_id: client.id,
      details: {
        tos_accepted_at: body.tos_accepted_at,
        tos_version: '2026-05-23',
        privacy_version: '2026-05-23',
        documents_referenced: ['/legal/terms', '/legal/privacy'],
      },
    }).then((r) => {
      if (r.error) {
        console.warn('[onboarding] tos audit log failed:', r.error.message);
      }
    });
  }

  return NextResponse.json({ ok: true, clientId: client.id });
}
