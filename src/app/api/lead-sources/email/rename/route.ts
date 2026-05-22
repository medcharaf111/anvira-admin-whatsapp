import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? 'inbound.anvira.com';

// Local-parts can't be these — they conflict with system mailboxes or
// existing Cloudflare Email Routing rules the operator may have set up
// (hello@, support@, etc. typically forward to the broker's personal inbox).
const RESERVED_SLUGS = new Set([
  'admin',
  'hello',
  'help',
  'info',
  'mail',
  'noreply',
  'no-reply',
  'operator',
  'postmaster',
  'root',
  'support',
  'abuse',
  'webmaster',
  'leads', // the legacy random format starts with "leads-" — keep prefix free
  'anvira',
]);

// 3-32 chars, lowercase alphanumeric + hyphens, must start/end alphanumeric.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * POST /api/lead-sources/email/rename
 * Body: { slug: string }
 *
 * Renames the operator's inbound email local-part. Allows real-estate
 * brokerages to swap the auto-generated `leads-<24hex>` token for a
 * memorable slug like `marina-leads` so they can paste it into portal
 * forwarding configs without it looking like a CRC string.
 *
 * Uniqueness is enforced across `dashboard_clients.inbound_email_token`
 * — same column as the random tokens, since the backend resolves the
 * tenant by exact match on that field regardless of format.
 *
 * Security note: vanity slugs are inherently guessable. Anyone who
 * knows the slug can email there and seed a fake lead. The mitigations
 * are: (1) the bot's consent_pending state means the first reply is a
 * harmless opt-in prompt; (2) per-customer rate limiting caps abuse
 * volume; (3) the broker would paste this address into portal forwarding
 * anyway — it's effectively public.
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

  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = (body?.slug ?? '').trim().toLowerCase();

  if (!slug) {
    return NextResponse.json({ error: 'slug_required' }, { status: 400 });
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'invalid_format' }, { status: 400 });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ error: 'reserved' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Uniqueness check — ignore THIS tenant's existing token so renaming
  // to the same value is a no-op rather than a 409.
  const { data: collision } = await svc
    .from('dashboard_clients')
    .select('id')
    .eq('inbound_email_token', slug)
    .neq('id', client.id)
    .limit(1)
    .maybeSingle();
  if (collision) {
    return NextResponse.json({ error: 'taken' }, { status: 409 });
  }

  const { error } = await svc
    .from('dashboard_clients')
    .update({ inbound_email_token: slug })
    .eq('id', client.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate backend's in-memory client cache so the new slug routes
  // immediately on the next inbound email. Best-effort — if the backend
  // call fails, the cache will reload naturally within 60s anyway.
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
    action: 'lead_source.email.rename',
    targetType: 'dashboard_clients',
    targetId: client.id,
    details: { new_slug: slug },
  });

  return NextResponse.json({
    inbound_email_token: slug,
    full_address: `${slug}@${INBOUND_DOMAIN}`,
  });
}
