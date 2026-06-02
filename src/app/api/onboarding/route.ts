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
  // Slice 4 / Architect Brief §1.11 — License capture as a SOFT audit
  // record. All three fields are optional (UI surfaces them only on the
  // UAE-mainland flow, but a curl-savvy operator could send them on any
  // jurisdiction — we accept and persist them either way; they only WARN,
  // never block). Empty / whitespace strings are normalized to null below
  // so license_captured_at + the audit row are armed only when at least
  // one real value was supplied.
  rera_permit_number?: string | null;
  responsible_broker_name?: string | null;
  trade_licence_number?: string | null;
}

// Mirror the client-side block so a curl-savvy operator can't bypass the
// form. Item 13: ksa_mainland is now BLOCKED at signup — the KSA regulatory
// framework (REGA/SAFIU) is not yet implemented and the UAE-only AML/goAML
// pipeline would silently mis-serve a Saudi brokerage. 'other'/DIFC/ADGM stay
// blocked for their own DP-law reasons. Only uae_mainland provisions a tenant.
const SUPPORTED_JURISDICTIONS = new Set(['uae_mainland']);
const BLOCKED_JURISDICTIONS = new Set(['ksa_mainland', 'difc', 'adgm', 'other']);

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

  // ToS acceptance is REQUIRED — the form always sends it, but a
  // curl-savvy operator could previously POST without it and end up
  // with a working account and zero audit_log evidence of consent.
  // The legal-posture addendum requires the audit row, so without a
  // valid timestamp we refuse the signup entirely (400, no DB writes).
  if (!body.tos_accepted_at || Number.isNaN(Date.parse(body.tos_accepted_at))) {
    return NextResponse.json(
      {
        error: 'tos_required',
        detail:
          'tos_accepted_at (ISO timestamp) is required. Anvira may not create accounts without recording explicit acceptance of the Terms of Service and Privacy Policy.',
      },
      { status: 400 }
    );
  }

  // Server-side jurisdiction guard. The form blocks non-uae_mainland
  // client-side but we re-check here so a curl-savvy operator can't bypass
  // it. Item 13: for ANY blocked jurisdiction we capture a ksa_waitlist lead
  // row (service-role write; the operator has no tenant yet) BEFORE returning
  // 403, and provision NOTHING.
  const jurisdiction = body.regulatory_jurisdiction ?? 'uae_mainland';
  if (BLOCKED_JURISDICTIONS.has(jurisdiction)) {
    // Capture the lead. Best-effort: a waitlist-insert failure must NOT turn
    // the 403 into a 500 or let the signup through — we log and still 403.
    const svcWait = createServiceClient();
    const { error: waitErr } = await svcWait.from('ksa_waitlist').insert({
      email: user.email ?? null,
      brokerage_name: body.name,
      slug: body.slug,
      jurisdiction,
      owner_user_id: user.id,
    });
    if (waitErr) {
      console.error('[onboarding] ksa_waitlist capture failed:', waitErr.message);
    }

    // Jurisdiction-aware copy. The KSA copy must NOT claim KSA is supported
    // (the old 'outside UAE/KSA' string did). The client form discards
    // `detail` (it throws json.error), so this is API-only documentation;
    // the operator-facing copy lives in onboarding-form.tsx.
    const detail =
      jurisdiction === 'ksa_mainland'
        ? 'Anvira does not yet support brokerages operating under the Saudi (KSA) regulatory framework (REGA/SAFIU). ' +
          'We have added you to the KSA waitlist — email legal@anviraplus.it.com to be notified at launch.'
        : 'Anvira does not currently support brokerages registered in DIFC, ADGM, or outside the UAE mainland. ' +
          'Email legal@anviraplus.it.com for the waitlist.';
    return NextResponse.json(
      { error: 'jurisdiction_blocked', detail },
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

  // Slice 4 / Architect Brief §1.11 — normalize the license inputs. Empty
  // strings come from the form when the operator skipped a field; treat
  // them as null so license_captured_at + the audit row only arm when at
  // least one real value was supplied. This is a SOFT capture — the
  // tenant is created either way; missing/expired values never block.
  const rera = (body.rera_permit_number ?? '').trim() || null;
  const broker = (body.responsible_broker_name ?? '').trim() || null;
  const tradeLic = (body.trade_licence_number ?? '').trim() || null;
  const anyLicenseFieldSupplied = rera !== null || broker !== null || tradeLic !== null;
  const licenseCapturedAt = anyLicenseFieldSupplied ? new Date().toISOString() : null;
  const dldStatus: 'pending' | null = anyLicenseFieldSupplied ? 'pending' : null;

  // Create the client. Anvira is a real-estate-brokerage-only product
  // post-pivot ([[anvira-realestate-pivot]] 2026-05-19) — every new
  // tenant gets client_type='real_estate' so the RE catalog, KYC/AML,
  // RERA forms, and recovery nav items are visible from day one. The
  // legacy 'clinic' / 'salon' enum values stay for historical rows but
  // are not exposed to fresh signups.
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
      client_type: 'real_estate',
      // PDPL Art. 25 — explicit consent is required for buyer-facing
      // outbound. Default true for brokerages so the bot enforces the
      // consent flow on first contact instead of treating it as opt-in.
      consent_required: true,
      regulatory_jurisdiction: jurisdiction,
      // Slice 4 / Architect Brief §1.11 — license capture as a SOFT audit
      // record. The DLD soft-check status starts 'pending'; the periodic
      // license-recheck cron (src/compliance/license-recheck-cron.ts on
      // the backend) flips it to 'unchecked'/'valid'/'invalid'/'error'
      // later. The bot NEVER blocks on this column.
      rera_permit_number: rera,
      responsible_broker_name: broker,
      trade_licence_number: tradeLic,
      license_captured_at: licenseCapturedAt,
      dld_validity_check_status: dldStatus,
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
  // by whom the agreement was accepted. `tos_accepted_at` is now
  // required by the validation block above, so this insert always
  // fires. Fire-and-forget — if the audit log write hiccups we still
  // return success to the operator (account is created either way),
  // but a failure here is a real compliance smell so we log loudly.
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
      console.error('[onboarding] tos audit log failed:', r.error.message);
    }
  });

  // Slice 4 / Architect Brief §1.11 — License-capture audit row. Only fires
  // when at least one license field was supplied. The DLD validity check is
  // deliberately NOT called here at onboarding time — that's the periodic
  // license-recheck cron's job (src/compliance/license-recheck-cron.ts on
  // the backend). At onboarding we only persist + audit, so the form stays
  // snappy and an unwired DLD API can't degrade the signup UX.
  if (anyLicenseFieldSupplied) {
    void svc.from('audit_log').insert({
      client_id: client.id,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_ip: actorIp,
      action: 'onboarding.license.captured',
      target_type: 'dashboard_clients',
      target_id: client.id,
      details: {
        rera_permit_number: rera,
        responsible_broker_name: broker,
        trade_licence_number: tradeLic,
        captured_at: licenseCapturedAt,
      },
    }).then((r) => {
      if (r.error) {
        console.error('[onboarding] license audit log failed:', r.error.message);
      }
    });
  }

  return NextResponse.json({ ok: true, clientId: client.id });
}
