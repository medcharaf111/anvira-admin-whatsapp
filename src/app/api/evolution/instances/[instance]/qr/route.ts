import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/evolution/instances/[instance]/qr — streams the QR PNG.
 *
 * The admin layer never sees the QR pixels itself — it relays the
 * binary stream from the backend, preserving the original
 * `Content-Type: image/png`. The backend rotates the QR every ~30s so
 * we set short-lived no-store cache headers and let the polling state
 * endpoint (separate route) decide when to refresh the <img src>.
 *
 * RE-only, INTERNAL_SHARED_SECRET-gated.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ instance: string }> }
) {
  const { instance } = await params;
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
    return NextResponse.json(
      { error: 'backend_not_configured' },
      { status: 503 }
    );
  }

  const safeInstance = encodeURIComponent(instance);
  const res = await fetch(
    `${backend}/internal/evolution/instances/${safeInstance}/qr`,
    {
      headers: {
        'X-Internal-Secret': secret,
        'X-Client-Id': client.id,
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: `backend_${res.status}` },
      { status: res.status }
    );
  }

  // Pass-through the PNG bytes; the backend already sets Content-Type
  // but we set it explicitly so caching/CDN layers behave consistently.
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
