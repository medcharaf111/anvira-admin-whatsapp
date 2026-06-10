import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// A KYC document can be up to ~20MB; Vercel's default 10s function ceiling
// could truncate a large transfer.
export const maxDuration = 30;

/**
 * GET /api/kyc/cases/:id/documents/:docId/view — the operator-facing decrypt
 * viewer (Slice 5.5). Proxies the backend's decrypt-and-serve endpoint and
 * streams the plaintext bytes to the operator's browser, which renders them in
 * the native image/PDF viewer.
 *
 * The browser only ever talks to THIS origin with its session cookie — there
 * is no token URL, nothing fetchable after logout. Decrypted bytes exist only
 * in two process memories and one TLS-protected tab.
 *
 * We STREAM the upstream body (NOT buffer it) so a >4.5MB document is not
 * killed by Vercel's serverless response-body limit.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;

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
  if (!client.kyc_enabled) {
    return NextResponse.json({ error: 'kyc_disabled' }, { status: 400 });
  }

  // Role gate. CDD review — verifying the uploaded document matches the buyer —
  // is the agents' operational job under Federal Decree-Law 10/2025, so
  // owner+admin+agent may view; viewer (read-only UI) may NOT see raw
  // government IDs. Tighten to owner+admin here if the founder prefers.
  const role = client.current_user_role;
  if (role !== 'owner' && role !== 'admin' && role !== 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
  }

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1';
  const actorIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${backend}/internal/kyc/cases/${id}/documents/${docId}/content${
        wantsDownload ? '?download=1' : ''
      }`,
      {
        headers: {
          'X-Internal-Secret': secret,
          'X-Client-Id': client.id,
          'X-Actor-User-Id': user.id,
          'X-Actor-Email': user.email ?? '',
          'X-Actor-IP': actorIp,
        },
        cache: 'no-store',
      }
    );
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }

  if (!backendRes.ok) {
    // A bare 404 with no JSON error body means the route is missing on an old
    // backend deploy; a 404 WITH a body is a genuine not-found. Same shape as
    // the report-pdf proxy's backend-not-provisioned discriminator.
    const body = await backendRes.json().catch(() => null);
    if (backendRes.status === 404 && !body) {
      return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
    }
    return NextResponse.json(body ?? { error: 'view_failed' }, { status: backendRes.status });
  }

  // The backend already wrote the authoritative fail-closed decrypt audit row.
  // This is the secondary admin-side convenience row (fire-and-forget per
  // house audit.ts) so the action shows in the operator's own audit view.
  logAction({
    clientId: client.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: 'kyc.case.document_view',
    targetType: 'kyc_documents',
    targetId: docId,
    details: { kyc_case_id: id, mode: wantsDownload ? 'download' : 'inline' },
  });

  // Stream the upstream body straight through (no arrayBuffer buffering) so the
  // Vercel 4.5MB serverless response cap does not apply. Relay the backend's
  // sniff-confirmed Content-Type + Disposition; re-assert the hardened headers
  // at the origin the browser actually sees.
  const headers = new Headers();
  headers.set(
    'Content-Type',
    backendRes.headers.get('content-type') ?? 'application/octet-stream'
  );
  const disp = backendRes.headers.get('content-disposition');
  if (disp) headers.set('Content-Disposition', disp);
  headers.set('Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  headers.set('Referrer-Policy', 'no-referrer');

  return new NextResponse(backendRes.body, { status: 200, headers });
}
