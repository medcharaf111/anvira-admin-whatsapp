import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/compliance/export — proxies the backend's
 * /internal/consent-log/export CSV stream for the current real-estate
 * client.
 *
 * Query params (forwarded as-is to backend):
 *   from = ISO datetime (default: 30 days ago)
 *   to   = ISO datetime (default: now)
 *
 * Filename is computed on the admin side so it reads
 *   consent-log-<client-slug>-<YYYYMMDD>.csv
 * regardless of how the backend names its streamed output.
 */
export async function GET(req: NextRequest) {
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

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'backend_not_configured' }, { status: 500 });
  }

  // Default to last 30 days when the operator hasn't filtered explicitly.
  const url = new URL(req.url);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const from = url.searchParams.get('from') ?? thirtyDaysAgo.toISOString();
  const to = url.searchParams.get('to') ?? now.toISOString();

  const backendUrl =
    `${backend}/internal/consent-log/export` +
    `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const res = await fetch(backendUrl, {
    headers: {
      'X-Internal-Secret': secret,
      'X-Client-Id': client.id,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    // Backend hasn't wired the endpoint yet — return a structured JSON
    // failure rather than a CSV download of an error body.
    const txt = await res.text().catch(() => '');
    return NextResponse.json(
      { error: 'export_failed', detail: txt.slice(0, 240) },
      { status: res.status === 404 ? 503 : res.status }
    );
  }

  // Yyyy-mm-dd from the "to" timestamp.
  const stamp = new Date(to).toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `consent-log-${client.slug}-${stamp}.csv`;

  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'compliance.export',
    targetType: 'consent_log',
    details: { from, to },
  });

  // Stream the CSV body straight through.
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
