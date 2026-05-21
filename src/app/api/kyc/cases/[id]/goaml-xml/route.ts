import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';
import { logAction } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/kyc/cases/:id/goaml-xml — proxies the backend's goAML 4.0
 * XML export. The XML is what the brokerage uploads into the FIU
 * portal; digital signing happens on their end after upload, so we
 * just hand back the raw payload as application/xml with a
 * Content-Disposition that triggers a browser download.
 *
 * Mirrors the existing report-pdf proxy. We gate on real-estate +
 * kyc_enabled (the case's stage gating — must be ready_for_filing or
 * filed — is enforced on the backend; the UI also disables the button
 * client-side).
 */
export async function GET(
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
  if (!client.kyc_enabled) {
    return NextResponse.json({ error: 'kyc_disabled' }, { status: 400 });
  }

  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!backend || !secret) {
    return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
  }

  try {
    const res = await fetch(`${backend}/internal/kyc/cases/${id}/goaml-xml`, {
      headers: { 'X-Internal-Secret': secret, 'X-Client-Id': client.id },
      cache: 'no-store',
    });
    if (res.status === 404) {
      return NextResponse.json({ error: 'kyc_backend_not_provisioned' }, { status: 503 });
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return NextResponse.json(j, { status: res.status });
    }

    const buf = await res.arrayBuffer();
    logAction({
      clientId: client.id,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      action: 'kyc.case.goaml_xml',
      targetType: 'kyc_cases',
      targetId: id,
    });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="goaml-${id}.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
